// backend/src/modules/membership/lifecycle/membership-lifecycle.service.ts
//
// MEM-006 seven-state lifecycle machine (spec 02.5). "No lifecycle
// simplification is authorised" -- all seven states implemented, no
// merged/removed/bypassed states: PENDING, APPROVED, ACTIVE, SUSPENDED,
// EXPIRED, TERMINATED, REJECTED.
//
// Permanent number allocation happens ONLY inside activate(), as the final
// step of the APPROVED -> ACTIVE transition (MEM-007 Allocation Trigger).
// No other method in this service ever touches number_serial/
// membership_number -- that's MembershipNumberingService's job exclusively.
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
      fixHint = 'Run seed_0005 or set it via the group entitlements endpoint.';
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
      fixHint = 'Run seed_0004 or set it via the entitlements endpoint.';
    }

    if (isLifetime || !isRenewable) return null;

    if (!termRaw) {
      throw new ConflictException(
        `"${holderName}" is renewable but has no renewal_term_months configured -- refusing to activate with an undefined term. ${fixHint}`,
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

    return { id, uuid };
  }

  // ======================================================================
  // PENDING -> APPROVED
  // ======================================================================
  async approve(membershipId: number, actorUserId: number): Promise<void> {
    const membership = await this.requireState(membershipId, ['PENDING']);

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

    await this.notifyMember(membership, 'MEMBERSHIP_APPLICATION_APPROVED');
  }

  // ======================================================================
  // PENDING -> REJECTED
  // ======================================================================
  async reject(membershipId: number, actorUserId: number, reason: string): Promise<void> {
    const membership = await this.requireState(membershipId, ['PENDING']);

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
  // APPROVED -> ACTIVE  (MEM-007 Allocation Trigger lives here, and ONLY
  // here -- see MembershipNumberingService header)
  // ======================================================================
  async activate(
    membershipId: number,
    actor: { type: 'SYSTEM' | 'ADMIN'; userId?: number | null },
    opts?: { paymentId?: number | null; joinYear?: number; joinMonth?: number },
  ): Promise<{ membershipNumber: string }> {
    const membership = await this.requireState(membershipId, ['APPROVED']);

    const now = new Date();
    const joinYear = opts?.joinYear ?? now.getFullYear();
    const joinMonth = opts?.joinMonth ?? now.getMonth() + 1;

    const expiresAt = await this.computeExpiry(membership, now);

    const result = await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('memberships')
        .set({
          lifecycle_state: 'ACTIVE',
          activated_at: toMysqlDatetime(now),
          expires_at: expiresAt,
          last_payment_status: opts?.paymentId ? 'SUCCEEDED' : 'NONE',
          pending_payment_id: null,
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
      newValue: { state: 'ACTIVE', membershipNumber: result.membershipNumber },
    });

    const refreshed = await this.getOrThrow(membershipId);
    await this.notifyMember(refreshed, 'MEMBERSHIP_ACTIVATED', {
      membership_number: result.membershipNumber,
      expiry_date: refreshed.expires_at
        ? new Date(refreshed.expires_at as unknown as string)
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'see member portal',
    }, { actionUrl: '/member' });

    return result;
  }

  // ======================================================================
  // APPROVED -- payment failure (stays APPROVED; MEM-007: no number
  // assignment happens on this path)
  // ======================================================================
  async recordPaymentFailure(membershipId: number, notes?: string): Promise<void> {
    const membership = await this.requireState(membershipId, ['APPROVED']);

    await db
      .updateTable('memberships')
      .set({ last_payment_status: 'FAILED', pending_payment_id: null })
      .where('id', '=', membershipId)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'PAYMENT_FAILED',
      actorType: 'SYSTEM',
      notes: notes ?? null,
    });

    const failedAmount = await this.resolvePaymentAmount(membership.pending_payment_id);
    await this.notifyMember(membership, 'PAYMENT_FAILED', {
      amount: failedAmount,
    });
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

  // Looks up amount_paise from the payments table for PAYMENT_FAILED variables.
  private async resolvePaymentAmount(paymentId: number | null): Promise<string> {
    if (!paymentId) return '';
    const payment = await db
      .selectFrom('payments')
      .select('amount_paise')
      .where('id', '=', paymentId)
      .executeTakeFirst();
    return payment ? String(Math.round(payment.amount_paise / 100)) : '';
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
