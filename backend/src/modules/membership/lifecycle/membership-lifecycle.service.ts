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
import { EmailService } from '../../shared/communication/email.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

type LifecycleState = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED' | 'REJECTED';
type MembershipRow = Selectable<MembershipsTable>;

export interface ApplyMembershipParams {
  membershipClassId: number;
  ownerType: 'INDIVIDUAL' | 'GROUP';
  userId?: number | null;
  groupEntityId?: number | null;
}

@Injectable()
export class MembershipLifecycleService {
  constructor(
    private readonly numberingService: MembershipNumberingService,
    private readonly emailService: EmailService,
    private readonly entitlementService: EntitlementService,
  ) {}

  // Renewal policy (confirmed this session): renewable classes carry
  // renewal_term_months / grace_period_days in class_entitlements (layer 1
  // only -- see EntitlementService.getClassConfigValue). Lifetime classes
  // get expires_at = null. A renewable class MISSING its config is treated
  // as a loud error, not silently perpetual.
  private async computeExpiry(membershipClassId: number, from: Date): Promise<string | null> {
    const cls = await db
      .selectFrom('membership_classes')
      .select(['is_renewable', 'is_lifetime', 'name'])
      .where('id', '=', membershipClassId)
      .executeTakeFirstOrThrow();

    if (cls.is_lifetime || !cls.is_renewable) return null;

    const termRaw = await this.entitlementService.getClassConfigValue(membershipClassId, 'renewal_term_months');
    if (!termRaw) {
      throw new ConflictException(
        `Class "${cls.name}" is renewable but has no renewal_term_months configured -- refusing to activate with an undefined term. Run seed_0004 or set it via the entitlements endpoint.`,
      );
    }
    const months = parseInt(termRaw, 10);
    const expiry = new Date(from);
    expiry.setMonth(expiry.getMonth() + months);
    return toMysqlDatetime(expiry);
  }

  private async gracePeriodDays(membershipClassId: number): Promise<number> {
    const raw = await this.entitlementService.getClassConfigValue(membershipClassId, 'grace_period_days');
    return raw ? parseInt(raw, 10) : 0;
  }

  // ======================================================================
  // -> PENDING
  // ======================================================================
  async apply(params: ApplyMembershipParams): Promise<{ id: number; uuid: string }> {
    if (params.ownerType === 'INDIVIDUAL' && !params.userId) {
      throw new BadRequestException('userId is required for an INDIVIDUAL membership application.');
    }
    if (params.ownerType === 'GROUP' && !params.groupEntityId) {
      throw new BadRequestException('groupEntityId is required for a GROUP membership application.');
    }

    const membershipClass = await db
      .selectFrom('membership_classes')
      .selectAll()
      .where('id', '=', params.membershipClassId)
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

    if (params.ownerType === 'INDIVIDUAL') {
      const existingOpen = await db
        .selectFrom('memberships')
        .select('id')
        .where('user_id', '=', params.userId!)
        .where('lifecycle_state', 'in', ['PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED'])
        .executeTakeFirst();
      if (existingOpen) {
        throw new ConflictException('This user already has an open or active membership record.');
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
        membership_class_id: params.membershipClassId,
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

    await this.notifyOwner(
      membership,
      'Your BCC membership application has been approved',
      `<p>Your membership application has been approved. Complete payment (or contact a coordinator for manual activation) to activate your membership.</p>`,
    );
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

    await this.notifyOwner(
      membership,
      'Your BCC membership application was not approved',
      `<p>Your membership application was not approved.</p><p>Reason: ${escapeHtml(reason)}</p><p>You are welcome to re-apply after 30 days.</p>`,
    );
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

    const expiresAt = await this.computeExpiry(membership.membership_class_id, now);

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
    await this.notifyOwner(
      refreshed,
      'Welcome to Bhopal Camera Club — your membership is active',
      `<p>Your membership is now active. Your permanent membership number is <strong>${result.membershipNumber}</strong>.</p>` +
        `<p>This number is permanent per club policy (MEM-007) and will never change for the lifetime of your membership.</p>`,
    );

    return result;
  }

  // ======================================================================
  // APPROVED — payment failure (stays APPROVED; MEM-007: no number
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

    await this.notifyOwner(
      membership,
      'Your BCC membership payment did not go through',
      `<p>Your recent membership payment attempt failed. Please retry payment to activate your membership.</p>`,
    );
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

    await this.notifyOwner(
      membership,
      'Your BCC membership has been suspended',
      `<p>Your membership has been suspended.</p><p>Reason: ${escapeHtml(reason)}</p>`,
    );
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

    await this.notifyOwner(
      membership,
      'Your BCC membership has been reinstated',
      `<p>Your suspension has been lifted. Full membership benefits are restored.</p>`,
    );
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

    await this.notifyOwner(
      membership,
      'Your BCC membership has expired',
      `<p>Your membership has expired. Renew to restore full benefits.</p>`,
    );
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
      const graceDays = await this.gracePeriodDays(membership.membership_class_id);
      const graceEnd = new Date(membership.expires_at);
      graceEnd.setDate(graceEnd.getDate() + graceDays);
      if (new Date() > graceEnd) {
        throw new ConflictException(
          `The ${graceDays}-day renewal grace period ended on ${graceEnd.toISOString().slice(0, 10)}. A new membership application is required.`,
        );
      }
    }

    const newExpiry = await this.computeExpiry(membership.membership_class_id, new Date());

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

    await this.notifyOwner(
      membership,
      'Your BCC membership has been renewed',
      `<p>Your membership has been renewed. Your membership number remains <strong>${membership.membership_number}</strong> — it never changes.</p>`,
    );
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

    await this.notifyOwner(
      membership,
      'Your BCC membership has been terminated',
      `<p>Your membership has been terminated.</p><p>Reason: ${escapeHtml(reason)}</p><p>Re-admission requires a new application.</p>`,
    );
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
      .where('expires_at', '<', toMysqlDatetime(new Date()))
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

  private async notifyOwner(
    membership: Pick<MembershipRow, 'owner_type' | 'user_id' | 'group_entity_id'>,
    subject: string,
    html: string,
  ): Promise<void> {
    const recipientUserId =
      membership.owner_type === 'INDIVIDUAL' ? membership.user_id : await this.groupPrimaryContact(membership.group_entity_id);

    if (!recipientUserId) return;

    const user = await db.selectFrom('users').select('email').where('id', '=', recipientUserId).executeTakeFirst();
    if (!user?.email) return;

    await this.emailService.send(user.email, subject, html);
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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
