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
import type { Kysely, Selectable } from 'kysely';
import { db, type DB, MembershipsTable } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import type { AuditContext } from '../../financial/audit/financial-audit.types';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { resolveNumberPrefix } from '../numbering/number-prefix';
import { logMembershipAudit } from '../shared/membership-audit.util';
import { assertNoBlockingIndividualMembership, isRelease1RenewalClass } from '../renewal/renewal-policy';
import { expireClosedRenewalOperations } from '../renewal/renewal-obligation-expiry';

type LifecycleState = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED' | 'REJECTED';
type MembershipRow = Selectable<MembershipsTable>;

// Group entity kinds that run the frozen Family/Corporate lifecycle
// (PAY -> APPROVE -> INVITE/ASSIGN -> ACTIVATE -> NUMBER). INSTITUTIONAL
// pricing/benefits are undefined (MEM-008 §8) and it has no lifecycle here.
export const GROUP_LIFECYCLE_ENTITY_TYPES = ['FAMILY', 'CORPORATE'] as const;

// Deterministic PAY-001 idempotency keys for a GROUP relationship's
// obligations: one application fee, then one renewal fee per term (keyed by
// the term's end date, so each term's renewal is exactly one obligation).
export function groupApplicationContributionKey(groupMembershipId: number): string {
  return `MEMBERSHIP-${groupMembershipId}-CONTRIBUTION`;
}
export function groupRenewalContributionKey(groupMembershipId: number, termEndsAt: Date): string {
  const d = termEndsAt;
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `MEMBERSHIP-${groupMembershipId}-RENEWAL-${ymd}`;
}

// Settlement correction (HA rulings 1/2, 2026-10-01): one genuine-payment
// obligation per original Contribution whose settlement was not genuine
// (e.g. captured through the Razorpay TEST account). The key binds the
// correction to exactly one (membership, original Contribution) pair.
export function settlementCorrectionContributionKey(membershipId: number, originalContributionId: number): string {
  return `MEMBERSHIP-${membershipId}-CORRECTION-${originalContributionId}`;
}
const SETTLEMENT_CORRECTION_KEY = /^MEMBERSHIP-(\d+)-CORRECTION-(\d+)$/;

// Parses a settlement-correction idempotency key; null for every other key.
export function parseSettlementCorrectionKey(
  idempotencyKey: string,
): { membershipId: number; originalContributionId: number } | null {
  const match = SETTLEMENT_CORRECTION_KEY.exec(idempotencyKey);
  return match ? { membershipId: Number(match[1]), originalContributionId: Number(match[2]) } : null;
}

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
  // Public for MembershipRenewalService (Release 1): a renewal term is the
  // class's renewal_term_months from the previous term end.
  async computeExpiry(
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
  // auditContext is request provenance for the Financial Engine audit log
  // only (OBS-02); it never influences membership behaviour.
  async apply(params: ApplyMembershipParams, auditContext?: AuditContext): Promise<{ id: number; uuid: string }> {
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

      // Validate the Financial Obligation (fee + payer) BEFORE writing the
      // application, so a configuration gap never leaves an unpayable
      // PENDING application behind.
      await this.resolveGroupObligation(params.groupMembershipTypeId!, params.groupEntityId!);

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

    // F-013: membership insert + LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction (mirrors auth.service.ts's F-011 pattern).
    const id = await db.transaction().execute(async (trx) => {
      // Release 1 §20: the duplicate check above is re-run under a row lock
      // on the applicant, so concurrent applications serialise, and an
      // EXPIRED Release 1 membership must be reinstated, not re-applied for.
      if (params.ownerType === 'INDIVIDUAL') {
        await trx.selectFrom('users').select('id').where('id', '=', params.userId!).forUpdate().executeTakeFirst();
        await assertNoBlockingIndividualMembership(trx, params.userId!);
      }

      const inserted = await trx
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

      const newId = Number(inserted.insertId);

      await logMembershipAudit(
        {
          membershipId: newId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'SYSTEM',
          newValue: { state: 'PENDING' },
        },
        trx,
      );

      return newId;
    });

    // Financial reconciliation (workflow-ordering fix): for a PAYMENT_REQUIRED
    // class, the financial obligation is created NOW, while the application is
    // still PENDING -- not at approval time. Administrative approval is the
    // FINAL admission decision and must happen only once payment is already
    // COMPLETED (see approve() below). AUTO_AFTER_APPROVAL/MANUAL classes are
    // untouched -- see createApplicationContribution().
    if (params.ownerType === 'INDIVIDUAL' && params.membershipClassId != null) {
      await this.createApplicationContribution(id, params.membershipClassId, params.userId!, auditContext);
    }

    // Family / Corporate (frozen lifecycle: PAY -> APPROVE -> INVITE/ASSIGN
    // -> ACTIVATE -> NUMBER): the group's Financial Contribution is created
    // at application, exactly like a PAYMENT_REQUIRED individual application.
    if (params.ownerType === 'GROUP') {
      await this.createGroupApplicationContribution(id, auditContext);
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
    auditContext?: AuditContext,
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
    }, auditContext);

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
  // Creates (idempotently) the Financial Obligation -> Contribution for a
  // GROUP (Family / Corporate) membership application.
  //
  // Frozen lifecycle: payment precedes approval, so the obligation exists
  // from application onward -- apply() calls this for every GROUP
  // application, and it is also exposed (idempotent) for staff to recover
  // an application filed before this rule existed. PENDING only: an
  // application that is already decided can no longer acquire its
  // application obligation.
  //
  // Same conventions as createApplicationContribution() for INDIVIDUAL:
  //  • businessModule 'MEMBERSHIP' + businessReferenceId = memberships.id,
  //    whose row already identifies owner_type=GROUP, group_entity_id and
  //    group_membership_type_id (Family vs Corporate) -- no new reference
  //    scheme, and reject()/getMembershipContribution() resolve it unchanged.
  //  • Deterministic idempotency key MEMBERSHIP-{id}-CONTRIBUTION: a repeat
  //    call returns the SAME Contribution (PAY-001: one obligation -> one
  //    Contribution); a failed/expired payment attempt is retried on it,
  //    never by creating another.
  //  • Amount: group_type_entitlements.fee_inr only (MEM-008 via
  //    EntitlementService) -- never hard-coded. A missing fee is a loud
  //    configuration error, not a silent zero-value (free) obligation.
  //  • Payer: the group's PRIMARY_CONTACT user.
  //
  // Financial state only: this never approves, activates, numbers, or
  // touches delegates. Positive value -> AWAITING_SETTLEMENT (payment is
  // started separately, e.g. via a hosted payment link); zero value ->
  // existing PAY-001 §12 path.
  async createGroupApplicationContribution(
    membershipId: number,
    auditContext?: AuditContext,
  ): Promise<{ contributionId: number; state: string; amountPaise: number; currency: string }> {
    const membership = await this.requireState(membershipId, ['PENDING']);
    if (
      membership.owner_type !== 'GROUP' ||
      membership.group_membership_type_id == null ||
      membership.group_entity_id == null
    ) {
      throw new BadRequestException(`Membership ${membershipId} is not a GROUP membership application.`);
    }

    const { groupTypeName, amountPaise, payerUserId } = await this.resolveGroupObligation(
      membership.group_membership_type_id,
      membership.group_entity_id,
    );

    const { id: contributionId } = await this.financialService.createContribution({
      payerUserId,
      businessModule: 'MEMBERSHIP',
      businessReferenceId: membershipId,
      purpose: `${groupTypeName} fee`,
      amountPaise,
      idempotencyKey: groupApplicationContributionKey(membershipId),
    }, auditContext);

    // Only a freshly-created Contribution is advanced; a repeat call leaves
    // an existing one exactly where the Financial Engine has it.
    const existing = await this.financialService.getContribution(contributionId);
    if (existing.state === 'CREATED') {
      await db
        .updateTable('memberships')
        .set({ pending_contribution_id: contributionId })
        .where('id', '=', membershipId)
        .execute();
      if (amountPaise === 0) {
        await this.financialService.processZeroValueContribution(contributionId);
      } else {
        await this.financialService.transitionContribution(contributionId, 'AWAITING_SETTLEMENT');
      }
    }

    const current = await this.financialService.getContribution(contributionId);
    return {
      contributionId,
      state: String(current.state),
      amountPaise: Number(current.amount_paise),
      currency: String(current.currency),
    };
  }

  // Business-Module side of a Family/Corporate Financial Obligation: WHY and
  // HOW MUCH (PAY-001 §OWNERSHIP RULE). Amount = group_type_entitlements
  // .fee_inr only (never hard-coded; missing/invalid is a loud configuration
  // error, never a silent free obligation). Payer = the group's primary
  // contact (the operational head). Also used by apply() to validate BEFORE
  // the application row is written.
  private async resolveGroupObligation(
    groupMembershipTypeId: number,
    groupEntityId: number,
  ): Promise<{ groupTypeName: string; amountPaise: number; payerUserId: number }> {
    const groupType = await db
      .selectFrom('group_membership_types')
      .select(['name'])
      .where('id', '=', groupMembershipTypeId)
      .executeTakeFirstOrThrow();

    const feeInrRaw = await this.entitlementService.getGroupTypeConfigValue(groupMembershipTypeId, 'fee_inr');
    const feeInr = feeInrRaw != null && feeInrRaw.trim() !== '' ? Number(feeInrRaw) : NaN;
    if (!Number.isFinite(feeInr) || feeInr < 0) {
      throw new ConflictException(
        `Membership configuration is incomplete: "${groupType.name}" has no valid fee_inr in group_type_entitlements.`,
      );
    }

    const payerUserId = await this.groupPrimaryContact(groupEntityId);
    if (!payerUserId) {
      throw new ConflictException(`Group entity ${groupEntityId} has no primary contact to act as payer.`);
    }

    return { groupTypeName: groupType.name, amountPaise: Math.round(feeInr * 100), payerUserId };
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
  //   GROUP (Family/Corp.) -> approval REFUSED until the group's Financial
  //                           Contribution is COMPLETED and configured
  //                           verification is satisfied (see
  //                           assertGroupApprovalPreconditions()). Stays
  //                           APPROVED: the head then invites members, and
  //                           the group becomes ACTIVE only when its first
  //                           member record is activated (activate()).
  // ======================================================================
  // Read-only approval precondition, shared by approve() and by
  // ApplicationWorkflowService.recordStageDecision(). The latter calls it
  // BEFORE persisting an approval-stage row, so a refused approval never
  // leaves a stale stage decision behind (membership 112 incident).
  async assertApprovalPreconditions(
    membershipId: number,
  ): Promise<{ membership: MembershipRow; activationMode: string | null }> {
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

    if (membership.owner_type === 'GROUP') {
      await this.assertGroupApprovalPreconditions(membership);
    }

    return { membership, activationMode: cls?.activation_mode ?? null };
  }

  // Family / Corporate approval gate (frozen lifecycle: PAY -> APPROVE).
  // Read-only; every check runs before approve() writes anything.
  //   1. PENDING                           -- requireState() above
  //   2. group type is FAMILY or CORPORATE
  //   3. the application's Financial Contribution exists
  //   4. ... and is COMPLETED (PAY-001: settled + receipted). Checked by its
  //      own idempotency key, so a later obligation can never stand in for it.
  //   5. required verification: every document type listed in the group
  //      type's `required_document_types` configuration (comma-separated,
  //      group_type_entitlements -- configuration, not code) has an
  //      uploaded document on this application that staff reviewed ACCEPTED.
  //      No configured list = no document requirement beyond (1)-(4).
  // No membership state, no number, no delegate is touched here.
  private async assertGroupApprovalPreconditions(membership: MembershipRow): Promise<void> {
    const membershipId = Number(membership.id);
    const groupType = membership.group_membership_type_id != null
      ? await db
          .selectFrom('group_membership_types')
          .select(['entity_type', 'name'])
          .where('id', '=', membership.group_membership_type_id)
          .executeTakeFirst()
      : undefined;
    if (!groupType || !(GROUP_LIFECYCLE_ENTITY_TYPES as readonly string[]).includes(groupType.entity_type)) {
      throw new ConflictException(
        `Membership ${membershipId} cannot be approved: only Family and Corporate group memberships have an approval lifecycle.`,
      );
    }

    const contribution = await this.financialService.findByIdempotencyKey(groupApplicationContributionKey(membershipId));
    if (!contribution || contribution.state !== 'COMPLETED') {
      throw new ConflictException(
        `Membership ${membershipId} cannot be approved: its ${groupType.name} Financial Contribution is ` +
        `${contribution ? `in state '${contribution.state}'` : 'missing'}; approval requires COMPLETED.`,
      );
    }

    const requiredRaw = await this.entitlementService.getGroupTypeConfigValue(
      membership.group_membership_type_id!,
      'required_document_types',
    );
    const requiredTypes = (requiredRaw ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (requiredTypes.length === 0) return;

    const accepted = await db
      .selectFrom('membership_application_documents')
      .select(['document_type'])
      .where('membership_id', '=', membershipId)
      .where('upload_status', '=', 'UPLOADED')
      .where('review_status', '=', 'ACCEPTED')
      .execute();
    const acceptedTypes = new Set(accepted.map((d) => d.document_type));
    const missing = requiredTypes.filter((t) => !acceptedTypes.has(t));
    if (missing.length > 0) {
      throw new ConflictException(
        `Membership ${membershipId} cannot be approved: required ${groupType.name} verification is incomplete ` +
        `(no accepted document for: ${missing.join(', ')}).`,
      );
    }
  }

  async approve(
    membershipId: number,
    actorUserId: number,
    opts?: { expiresAtOverride?: string },
  ): Promise<{ finalState: 'APPROVED' | 'ACTIVE' }> {
    const { membership, activationMode } = await this.assertApprovalPreconditions(membershipId);
    const cls = { activation_mode: activationMode };

    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction. Authorization/approval semantics above
    // this point are unchanged -- this is atomicity-only.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({ lifecycle_state: 'APPROVED', approved_at: toMysqlDatetime(new Date()) })
        .where('id', '=', membershipId)
        .execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { state: membership.lifecycle_state },
          newValue: { state: 'APPROVED' },
        },
        trx,
      );
    });

    if (cls?.activation_mode === 'AUTO_AFTER_APPROVAL' || cls?.activation_mode === 'PAYMENT_REQUIRED') {
      // Both branches activate immediately from here: AUTO_AFTER_APPROVAL
      // because there was never a financial obligation, PAYMENT_REQUIRED
      // because the financial precondition above already confirmed COMPLETED.
      // MEMBERSHIP_APPLICATION_APPROVED is suppressed for both -- the member
      // is activated in the same operation, so "pending review" copy would
      // be wrong; MEMBERSHIP_ACTIVATED fires via activate().
      await this.activate(membershipId, { type: 'ADMIN', userId: actorUserId }, opts);
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
  async reject(
    membershipId: number,
    actorUserId: number,
    reason: string,
    auditContext?: AuditContext,
  ): Promise<void> {
    const membership = await this.requireState(membershipId, ['PENDING']);

    const contribution = await this.getMembershipContribution(membershipId);
    // F-032: the "anything else" branch above (SETTLEMENT_IN_PROGRESS / FAILED
    // / ABANDONED) intentionally takes no financial action -- that behaviour
    // is unchanged. What was missing was any admin-visible record that it
    // happened, so the rejection notes (already rendered in the admin Recent
    // Events feed) carry the flag instead of leaving it silent.
    let unresolvedContributionNote: string | null = null;
    if (contribution) {
      if (contribution.state === 'COMPLETED') {
        await this.financialService
          .requestRefund(Number(contribution.id), reason, { actorType: 'HUMAN', actorUserId }, auditContext)
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
      } else {
        unresolvedContributionNote =
          `Financial Contribution ${contribution.id} left in state '${contribution.state}' -- not auto-resolved by rejection.`;
      }
    }

    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('memberships').set({ lifecycle_state: 'REJECTED' }).where('id', '=', membershipId).execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { state: membership.lifecycle_state },
          newValue: { state: 'REJECTED' },
          notes: unresolvedContributionNote ? `${reason} | ${unresolvedContributionNote}` : reason,
        },
        trx,
      );
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
  // MEM-007 §8: allocation happens here, as the final step of activation.
  // HA Decision B3: the number's YYYY/MM is the membership registration/
  // application creation date (applied_at) -- never the approval or
  // activation date -- and no caller may override it.
  // ======================================================================
  async activate(
    membershipId: number,
    actor: { type: 'SYSTEM' | 'ADMIN'; userId?: number | null },
    opts?: {
      paymentId?: number | null;
      // Explicit one-off validity override for an authorized administrative
      // grant (e.g. a time-boxed complimentary period) that must not reuse
      // the class's normal renewal_term_months. Every other membership keeps
      // going through computeExpiry() untouched -- this never alters class
      // config. undefined (the default) preserves existing behaviour exactly.
      expiresAtOverride?: string;
    },
  ): Promise<{ membershipNumber: string | null }> {
    const membership = await this.requireState(membershipId, ['APPROVED']);

    // Family/Corporate GROUP row: never activated on its own. Human Authority
    // ruling: the Group becomes ACTIVE only when its FIRST individual member
    // is successfully activated (in that member's activation transaction,
    // below) -- and it is never numbered (MEM-007 MP-002).
    if (membership.owner_type === 'GROUP') {
      throw new ConflictException(
        `Group membership ${membershipId} cannot be activated directly; it becomes ACTIVE when its first member is activated.`,
      );
    }

    // A Family/Corporate MEMBER's own record: only activatable once the
    // whole chain before it holds (group approved + paid, seat accepted).
    const isGroupMember = membership.parent_membership_id != null;
    if (isGroupMember) {
      await this.assertGroupMemberActivationPreconditions(membership);
    }

    const now = new Date();
    // HA B3 governs new INDIVIDUAL registrations. A Family/Corporate member's
    // own record keeps its pre-B3 behaviour (activation date) unchanged until
    // the Human Authority rules on its YYYY/MM source -- its applied_at is the
    // seat-acceptance time, not a registration of its own.
    const { joinYear, joinMonth } = isGroupMember
      ? { joinYear: now.getFullYear(), joinMonth: now.getMonth() + 1 }
      : resolveNumberPrefix(membership);

    // A group member's validity is the group relationship's term (resolved
    // inside the transaction below, where the group row is locked); every
    // other membership keeps its own class-based expiry.
    const expiresAt = isGroupMember
      ? null
      : opts?.expiresAtOverride ?? await this.computeExpiry(membership, now);

    // F-013: audit write moved inside the existing transaction (no second
    // transaction introduced) so lifecycle transition + number assignment +
    // audit commit/roll back together.
    const { membershipNumber } = await db.transaction().execute(async (trx) => {
      // First activated member activates the group relationship (unnumbered)
      // in the SAME transaction; later members inherit its expiry.
      const effectiveExpiresAt = isGroupMember
        ? await this.activateGroupRelationshipInTrx(trx, Number(membership.parent_membership_id), now, actor)
        : expiresAt;

      await trx
        .updateTable('memberships')
        .set({
          lifecycle_state: 'ACTIVE',
          activated_at: toMysqlDatetime(now),
          expires_at: effectiveExpiresAt,
          last_payment_status: opts?.paymentId ? 'SUCCEEDED' : 'NONE',
          pending_contribution_id: null,
        })
        .where('id', '=', membershipId)
        .execute();

      const result = await this.numberingService.assignPermanentNumber(trx, membershipId, joinYear, joinMonth);

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: actor.type,
          actorUserId: actor.userId ?? null,
          oldValue: { state: membership.lifecycle_state },
          newValue: { state: 'ACTIVE', membershipNumber: result.membershipNumber },
        },
        trx,
      );

      return result;
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
          portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
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
  async recordPaymentFailure(
    membershipId: number,
    failedAmountPaise?: number,
    notes?: string,
    contributionId?: number,
  ): Promise<void> {
    // A settlement-correction payment attempt that failed: the membership is
    // already ACTIVE and is never touched; the correction Contribution stays
    // retryable (PAY-001) -- record it only.
    if (await this.recordSettlementCorrectionPaymentEvent(membershipId, contributionId, 'PAYMENT_FAILED')) return;

    // A Family/Corporate RENEWAL payment attempt that failed: the group is
    // ACTIVE/EXPIRED, the renewal Contribution stays retryable (PAY-001), and
    // nothing about the membership changes -- record it only.
    if (await this.recordGroupRenewalPaymentEvent(membershipId, 'PAYMENT_FAILED', notes)) return;

    const membership = await this.requireState(membershipId, ['PENDING']);

    // F-013: mutation + existing PAYMENT_FAILED audit write commit/roll
    // back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({ last_payment_status: 'FAILED', pending_contribution_id: null })
        .where('id', '=', membershipId)
        .execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'PAYMENT_FAILED',
          actorType: 'SYSTEM',
          notes: notes ?? null,
        },
        trx,
      );
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
  // F-002: a Contribution can still be SETTLEMENT_IN_PROGRESS when reject()
  // runs (reject()'s "anything else" branch deliberately leaves it
  // untouched -- see the comment above reject()). If that settlement
  // subsequently succeeds, CONTRIBUTION_COMPLETED still arrives here for a
  // now-REJECTED membership. The membership is never activated for that --
  // admin rejection is final -- but the platform owes a refund of the
  // completed settlement. requestRefund() is reused unchanged (idempotent,
  // same Settlement Provider, immutable financial history); the only
  // difference from the human-rejection refund path in reject() is the
  // actor: no human initiated this, so actorType is SYSTEM with no
  // actorUserId (F-002 system-actor governance decision).
  async recordPaymentReceived(membershipId: number, contributionId?: number): Promise<void> {
    // A settlement-correction payment settled: recorded only. It never
    // approves, activates, renews, numbers, or changes validity.
    if (await this.recordSettlementCorrectionPaymentEvent(membershipId, contributionId, 'PAYMENT_RECEIVED')) return;

    // A Family/Corporate RENEWAL fee settled: recorded only. The term is
    // extended exclusively by an administrator via renewGroup() -- payment
    // never renews, approves, or activates by itself.
    if (await this.recordGroupRenewalPaymentEvent(membershipId, 'PAYMENT_RECEIVED')) return;

    const membership = await this.requireState(membershipId, ['PENDING', 'REJECTED']);

    if (membership.lifecycle_state === 'REJECTED') {
      const contribution = await this.getMembershipContribution(membershipId);
      if (contribution) {
        await this.financialService.requestRefund(
          Number(contribution.id),
          'Automatic refund: settlement completed after membership application was rejected',
          { actorType: 'SYSTEM', actorUserId: null },
        );
      }
      return;
    }

    await logMembershipAudit({
      membershipId,
      eventType: 'PAYMENT_RECEIVED',
      actorType: 'SYSTEM',
    });

    await this.notifyMember(membership, 'MEMBERSHIP_PAYMENT_RECEIVED');
  }

  // Returns true (after recording an audit row) iff the financial event is
  // for a Family/Corporate GROUP relationship that is past its application
  // (ACTIVE or EXPIRED) -- i.e. a renewal obligation. Application-stage
  // events (PENDING/REJECTED) fall through to the existing handling.
  private async recordGroupRenewalPaymentEvent(
    membershipId: number,
    eventType: 'PAYMENT_RECEIVED' | 'PAYMENT_FAILED',
    notes?: string,
  ): Promise<boolean> {
    const membership = await this.getOrThrow(membershipId);
    if (membership.owner_type !== 'GROUP' || !['ACTIVE', 'EXPIRED'].includes(membership.lifecycle_state)) {
      return false;
    }
    await logMembershipAudit({
      membershipId,
      eventType,
      actorType: 'SYSTEM',
      newValue: { obligation: 'GROUP_RENEWAL' },
      notes: notes ?? null,
    });
    return true;
  }

  // Returns true (after recording an audit row) iff contributionId is this
  // membership's settlement-correction Contribution. Every other
  // Contribution -- application, complimentary, group, or none supplied --
  // falls through to the existing handling unchanged.
  private async recordSettlementCorrectionPaymentEvent(
    membershipId: number,
    contributionId: number | undefined,
    outcome: 'PAYMENT_RECEIVED' | 'PAYMENT_FAILED',
  ): Promise<boolean> {
    if (contributionId == null) return false;
    const contribution = await this.financialService.getContribution(contributionId);
    if (String(contribution.business_module) !== 'MEMBERSHIP') return false;
    const parsed = parseSettlementCorrectionKey(String(contribution.idempotency_key));
    if (!parsed || parsed.membershipId !== membershipId) return false;

    await logMembershipAudit({
      membershipId,
      eventType: outcome === 'PAYMENT_RECEIVED'
        ? 'SETTLEMENT_CORRECTION_PAYMENT_RECEIVED'
        : 'SETTLEMENT_CORRECTION_PAYMENT_FAILED',
      actorType: 'SYSTEM',
      newValue: {
        correctionContributionId: contributionId,
        originalContributionId: parsed.originalContributionId,
        contributionState: String(contribution.state),
      },
    });
    return true;
  }

  // ======================================================================
  // Settlement correction (HA rulings 1/2, 2026-10-01; Option I)
  //
  // For an ACTIVE INDIVIDUAL membership whose application fee was settled
  // through a settlement later determined (by administrative/HA authority)
  // not to represent genuine received funds -- e.g. captured through the
  // Razorpay TEST account. Creates ONE new, ordinary Financial Obligation
  // -> Contribution for the same payer, amount and currency, made payable
  // (AWAITING_SETTLEMENT) through the existing payment-link route, and asks
  // the Financial Engine to annotate the original settlement (append-only).
  //
  // Never touches the membership row: no lifecycle transition, no
  // activation/renewal, no expiry computation, no number allocation. The
  // original Contribution, Transaction, Receipt and webhook record are
  // never modified and no refund is requested.
  //
  // Idempotent: the deterministic key binds one correction to one original
  // Contribution; every step re-runs safely after a partial failure.
  // ======================================================================
  async createSettlementCorrectionContribution(
    membershipId: number,
    originalContributionId: number,
    reason: string,
    actorUserId: number,
    auditContext: AuditContext,
  ): Promise<{
    correctionContributionId: number;
    originalContributionId: number;
    state: string;
    amountPaise: number;
    currency: string;
  }> {
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) {
      throw new BadRequestException('A correction reason is required.');
    }

    const membership = await this.getOrThrow(membershipId);
    if (membership.owner_type !== 'INDIVIDUAL' || membership.user_id == null) {
      throw new BadRequestException(`Membership ${membershipId} is not an INDIVIDUAL membership.`);
    }
    if (membership.parent_membership_id != null) {
      throw new BadRequestException(`Membership ${membershipId} belongs to a Family/Corporate group.`);
    }
    if (membership.lifecycle_state !== 'ACTIVE') {
      throw new ConflictException(
        `Membership ${membershipId} is in state '${membership.lifecycle_state}'; a settlement correction requires ACTIVE.`,
      );
    }

    // Financial evidence (read-only), checked before anything is written.
    const evidence = await this.financialService.getSettlementReconciliationEvidence(originalContributionId);
    const original = evidence.contribution;
    if (
      String(original.business_module) !== 'MEMBERSHIP' ||
      Number(original.business_reference_id) !== membershipId
    ) {
      throw new BadRequestException(
        `Contribution ${originalContributionId} does not belong to membership ${membershipId}.`,
      );
    }
    // Only the membership's application fee can be corrected -- never a
    // complimentary, renewal, or another correction Contribution.
    if (String(original.idempotency_key) !== `MEMBERSHIP-${membershipId}-CONTRIBUTION`) {
      throw new BadRequestException(
        `Contribution ${originalContributionId} is not the membership application fee for membership ${membershipId}.`,
      );
    }
    if (original.state !== 'COMPLETED') {
      throw new ConflictException(
        `Contribution ${originalContributionId} is in state '${original.state}'; a correction requires COMPLETED.`,
      );
    }
    if (!evidence.transaction || String(evidence.transaction.provider) !== 'RAZORPAY') {
      throw new ConflictException(
        `Contribution ${originalContributionId} has no SUCCEEDED RAZORPAY Financial Transaction.`,
      );
    }
    if (evidence.refund) {
      throw new ConflictException(`Contribution ${originalContributionId} already has a refund record.`);
    }
    if (!evidence.webhook) {
      throw new ConflictException(
        `Contribution ${originalContributionId} has no processed payment.captured delivery for its settlement.`,
      );
    }

    const amountPaise = Number(original.amount_paise);
    const currency = String(original.currency);
    const { id: correctionContributionId } = await this.financialService.createContribution({
      payerUserId: Number(original.payer_user_id),
      businessModule: 'MEMBERSHIP',
      businessReferenceId: membershipId,
      purpose: `Membership fee — genuine payment replacing a gateway test-mode transaction (ref FC-${originalContributionId})`,
      amountPaise,
      currency,
      idempotencyKey: settlementCorrectionContributionKey(membershipId, originalContributionId),
    }, auditContext);

    const created = await this.financialService.getContribution(correctionContributionId);
    if (created.state === 'CREATED') {
      await this.financialService.transitionContribution(correctionContributionId, 'AWAITING_SETTLEMENT');
    }

    await this.financialService.annotateSettlementReconciliation(
      originalContributionId,
      {
        classification: 'TEST_MODE_NON_GENUINE_SETTLEMENT',
        reason: trimmedReason,
        correctionContributionId,
      },
      auditContext,
    );

    // A membership has exactly one application-fee Contribution (checked
    // above), so it can carry at most one settlement correction: one
    // authorization row per membership is the idempotency boundary.
    const alreadyAuthorized = await db
      .selectFrom('membership_audit_log')
      .select('id')
      .where('membership_id', '=', membershipId)
      .where('event_type', '=', 'SETTLEMENT_CORRECTION_AUTHORIZED')
      .executeTakeFirst();
    if (!alreadyAuthorized) {
      await logMembershipAudit({
        membershipId,
        eventType: 'SETTLEMENT_CORRECTION_AUTHORIZED',
        actorType: 'ADMIN',
        actorUserId,
        newValue: {
          correctionContributionId,
          originalContributionId,
          originalTransactionId: Number(evidence.transaction.id),
          originalProviderPaymentRef: evidence.transaction.provider_reference,
          providerAccountId: evidence.webhook.providerAccountId,
          settlementClassification: 'TEST_MODE_NON_GENUINE_SETTLEMENT',
        },
        notes: trimmedReason,
      });
    }

    const current = await this.financialService.getContribution(correctionContributionId);
    return {
      correctionContributionId,
      originalContributionId,
      state: String(current.state),
      amountPaise: Number(current.amount_paise),
      currency: String(current.currency),
    };
  }

  // ======================================================================
  // ACTIVE -> SUSPENDED  (mandatory reason)
  // ======================================================================
  async suspend(membershipId: number, actorUserId: number, reason: string): Promise<void> {
    const membership = await this.requireState(membershipId, ['ACTIVE']);

    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('memberships').set({ lifecycle_state: 'SUSPENDED' }).where('id', '=', membershipId).execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { state: 'ACTIVE' },
          newValue: { state: 'SUSPENDED' },
          notes: reason,
        },
        trx,
      );
    });

    await this.notifyMember(membership, 'MEMBERSHIP_SUSPENDED');
  }

  // ======================================================================
  // SUSPENDED -> ACTIVE
  // ======================================================================
  async reinstate(membershipId: number, actorUserId: number): Promise<void> {
    const membership = await this.requireState(membershipId, ['SUSPENDED']);

    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('memberships').set({ lifecycle_state: 'ACTIVE' }).where('id', '=', membershipId).execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { state: 'SUSPENDED' },
          newValue: { state: 'ACTIVE' },
        },
        trx,
      );
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
    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set(
          membership.expires_at
            ? { lifecycle_state: 'EXPIRED' }
            : { lifecycle_state: 'EXPIRED', expires_at: toMysqlDatetime(new Date()) },
        )
        .where('id', '=', membershipId)
        .execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: actor.type,
          actorUserId: actor.userId ?? null,
          oldValue: { state: 'ACTIVE' },
          newValue: { state: 'EXPIRED' },
        },
        trx,
      );
    });

    // Release 1 §9: the renewal window closed at term end -- an unsettled
    // renewal obligation expires; one already in settlement is left to PAY-001.
    await expireClosedRenewalOperations(this.financialService, membershipId).catch(() => 0);

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

    // Family/Corporate: the group relationship renews only through its paid
    // PAY-001 renewal obligation (renewGroup()), and its members renew WITH
    // it -- never individually, and never without payment.
    if (membership.owner_type === 'GROUP' || membership.parent_membership_id != null) {
      throw new ConflictException(
        `Membership ${membershipId} belongs to a Family/Corporate group; renew the group membership (paid renewal) instead.`,
      );
    }

    // Release 1 §19: Individual Annual/Biennial/Student never renew without
    // their PAY-001 obligation, and never from "now" -- after term end they
    // return to ACTIVE only through reinstatement (MembershipRenewalService).
    // Other classes keep this path unchanged (their policy is out of scope).
    if (membership.membership_class_id != null) {
      const cls = await db
        .selectFrom('membership_classes')
        .select('code')
        .where('id', '=', membership.membership_class_id)
        .executeTakeFirst();
      if (isRelease1RenewalClass(cls?.code)) {
        throw new ConflictException(
          `Membership ${membershipId} is a self-service renewable plan; it can only be returned to ACTIVE through ` +
          'an approved reinstatement request and its PAY-001 payment.',
        );
      }
    }

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

    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({ lifecycle_state: 'ACTIVE', expires_at: newExpiry, last_payment_status: 'SUCCEEDED' })
        .where('id', '=', membershipId)
        .execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType,
          actorUserId,
          oldValue: { state: 'EXPIRED' },
          newValue: { state: 'ACTIVE', note: 'renewal' },
        },
        trx,
      );
    });

    await this.notifyMember(membership, 'MEMBERSHIP_RENEWED', {
      membership_number: membership.membership_number ?? '',
    });
  }

  // ======================================================================
  // Family / Corporate RENEWAL (group relationship -- PAY-001 obligation)
  //
  // Frozen rule: the group renews; its members' records do NOT get
  // duplicated and NO number is ever allocated or changed by renewal.
  //   1. createGroupRenewalContribution(): one PAY-001 obligation per term
  //      (idempotency key carries the term's end date), same fee source
  //      (group_type_entitlements.fee_inr), same payer (primary contact).
  //      Paid through the existing Payment Link infrastructure.
  //   2. renewGroup(): admin action, REFUSED unless that term's renewal
  //      Contribution is COMPLETED. Extends the group relationship and every
  //      linked member record that is ACTIVE or EXPIRED (never TERMINATED/
  //      SUSPENDED/APPROVED ones) to the same new term end. Same rows, same
  //      numbers.
  // ======================================================================
  private async requireRenewableGroup(membershipId: number): Promise<MembershipRow & { expires_at: Date }> {
    const group = await this.requireState(membershipId, ['ACTIVE', 'EXPIRED']);
    if (group.owner_type !== 'GROUP' || group.group_membership_type_id == null || group.group_entity_id == null) {
      throw new BadRequestException(`Membership ${membershipId} is not a Family/Corporate group membership.`);
    }
    if (!group.expires_at) {
      throw new ConflictException(`Group membership ${membershipId} has no term end; it cannot be renewed.`);
    }
    return group as MembershipRow & { expires_at: Date };
  }

  async createGroupRenewalContribution(
    membershipId: number,
    auditContext?: AuditContext,
  ): Promise<{ contributionId: number; state: string; amountPaise: number; currency: string }> {
    const group = await this.requireRenewableGroup(membershipId);
    const { groupTypeName, amountPaise, payerUserId } = await this.resolveGroupObligation(
      group.group_membership_type_id!,
      group.group_entity_id!,
    );
    const termEndsAt = new Date(group.expires_at as unknown as string);

    const { id: contributionId } = await this.financialService.createContribution({
      payerUserId,
      businessModule: 'MEMBERSHIP',
      businessReferenceId: membershipId,
      purpose: `${groupTypeName} renewal fee`,
      amountPaise,
      idempotencyKey: groupRenewalContributionKey(membershipId, termEndsAt),
    }, auditContext);

    const created = await this.financialService.getContribution(contributionId);
    if (created.state === 'CREATED') {
      if (amountPaise === 0) {
        await this.financialService.processZeroValueContribution(contributionId);
      } else {
        await this.financialService.transitionContribution(contributionId, 'AWAITING_SETTLEMENT');
      }
    }
    const current = await this.financialService.getContribution(contributionId);
    return {
      contributionId,
      state: String(current.state),
      amountPaise: Number(current.amount_paise),
      currency: String(current.currency),
    };
  }

  async renewGroup(membershipId: number, actorUserId: number): Promise<{ expiresAt: string | null; renewedMemberIds: number[] }> {
    const group = await this.requireRenewableGroup(membershipId);
    const termEndsAt = new Date(group.expires_at as unknown as string);

    const contribution = await this.financialService.findByIdempotencyKey(
      groupRenewalContributionKey(membershipId, termEndsAt),
    );
    if (!contribution || contribution.state !== 'COMPLETED') {
      throw new ConflictException(
        `Group membership ${membershipId} cannot be renewed: its renewal Financial Contribution is ` +
        `${contribution ? `in state '${contribution.state}'` : 'missing'}; renewal requires COMPLETED.`,
      );
    }

    // Same grace rule as renewFromExpired(): lapsed beyond grace = re-apply.
    if (group.lifecycle_state === 'EXPIRED') {
      const graceDays = await this.gracePeriodDays(group);
      const graceEnd = new Date(termEndsAt);
      graceEnd.setDate(graceEnd.getDate() + graceDays);
      if (new Date() > graceEnd) {
        throw new ConflictException(
          `The ${graceDays}-day renewal grace period ended on ${graceEnd.toISOString().slice(0, 10)}. A new group membership application is required.`,
        );
      }
    }

    // The new term runs from the later of today and the current term end, so
    // an early renewal never shortens the paid-for term.
    const base = termEndsAt > new Date() ? termEndsAt : new Date();
    const newExpiry = await this.computeExpiry(group, base);

    const renewedMemberIds = await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({ lifecycle_state: 'ACTIVE', expires_at: newExpiry, last_payment_status: 'SUCCEEDED' })
        .where('id', '=', membershipId)
        .execute();
      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { state: group.lifecycle_state, expiresAt: group.expires_at },
          newValue: { state: 'ACTIVE', note: 'group renewal', expiresAt: newExpiry, contributionId: Number(contribution.id) },
        },
        trx,
      );

      const members = await trx
        .selectFrom('memberships')
        .select(['id', 'lifecycle_state', 'expires_at'])
        .where('parent_membership_id', '=', membershipId)
        .where('lifecycle_state', 'in', ['ACTIVE', 'EXPIRED'])
        .execute();
      for (const m of members) {
        await trx
          .updateTable('memberships')
          .set({ lifecycle_state: 'ACTIVE', expires_at: newExpiry })
          .where('id', '=', m.id)
          .execute();
        await logMembershipAudit(
          {
            membershipId: Number(m.id),
            eventType: 'LIFECYCLE_TRANSITION',
            actorType: 'ADMIN',
            actorUserId,
            oldValue: { state: m.lifecycle_state, expiresAt: m.expires_at },
            newValue: { state: 'ACTIVE', note: 'renewed with group', groupMembershipId: membershipId, expiresAt: newExpiry },
          },
          trx,
        );
      }
      return members.map((m) => Number(m.id));
    });

    return { expiresAt: newExpiry, renewedMemberIds };
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

    // F-013: mutation + existing LIFECYCLE_TRANSITION audit write commit/
    // roll back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({ lifecycle_state: 'TERMINATED', terminated_at: toMysqlDatetime(new Date()) })
        .where('id', '=', membershipId)
        .execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'LIFECYCLE_TRANSITION',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { state: membership.lifecycle_state },
          newValue: { state: 'TERMINATED' },
          notes: reason,
        },
        trx,
      );
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
    // A Family/Corporate member's record has no membership class (MEM-006:
    // group types are not classes); moving it into one would silently detach
    // it from its group. Not a class change -- refuse.
    if (membership.parent_membership_id != null) {
      throw new BadRequestException('A Family/Corporate member record has no membership class to change.');
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

    // F-013: mutation + existing CLASS_CHANGED audit write commit/roll
    // back as one transaction.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({ membership_class_id: newClassId, expires_at: newExpiry })
        .where('id', '=', membershipId)
        .execute();

      await logMembershipAudit(
        {
          membershipId,
          eventType: 'CLASS_CHANGED',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { classId: membership.membership_class_id, className: oldClassName },
          newValue: { classId: newClassId, className: newClass.name, direction },
          notes: reason || undefined,
        },
        trx,
      );
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
      portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
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
  // ----------------------------------------------------------------------
  // Family / Corporate activation helpers
  // ----------------------------------------------------------------------

  // The group relationship may only ever become ACTIVE once it is a
  // Family/Corporate group whose application Contribution is COMPLETED.
  // Approval already required this; re-checked so activation can never
  // bypass payment even on a path that skipped approve().
  private async assertGroupRelationshipPayable(group: MembershipRow): Promise<void> {
    const groupId = Number(group.id);
    const groupType = group.group_membership_type_id != null
      ? await db
          .selectFrom('group_membership_types')
          .select(['entity_type'])
          .where('id', '=', group.group_membership_type_id)
          .executeTakeFirst()
      : undefined;
    if (!groupType || !(GROUP_LIFECYCLE_ENTITY_TYPES as readonly string[]).includes(groupType.entity_type)) {
      throw new ConflictException(`Membership ${groupId}: only Family and Corporate group memberships can be activated.`);
    }
    const contribution = await this.financialService.findByIdempotencyKey(groupApplicationContributionKey(groupId));
    if (!contribution || contribution.state !== 'COMPLETED') {
      throw new ConflictException(
        `Membership ${groupId} cannot be activated: its Financial Contribution is ` +
        `${contribution ? `in state '${contribution.state}'` : 'missing'}; activation requires COMPLETED.`,
      );
    }
  }

  // A member record may only be activated (and so numbered) when:
  //   • its group relationship is APPROVED or ACTIVE (never PENDING,
  //     REJECTED, EXPIRED, SUSPENDED or TERMINATED) and paid;
  //   • its seat on the group roster is ACCEPTED and points at THIS record
  //     (an INVITED seat, or one revoked by an administrator, never numbers).
  private async assertGroupMemberActivationPreconditions(member: MembershipRow): Promise<void> {
    const memberId = Number(member.id);
    const group = await this.getOrThrow(Number(member.parent_membership_id));
    if (group.owner_type !== 'GROUP' || !['APPROVED', 'ACTIVE'].includes(group.lifecycle_state)) {
      throw new ConflictException(
        `Membership ${memberId} cannot be activated: its group membership ${group.id} is ${group.lifecycle_state}; ` +
        `it must be APPROVED or ACTIVE.`,
      );
    }
    await this.assertGroupRelationshipPayable(group);

    const seat = await db
      .selectFrom('group_delegates')
      .select(['status', 'member_membership_id'])
      .where('group_entity_id', '=', group.group_entity_id!)
      .where('user_id', '=', member.user_id!)
      .executeTakeFirst();
    if (!seat || seat.status !== 'ACCEPTED' || Number(seat.member_membership_id) !== memberId) {
      throw new ConflictException(
        `Membership ${memberId} cannot be activated: the member's group seat is ` +
        `${seat?.status ?? 'missing'}; activation requires an ACCEPTED seat.`,
      );
    }
  }

  // Row-locks the group relationship and, if still APPROVED, activates it
  // (UNNUMBERED -- see activate()). Returns the group's term end, which every
  // member record shares. Never touches numbering.
  private async activateGroupRelationshipInTrx(
    trx: Kysely<DB>,
    groupId: number,
    now: Date,
    actor: { type: 'SYSTEM' | 'ADMIN'; userId?: number | null },
  ): Promise<string | null> {
    const group = await trx
      .selectFrom('memberships')
      .selectAll()
      .where('id', '=', groupId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (group.lifecycle_state === 'ACTIVE') {
      return group.expires_at ? toMysqlDatetime(new Date(group.expires_at as unknown as string)) : null;
    }
    if (group.lifecycle_state !== 'APPROVED') {
      throw new ConflictException(`Group membership ${groupId} is ${group.lifecycle_state}; it cannot be activated.`);
    }

    const expiresAt = await this.computeExpiry(group, now);
    await trx
      .updateTable('memberships')
      .set({
        lifecycle_state: 'ACTIVE',
        activated_at: toMysqlDatetime(now),
        expires_at: expiresAt,
        last_payment_status: 'SUCCEEDED',
        pending_contribution_id: null,
      })
      .where('id', '=', groupId)
      .where('lifecycle_state', '=', 'APPROVED')
      .execute();

    await logMembershipAudit(
      {
        membershipId: groupId,
        eventType: 'LIFECYCLE_TRANSITION',
        actorType: actor.type,
        actorUserId: actor.userId ?? null,
        oldValue: { state: 'APPROVED' },
        newValue: { state: 'ACTIVE', numbered: false },
        notes: 'Group relationship activated; members hold their own numbered records (MEM-007 MP-002).',
      },
      trx,
    );
    return expiresAt;
  }

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
