// backend/src/modules/membership/lifecycle/membership-lifecycle.service.ts
//
// MEM-006 seven-state lifecycle machine (spec 02.5). "No lifecycle
// simplification is authorised" -- all seven states implemented, no
// merged/removed/bypassed states: PENDING, APPROVED, ACTIVE, SUSPENDED,
// EXPIRED, TERMINATED, REJECTED.
//
// MEM-007: activate() assigns a permanent membership number immediately at
// APPROVED → ACTIVE via MembershipNumberingService.assignPermanentNumber().
// Historical members (serials 1–52) received their numbers via migration 0078.
// All future activations draw sequentially from the pool (serial 53+).
// No other method in this service ever touches number_serial /
// membership_number — that is MembershipNumberingService's exclusive domain.
//
// OPEN GAP, not silently resolved: renewal-period-per-class and
// grace-period-per-class (spec 02.8) aren't configured anywhere in the
// schema yet. activate()/renewFromExpired() leave expires_at as either
// caller-supplied or null -- they do NOT invent a default renewal period.
// Flag this before relying on automatic EXPIRED transitions in production.
//
// Similarly, markExpired() exists to be CALLED (by a coordinator now, by a
// scheduled job later) -- it does not run itself on any schedule. No cron
// infra decision has been made (RAM-conscious, deliberately deferred).

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Selectable } from 'kysely';
import { db, MembershipsTable } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

type LifecycleState = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED' | 'REJECTED';
type MembershipRow = Selectable<MembershipsTable>;

export interface ApplyMembershipParams {
  ownerType: 'INDIVIDUAL' | 'GROUP';
  // INDIVIDUAL -> membershipClassId required; GROUP -> groupMembershipTypeId
  // required (Option B separation, migration 0026). Cross-validated in
  // apply(), hard-enforced by chk_membership_owner_axis at the DB layer.
  membershipClassId?: number | null;
  groupMembershipTypeId?: number | null;
  userId?: number | null;
  groupEntityId?: number | null;
}

@Injectable()
export class MembershipLifecycleService {
  constructor(
    private readonly numberingService: MembershipNumberingService,
    private readonly communicationService: CommunicationService,
    private readonly entitlementService: EntitlementService,
    private readonly financialService: FinancialContributionService,
  ) {}

  // Renewal policy (confirmed this session): renewable classes carry
  // renewal_term_months / grace_period_days in class_entitlements (layer 1
  // only -- see EntitlementService.getClassConfigValue). Lifetime classes
  // get expires_at = null. A renewable class MISSING its config is treated
  // as a loud error, not silently perpetual.
  private async computeExpiry(
    membership: Pick<MembershipRow, 'owner_type' | 'membership_class_id' | 'group_membership_type_id'>,
    from: Date,
  ): Promise<string | null> {
    let isRenewable: boolean;
    let isLifetime: boolean;
    let holderName: string;
    let termRaw: string | null;
    let fixHint: string;

    if (membership.owner_type === 'GROUP') {
      if (membership.group_membership_type_id == null) {
        throw new ConflictException('GROUP membership row has no group_membership_type_id -- data violates the 0026 owner-axis rule.');
      }
      const gt = await db
        .selectFrom('group_membership_types')
        .select(['is_renewable', 'name'])
        .where('id', '=', membership.group_membership_type_id)
        .executeTakeFirstOrThrow();
      isRenewable = !!gt.is_renewable;
      isLifetime = false; // no lifetime group types exist; a column can be added if governance ever creates one
      holderName = gt.name;
      termRaw = await this.entitlementService.getGroupTypeConfigValue(
        membership.group_membership_type_id,
        'renewal_term_months',
      );
      fixHint = 'Configure renewal_term_months for this group membership type via the group entitlements management endpoint.';
    } else {
      if (membership.membership_class_id == null) {
        throw new ConflictException('INDIVIDUAL membership row has no membership_class_id -- data violates the 0026 owner-axis rule.');
      }
      const cls = await db
        .selectFrom('membership_classes')
        .select(['is_renewable', 'is_lifetime', 'name'])
        .where('id', '=', membership.membership_class_id)
        .executeTakeFirstOrThrow();
      isRenewable = !!cls.is_renewable;
      isLifetime = !!cls.is_lifetime;
      holderName = cls.name;
      termRaw = await this.entitlementService.getClassConfigValue(membership.membership_class_id, 'renewal_term_months');
      fixHint = 'Verify that database migration 0068 has been applied. If already applied, configure renewal_term_months via the class entitlements management endpoint.';
    }

    if (isLifetime || !isRenewable) return null;

    if (!termRaw) {
      throw new ConflictException(
        `Membership configuration is incomplete: "${holderName}" is renewable but renewal_term_months is not set in class_entitlements. ${fixHint}`,
      );
    }
    const months = parseInt(termRaw, 10);
    const expiry = new Date(from);
    expiry.setMonth(expiry.getMonth() + months);
    return toMysqlDatetime(expiry);
  }

  private async gracePeriodDays(
    membership: Pick<MembershipRow, 'owner_type' | 'membership_class_id' | 'group_membership_type_id'>,
  ): Promise<number> {
    const raw =
      membership.owner_type === 'GROUP' && membership.group_membership_type_id != null
        ? await this.entitlementService.getGroupTypeConfigValue(membership.group_membership_type_id, 'grace_period_days')
        : membership.membership_class_id != null
          ? await this.entitlementService.getClassConfigValue(membership.membership_class_id, 'grace_period_days')
          : null;
    return raw ? parseInt(raw, 10) : 0;
  }

  // ======================================================================
  // -> PENDING
  // ======================================================================
  async apply(params: ApplyMembershipParams): Promise<{ id: number; uuid: string }> {
    if (params.ownerType === 'INDIVIDUAL') {
      if (!params.userId) throw new BadRequestException('userId is required for an INDIVIDUAL membership application.');
      if (!params.membershipClassId) {
        throw new BadRequestException('membershipClassId is required for an INDIVIDUAL membership application.');
      }
      if (params.groupMembershipTypeId) {
        throw new BadRequestException('groupMembershipTypeId is not valid for an INDIVIDUAL application -- group types are not membership classes (MEM-006).');
      }
    }
    if (params.ownerType === 'GROUP') {
      if (!params.groupEntityId) throw new BadRequestException('groupEntityId is required for a GROUP membership application.');
      if (!params.groupMembershipTypeId) {
        throw new BadRequestException('groupMembershipTypeId is required for a GROUP membership application.');
      }
      if (params.membershipClassId) {
        throw new BadRequestException('membershipClassId is not valid for a GROUP application -- group memberships are not membership classes (MEM-006).');
      }
    }

    if (params.ownerType === 'INDIVIDUAL') {
      const membershipClass = await db
        .selectFrom('membership_classes')
        .selectAll()
        .where('id', '=', params.membershipClassId!)
        .executeTakeFirst();
      if (!membershipClass) throw new NotFoundException('Membership class not found.');

      // MEM-006: "No new Founding Members may be created... System rejects
      // any creation attempt." is_closed is currently TRUE only for
      // FOUNDING_MEMBER, but this check is written against the flag, not the
      // code, so it stays correct if a future constitutional amendment closes
      // another class.
      if (membershipClass.is_closed) {
        throw new ForbiddenException(
          `${membershipClass.name} is a closed constitutional class. No new applications are accepted.`,
        );
      }

      const existingOpen = await db
        .selectFrom('memberships')
        .select('id')
        .where('user_id', '=', params.userId!)
        .where('lifecycle_state', 'in', ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'])
        .executeTakeFirst();
      if (existingOpen) {
        throw new ConflictException('This user already has an open or active membership record.');
      }
    } else {
      const groupType = await db
        .selectFrom('group_membership_types')
        .selectAll()
        .where('id', '=', params.groupMembershipTypeId!)
        .executeTakeFirst();
      if (!groupType) throw new NotFoundException('Group membership type not found.');

      const groupEntity = await db
        .selectFrom('group_entities')
        .select(['id', 'type'])
        .where('id', '=', params.groupEntityId!)
        .executeTakeFirst();
      if (!groupEntity) throw new NotFoundException('Group entity not found.');

      // A FAMILY entity cannot apply for Corporate Membership etc. --
      // group_membership_types.entity_type binds each type to its entity kind.
      if (groupEntity.type !== groupType.entity_type) {
        throw new BadRequestException(
          `A ${groupEntity.type} entity cannot apply for ${groupType.name} (requires a ${groupType.entity_type} entity).`,
        );
      }

      const existingOpen = await db
        .selectFrom('memberships')
        .select('id')
        .where('group_entity_id', '=', params.groupEntityId!)
        .where('lifecycle_state', 'in', ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'])
        .executeTakeFirst();
      if (existingOpen) {
        throw new ConflictException('This group entity already has an open or active membership record.');
      }
    }

    const uuid = randomUUID();
    const now = toMysqlDatetime(new Date());

    const inserted = await db
      .insertInto('memberships')
      .values({
        uuid,
        owner_type: params.ownerType,
        user_id: params.ownerType === 'INDIVIDUAL' ? params.userId! : null,
        group_entity_id: params.ownerType === 'GROUP' ? params.groupEntityId! : null,
        membership_class_id: params.ownerType === 'INDIVIDUAL' ? params.membershipClassId! : null,
        group_membership_type_id: params.ownerType === 'GROUP' ? params.groupMembershipTypeId! : null,
        lifecycle_state: 'PENDING',
        applied_at: now,
      })
      .executeTakeFirstOrThrow();

    const id = Number(inserted.insertId);

    await logMembershipAudit({
      membershipId: id,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'SYSTEM',
      newValue: { state: 'PENDING' },
    });

    // Financial reconciliation (workflow-ordering fix): for a PAYMENT_REQUIRED
    // class, the financial obligation is created NOW, while the application is
    // still PENDING -- not at approval time. Administrative approval is the
    // FINAL admission decision and must happen only once payment is already
    // COMPLETED (see approve() below). AUTO_AFTER_APPROVAL/MANUAL classes and
    // GROUP applications are untouched -- see createApplicationContribution().
    if (params.ownerType === 'INDIVIDUAL' && params.membershipClassId != null) {
      await this.createApplicationContribution(id, params.membershipClassId, params.userId!);
    }

    return { id, uuid };
  }

  // ======================================================================
  // Creates the Financial Contribution for a freshly-PENDING INDIVIDUAL
  // application/renewal, if (and only if) its class is PAYMENT_REQUIRED.
  // Called once, right after the PENDING row is inserted -- by apply() above
  // and by HubMembershipService's self-service submitApplication()/
  // submitRenewal() (which insert their own PENDING row directly).
  //
  // AUTO_AFTER_APPROVAL and MANUAL classes get no Contribution here -- that
  // preserves their existing legitimate behaviour (activation happens at
  // admin approval with no financial obligation involved at all).
  //
  // Mirrors the amount computation that used to live in approve(): fee_inr
  // is the sole authoritative pricing source (class_entitlements, via
  // EntitlementService) -- never hard-coded here or anywhere else.
  //
  // Does NOT call startSettlement()/initiateProviderSettlement() -- a
  // positive-value Contribution is left at AWAITING_SETTLEMENT; the member
  // must explicitly initiate payment from the Hub payment screen (PART 3).
  // A zero-value Contribution completes immediately via the existing PAY-001
  // §12 zero-value path, exactly as it already did inside the old approve().
  async createApplicationContribution(
    membershipId: number,
    membershipClassId: number,
    payerUserId: number,
  ): Promise<void> {
    const cls = await db
      .selectFrom('membership_classes')
      .select('activation_mode')
      .where('id', '=', membershipClassId)
      .executeTakeFirst();

    if (cls?.activation_mode !== 'PAYMENT_REQUIRED') return;

    const feeInrRaw = await this.entitlementService.getClassConfigValue(membershipClassId, 'fee_inr');
    const amountPaise = feeInrRaw ? Math.round(parseFloat(feeInrRaw) * 100) : 0;

    const idempotencyKey = `MEMBERSHIP-${membershipId}-CONTRIBUTION`;
    const { id: contributionId } = await this.financialService.createContribution({
      payerUserId,
      businessModule: 'MEMBERSHIP',
      businessReferenceId: membershipId,
      purpose: 'Membership fee',
      amountPaise,
      idempotencyKey,
    });

    await db
      .updateTable('memberships')
      .set({ pending_contribution_id: contributionId })
      .where('id', '=', membershipId)
      .execute();

    if (amountPaise === 0) {
      // Zero-value path (PAY-001 §12): completes immediately without a
      // Settlement Provider. The Contribution reaches COMPLETED, but the
      // Membership itself remains PENDING until an administrator approves
      // it -- financial completion never activates Membership (PART 4).
      await this.financialService.processZeroValueContribution(contributionId);
    } else {
      // Positive-value path: made payable, but NOT yet SETTLEMENT_IN_PROGRESS
      // -- a Razorpay order is only ever created when the member explicitly
      // clicks "Pay" on the payment screen (PART 3), never automatically here.
      await this.financialService.transitionContribution(contributionId, 'AWAITING_SETTLEMENT');
    }
  }

  // ======================================================================
  // Resolves the Financial Contribution associated with a membership
  // application, if any -- used by approve() to verify the financial
  // precondition and by reject() to decide whether a refund/cancellation is
  // owed. Looked up by (business_module, business_reference_id) rather than
  // trusting the nullable pending_contribution_id column, which
  // recordPaymentFailure() clears on SETTLEMENT_FAILED even though the
  // Contribution itself remains valid (same reasoning as
  // HubMembershipService.getPendingPayment(), Step 20).
  private async getMembershipContribution(membershipId: number) {
    return this.financialService.findLatestForBusinessReference('MEMBERSHIP', membershipId);
  }

  // ======================================================================
  // PENDING -> APPROVED -> ACTIVE
  //
  // Administrative approval is the FINAL membership admission decision
  // (workflow-ordering fix). The final settled state depends on
  // membership_classes.activation_mode:
  //   AUTO_AFTER_APPROVAL  -> APPROVED is transient; activate() fires
  //                           immediately and this method returns 'ACTIVE'.
  //                           No financial obligation is involved at all.
  //   PAYMENT_REQUIRED     -> the Financial Contribution was already created
  //                           at application/renewal submission time (see
  //                           createApplicationContribution()). Approval is
  //                           REFUSED unless that Contribution has already
  //                           reached COMPLETED -- checked and enforced
  //                           BEFORE any state is written, so a rejected
  //                           precondition never leaves the membership
  //                           stranded mid-transition. Once COMPLETED is
  //                           confirmed, APPROVED -> ACTIVE happens in the
  //                           same operation, exactly like AUTO_AFTER_APPROVAL.
  //                           Settlement-method agnostic: this only ever
  //                           checks contribution.state, never which
  //                           Settlement Provider (or manual evidence path)
  //                           produced it (PART 8).
  //   MANUAL               -> stays APPROVED; MEMBERSHIP_APPLICATION_APPROVED
  //                           is sent; admin explicitly calls activate().
  //   GROUP / no class     -> stays APPROVED (no activation_mode defined for
  //                           group types yet; conservative default).
  // ======================================================================
  async approve(
    membershipId: number,
    actorUserId: number,
  ): Promise<{ finalState: 'APPROVED' | 'ACTIVE' }> {
    const membership = await this.requireState(membershipId, ['PENDING']);

    const cls = membership.membership_class_id != null
      ? await db
          .selectFrom('membership_classes')
          .select('activation_mode')
          .where('id', '=', membership.membership_class_id)
          .executeTakeFirst()
      : null;

    // Financial precondition checked and enforced BEFORE any state write --
    // an unpaid/incomplete application must never be moved to APPROVED at
    // all, not even transiently (PART 5: "reject the approval operation").
    if (cls?.activation_mode === 'PAYMENT_REQUIRED') {
      const contribution = await this.getMembershipContribution(membershipId);
      if (!contribution || contribution.state !== 'COMPLETED') {
        throw new ConflictException(
          `Membership ${membershipId} cannot be approved: its Financial Contribution is ` +
          `${contribution ? `in state '${contribution.state}'` : 'missing'}; approval requires COMPLETED.`,
        );
      }
    }

    await db
      .updateTable('memberships')
      .set({ lifecycle_state: 'APPROVED', approved_at: toMysqlDatetime(new Date()) })
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { state: membership.lifecycle_state },
      newValue: { state: 'APPROVED' },
    });

    if (cls?.activation_mode === 'AUTO_AFTER_APPROVAL' || cls?.activation_mode === 'PAYMENT_REQUIRED') {
      // Both branches activate immediately from here: AUTO_AFTER_APPROVAL
      // because there was never a financial obligation, PAYMENT_REQUIRED
      // because the financial precondition above already confirmed COMPLETED.
      // MEMBERSHIP_APPLICATION_APPROVED is suppressed for both -- the member
      // is activated in the same operation, so "pending review" copy would
      // be wrong; MEMBERSHIP_ACTIVATED fires via activate().
      await this.activate(membershipId, { type: 'ADMIN', userId: actorUserId });
      return { finalState: 'ACTIVE' };
    }

    await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_APPROVED');
    return { finalState: 'APPROVED' };
  }

  // ======================================================================
  // PENDING -> REJECTED
  //
  // If a Financial Contribution exists for this application (PAYMENT_REQUIRED
  // class), its resolution depends on how far payment progressed:
  //   COMPLETED                    -> a refund is owed (PART 6/7). Membership
  //                                   decides the refund is owed; the
  //                                   Financial Engine processes it
  //                                   (requestRefund() is itself idempotent --
  //                                   a duplicate rejection never double-refunds).
  //   CREATED / AWAITING_SETTLEMENT -> no money has moved; the Contribution is
  //                                   cancelled so it can never be paid
  //                                   against a REJECTED application.
  //   anything else                 -> left as-is (e.g. SETTLEMENT_IN_PROGRESS
  //                                   mid-checkout, or already FAILED/ABANDONED)
  //                                   -- no new capability is invented here for
  //                                   those narrower cases.
  // The Contribution is resolved BEFORE the membership is flipped to
  // REJECTED so a crash between the two never leaves the rejection recorded
  // with an un-actioned Contribution silently forgotten.
  // ======================================================================
  async reject(membershipId: number, actorUserId: number, reason: string): Promise<void> {
    const membership = await this.requireState(membershipId, ['PENDING']);

    const contribution = await this.getMembershipContribution(membershipId);
    if (contribution) {
      if (contribution.state === 'COMPLETED') {
        await this.financialService
          .requestRefund(Number(contribution.id), reason, actorUserId)
          .catch(() => {
            // requestRefund() already records its own FAILED refund row on a
            // provider error rather than throwing; this guards only against
            // a genuinely unexpected failure so rejection always completes
            // (PART 7: rejection must never be blocked by a transient
            // provider outage -- the refund row remains for follow-up).
          });
      } else if (contribution.state === 'CREATED' || contribution.state === 'AWAITING_SETTLEMENT') {
        await this.financialService
          .cancelContribution(Number(contribution.id), `Membership application rejected: ${reason}`)
          .catch(() => {});
      }
    }

    await db.updateTable('memberships').set({ lifecycle_state: 'REJECTED' }).where('id', '=', membershipId).execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { state: membership.lifecycle_state },
      newValue: { state: 'REJECTED' },
      notes: reason,
    });

    await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_REJECTED', {
      rejection_reason: reason,
    });
  }

  // ======================================================================
  // APPROVED -> ACTIVE
  //
  // MEM-007 MP-004: assigns a permanent sequential membership number
  // atomically within the same transaction as the lifecycle transition.
  // joinYear / joinMonth default to the current calendar date when not
  // supplied; callers may override for administrative back-dating.
  // ======================================================================
  async activate(
    membershipId: number,
    actor: { type: 'SYSTEM' | 'ADMIN'; userId?: number | null },
    opts?: { paymentId?: number | null; joinYear?: number; joinMonth?: number },
  ): Promise<{ membershipNumber: string }> {
    const membership = await this.requireState(membershipId, ['APPROVED']);

    const now = new Date();
    const joinYear  = opts?.joinYear  ?? now.getFullYear();
    const joinMonth = opts?.joinMonth ?? (now.getMonth() + 1);

    const expiresAt = await this.computeExpiry(membership, now);

    const { membershipNumber } = await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({
          lifecycle_state: 'ACTIVE',
          activated_at: toMysqlDatetime(now),
          expires_at: expiresAt,
          last_payment_status: opts?.paymentId ? 'SUCCEEDED' : 'NONE',
          pending_contribution_id: null,
        })
        .where('id', '=', membershipId)
        .execute();

      return this.numberingService.assignPermanentNumber(trx, membershipId, joinYear, joinMonth);
    });

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: actor.type,
      actorUserId: actor.userId ?? null,
      oldValue: { state: membership.lifecycle_state },
      newValue: { state: 'ACTIVE', membershipNumber },
    });

    const refreshed = await this.getOrThrow(membershipId);

    // Constitutional classes (voting_eligible = true: Full/Life/Patron/Founding)
    // receive CONSTITUTIONAL_MEMBERSHIP_APPROVED which includes voting-rights
    // context; all others receive the standard MEMBERSHIP_ACTIVATED.
    let notifyTypeKey = 'MEMBERSHIP_ACTIVATED';
    let extraNotifyVars: Record<string, string> = {
      membership_number: membershipNumber,
      expiry_date: refreshed.expires_at
        ? new Date(refreshed.expires_at as unknown as string)
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'see member portal',
    };

    if (refreshed.membership_class_id != null) {
      const cls = await db
        .selectFrom('membership_classes')
        .select(['voting_eligible', 'name'])
        .where('id', '=', refreshed.membership_class_id)
        .executeTakeFirst();
      if (cls?.voting_eligible) {
        notifyTypeKey = 'CONSTITUTIONAL_MEMBERSHIP_APPROVED';
        extraNotifyVars = {
          membership_type: cls.name,
          membership_number: membershipNumber,
          valid_from: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
          benefits: 'Voting rights, governance participation, all member benefits',
          portal_link: 'https://v3bcc.bhopal.info/hub/',
        };
      }
    }

    await this.notifyMember(refreshed, notifyTypeKey, extraNotifyVars, { actionUrl: '/member' });

    return { membershipNumber };
  }

  // ======================================================================
  // PENDING -- payment failure (stays PENDING; MEM-007: no number assignment
  // happens on this path). Under the reconciled workflow, the Financial
  // Contribution is created and settled while the application is still
  // PENDING (before admin approval) -- so a settlement failure is now always
  // observed against a PENDING membership, not an APPROVED one.
  //
  // failedAmountPaise: supplied by MembershipFinancialListener from the
  // Financial Engine event payload (no direct financial table query needed).
  // When called from the admin endpoint without an amount, the notification
  // omits the amount variable.
  // ======================================================================
  async recordPaymentFailure(membershipId: number, failedAmountPaise?: number, notes?: string): Promise<void> {
    const membership = await this.requireState(membershipId, ['PENDING']);

    await db
      .updateTable('memberships')
      .set({ last_payment_status: 'FAILED', pending_contribution_id: null })
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'PAYMENT_FAILED',
      actorType: 'SYSTEM',
      notes: notes ?? null,
    });

    const failedAmount = failedAmountPaise != null
      ? String(Math.round(failedAmountPaise / 100))
      : '';
    await this.notifyMember(membership, 'PAYMENT_FAILED', {
      amount: failedAmount,
    });
  }

  // ======================================================================
  // PENDING -- payment received (stays PENDING; workflow-ordering fix, PART 4)
  //
  // Called by MembershipFinancialListener on CONTRIBUTION_COMPLETED. This
  // method MUST NOT activate the membership, allocate a membership number,
  // or transition lifecycle_state in any way -- financial completion is no
  // longer sufficient for admission; only administrative approve() is. It
  // exists purely to record the payment-received milestone and let the
  // member/admin know the application is now eligible for final review.
  // ======================================================================
  async recordPaymentReceived(membershipId: number): Promise<void> {
    const membership = await this.requireState(membershipId, ['PENDING']);

    await logMembershipAudit({
      membershipId,
      eventType: 'PAYMENT_RECEIVED',
      actorType: 'SYSTEM',
    });

    await this.notifyMember(membership, 'MEMBERSHIP_PAYMENT_RECEIVED');
  }

  // ======================================================================
  // ACTIVE -> SUSPENDED  (mandatory reason)
  // ======================================================================
  async suspend(membershipId: number, actorUserId: number, reason: string): Promise<void> {
    const membership = await this.requireState(membershipId, ['ACTIVE']);

    await db.updateTable('memberships').set({ lifecycle_state: 'SUSPENDED' }).where('id', '=', membershipId).execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { state: 'ACTIVE' },
      newValue: { state: 'SUSPENDED' },
      notes: reason,
    });

    await this.notifyMember(membership, 'MEMBERSHIP_SUSPENDED');
  }

  // ======================================================================
  // SUSPENDED -> ACTIVE
  // ======================================================================
  async reinstate(membershipId: number, actorUserId: number): Promise<void> {
    const membership = await this.requireState(membershipId, ['SUSPENDED']);

    await db.updateTable('memberships').set({ lifecycle_state: 'ACTIVE' }).where('id', '=', membershipId).execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { state: 'SUSPENDED' },
      newValue: { state: 'ACTIVE' },
    });

    await this.notifyMember(membership, 'MEMBERSHIP_REINSTATED');
  }

  // ======================================================================
  // ACTIVE -> EXPIRED
  // Spec: "System (scheduled job)" on renewal deadline. See file header --
  // no scheduler wired yet. Callable manually by a coordinator meanwhile,
  // and by a future cron once one exists.
  // ======================================================================
  async markExpired(membershipId: number, actor: { type: 'SYSTEM' | 'ADMIN'; userId?: number | null }): Promise<void> {
    const membership = await this.requireState(membershipId, ['ACTIVE']);

    // Preserve the original expires_at -- it anchors the grace-period
    // calculation in renewFromExpired. Only backfill with NOW when the
    // record never had a deadline (pre-renewal-engine activations).
    await db
      .updateTable('memberships')
      .set(
        membership.expires_at
          ? { lifecycle_state: 'EXPIRED' }
          : { lifecycle_state: 'EXPIRED', expires_at: toMysqlDatetime(new Date()) },
      )
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: actor.type,
      actorUserId: actor.userId ?? null,
      oldValue: { state: 'ACTIVE' },
      newValue: { state: 'EXPIRED' },
    });

    const graceDays = await this.gracePeriodDays(membership).catch(() => 0);
    const expiryDisplay = membership.expires_at
      ? new Date(membership.expires_at as unknown as string)
          .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    await this.notifyMember(membership, 'MEMBERSHIP_EXPIRED', {
      expiry_date: expiryDisplay,
      grace_days: String(graceDays),
    });
  }

  // ======================================================================
  // EXPIRED -> ACTIVE  (renewal -- membership_number is NEVER reassigned,
  // MP-001. Same number, new active period.)
  // ======================================================================
  async renewFromExpired(
    membershipId: number,
    actorUserId: number | null,
    actorType: 'SYSTEM' | 'ADMIN' | 'MEMBER' = 'ADMIN',
  ): Promise<void> {
    const membership = await this.requireState(membershipId, ['EXPIRED']);

    // Grace-period enforcement. INTERPRETATION FLAG: spec 02.8 defines a
    // grace period but does not spell out what happens after it lapses; the
    // reading implemented here is renew-within-grace, re-apply-after-grace.
    // Beyond-grace renewal is therefore blocked with a clear message rather
    // than silently allowed forever.
    if (membership.expires_at) {
      const graceDays = await this.gracePeriodDays(membership);
      const graceEnd = new Date(membership.expires_at);
      graceEnd.setDate(graceEnd.getDate() + graceDays);
      if (new Date() > graceEnd) {
        throw new ConflictException(
          `The ${graceDays}-day renewal grace period ended on ${graceEnd.toISOString().slice(0, 10)}. A new membership application is required.`,
        );
      }
    }

    const newExpiry = await this.computeExpiry(membership, new Date());

    await db
      .updateTable('memberships')
      .set({ lifecycle_state: 'ACTIVE', expires_at: newExpiry, last_payment_status: 'SUCCEEDED' })
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType,
      actorUserId,
      oldValue: { state: 'EXPIRED' },
      newValue: { state: 'ACTIVE', note: 'renewal' },
    });

    await this.notifyMember(membership, 'MEMBERSHIP_RENEWED', {
      membership_number: membership.membership_number ?? '',
    });
  }

  // ======================================================================
  // ANY (non-terminal) -> TERMINATED  (mandatory reason, governance action)
  // ======================================================================
  async terminate(membershipId: number, actorUserId: number, reason: string): Promise<void> {
    const membership = await this.getOrThrow(membershipId);

    if (membership.lifecycle_state === 'TERMINATED') {
      throw new ConflictException('Membership is already terminated.');
    }
    if (membership.lifecycle_state === 'REJECTED') {
      throw new ConflictException('A rejected application cannot be terminated -- there is no membership to terminate.');
    }

    await db
      .updateTable('memberships')
      .set({ lifecycle_state: 'TERMINATED', terminated_at: toMysqlDatetime(new Date()) })
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { state: membership.lifecycle_state },
      newValue: { state: 'TERMINATED' },
      notes: reason,
    });

    await this.notifyMember(membership, 'MEMBERSHIP_TERMINATED');
  }

  // ======================================================================
  // Admin: resend activation notification for SQL-activated memberships
  // Used when a membership was activated via direct SQL migration (e.g. 0080)
  // rather than through the lifecycle.activate() API path, which means the
  // MEMBERSHIP_ACTIVATED notification was never dispatched automatically.
  // ======================================================================
  async resendActivationNotification(membershipId: number): Promise<void> {
    const membership = await this.requireState(membershipId, ['ACTIVE']);
    if (!membership.membership_number) {
      throw new ConflictException(
        'Cannot send activation notification: membership has no permanent number assigned.',
      );
    }
    await this.notifyMember(membership, 'MEMBERSHIP_ACTIVATED', {
      membership_number: membership.membership_number,
      expiry_date: membership.expires_at
        ? new Date(membership.expires_at as unknown as string)
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'see member portal',
    }, { actionUrl: '/member' });
  }

  // ======================================================================
  // ACTIVE: class change (upgrade / downgrade)
  //
  // Both operations mutate membership_class_id on an ACTIVE individual
  // membership. The entitlement engine re-resolves from the new class
  // automatically at next read -- no entitlement rows need touching.
  //
  // expires_at is recomputed from the new class's renewal_term_months so
  // a class change to Biennial correctly extends the validity window.
  // The old expiry is preserved in the audit log.
  //
  // Constitutional protection: FOUNDING_MEMBER is is_closed=TRUE so
  // downgrading INTO it is blocked by the same is_closed guard used in
  // apply(). Downgrading FROM a constitutional class is allowed; admins
  // own that governance decision.
  // ======================================================================
  async changeClass(
    membershipId: number,
    newClassId: number,
    direction: 'UPGRADE' | 'DOWNGRADE',
    reason: string,
    actorUserId: number,
  ): Promise<void> {
    const membership = await this.requireState(membershipId, ['ACTIVE']);

    if (membership.owner_type !== 'INDIVIDUAL') {
      throw new BadRequestException('Class change is only supported for INDIVIDUAL memberships.');
    }
    if (membership.membership_class_id === newClassId) {
      throw new ConflictException('The membership is already in the requested class.');
    }

    const newClass = await db
      .selectFrom('membership_classes')
      .select(['id', 'code', 'name', 'is_closed', 'is_lifetime', 'is_renewable'])
      .where('id', '=', newClassId)
      .executeTakeFirst();
    if (!newClass) throw new NotFoundException('Target membership class not found.');
    // LEGACY_MEMBER is is_closed=TRUE to block self-apply, but admin class-change
    // IS the canonical path for grandfathering existing members as Legacy. All
    // other closed classes (FOUNDING_MEMBER) remain unconditionally blocked.
    if (newClass.is_closed && newClass.code !== 'LEGACY_MEMBER') {
      throw new ForbiddenException(`${newClass.name} is a closed constitutional class; no members can be moved into it.`);
    }

    const oldClass = await db
      .selectFrom('membership_classes')
      .select('name')
      .where('id', '=', membership.membership_class_id!)
      .executeTakeFirst();
    const oldClassName = oldClass?.name ?? '';

    // Recompute expiry for the new class so biennial upgrades extend correctly.
    const newExpiry = await this.computeExpiry(
      { ...membership, membership_class_id: newClassId },
      new Date(),
    );

    await db
      .updateTable('memberships')
      .set({ membership_class_id: newClassId, expires_at: newExpiry })
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'CLASS_CHANGED',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { classId: membership.membership_class_id, className: oldClassName },
      newValue: { classId: newClassId, className: newClass.name, direction },
      notes: reason || undefined,
    });

    // LEGACY_MEMBER class change dispatches LEGACY_STATUS_GRANTED instead of
    // MEMBERSHIP_UPGRADED/DOWNGRADED -- the semantic is recognition, not tier movement.
    let typeKey: string;
    if (newClass.code === 'LEGACY_MEMBER') {
      typeKey = 'LEGACY_STATUS_GRANTED';
    } else {
      typeKey = direction === 'UPGRADE' ? 'MEMBERSHIP_UPGRADED' : 'MEMBERSHIP_DOWNGRADED';
    }

    const updatedMembership = await this.getOrThrow(membershipId);
    const notifyVars: Record<string, string> = {
      previous_membership: oldClassName,
      membership_type: newClass.name,
      membership_number: updatedMembership.membership_number ?? '',
      valid_to: updatedMembership.expires_at
        ? new Date(updatedMembership.expires_at as unknown as string)
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'lifetime',
      portal_link: 'https://v3bcc.bhopal.info/hub/',
    };
    await this.notifyMember(updatedMembership, typeKey, notifyVars);
  }

  // ======================================================================
  // Reads
  // ======================================================================
  async getOrThrow(membershipId: number): Promise<MembershipRow> {
    const row = await db.selectFrom('memberships').selectAll().where('id', '=', membershipId).executeTakeFirst();
    if (!row) throw new NotFoundException('Membership record not found.');
    return row;
  }

  async listForUser(userId: number): Promise<MembershipRow[]> {
    return db.selectFrom('memberships').selectAll().where('user_id', '=', userId).execute();
  }

  // ACTIVE memberships whose expires_at has passed -- the worklist a
  // coordinator (or a future scheduled job) feeds into markExpired. Exists
  // because no cron runs on this box (RAM-conscious, deliberate).
  async listDueForExpiry(): Promise<MembershipRow[]> {
    return db
      .selectFrom('memberships')
      .selectAll()
      .where('lifecycle_state', '=', 'ACTIVE')
      .where('expires_at', 'is not', null)
      .where('expires_at', '<', new Date())
      .execute();
  }

  // ======================================================================
  // Shared helpers
  // ======================================================================
  private async requireState(membershipId: number, allowed: LifecycleState[]): Promise<MembershipRow> {
    const membership = await this.getOrThrow(membershipId);
    if (!allowed.includes(membership.lifecycle_state)) {
      throw new ConflictException(
        `Membership ${membershipId} is in state ${membership.lifecycle_state}; expected one of [${allowed.join(', ')}].`,
      );
    }
    return membership;
  }

  // -------------------------------------------------------------------------
  // Notification helpers (Module 17 engine)
  // -------------------------------------------------------------------------

  // notifyMember -- dispatches via CommunicationService (logs, opt-out, in-app).
  // Resolves userId + full_name + membership_class_name automatically.
  // extraVars are merged on top; callers add only transition-specific variables.
  private async notifyMember(
    membership: Pick<MembershipRow, 'owner_type' | 'user_id' | 'group_entity_id' | 'membership_class_id'>,
    typeKey: string,
    extraVars: Record<string, string> = {},
    options: { actionUrl?: string } = {},
  ): Promise<void> {
    const userId =
      membership.owner_type === 'INDIVIDUAL'
        ? membership.user_id
        : await this.groupPrimaryContact(membership.group_entity_id);
    if (!userId) return;

    const user = await db
      .selectFrom('users')
      .select('full_name')
      .where('id', '=', userId)
      .executeTakeFirst();
    const fullName = user?.full_name ?? '';

    let membershipClass = '';
    if (membership.membership_class_id) {
      const cls = await db
        .selectFrom('membership_classes')
        .select('name')
        .where('id', '=', membership.membership_class_id)
        .executeTakeFirst();
      membershipClass = cls?.name ?? '';
    }

    await this.communicationService.dispatch(
      typeKey,
      userId,
      { full_name: fullName, membership_class: membershipClass, ...extraVars },
      options,
    );
  }

  private async groupPrimaryContact(groupEntityId: number | null): Promise<number | null> {
    if (!groupEntityId) return null;
    const group = await db
      .selectFrom('group_entities')
      .select('primary_contact_user_id')
      .where('id', '=', groupEntityId)
      .executeTakeFirst();
    return group?.primary_contact_user_id ?? null;
  }
}
