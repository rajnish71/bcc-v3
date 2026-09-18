// backend/src/modules/membership/admin/membership-admin.service.ts
//
// Admin-facing queries for the membership dashboard and management console.
// Provides:
//   - Class catalogue with their current entitlements (benefit config view)
//   - Dashboard stats (counts by lifecycle state / class)
//   - Senior status eligibility evaluation (MEM-008 three-rule engine)
//   - Recent audit events
//   - Notification type catalogue for admin panel display

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../../database/db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { RecognitionService } from '../recognition/recognition.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

@Injectable()
export class MembershipAdminService {
  constructor(
    private readonly communicationService: CommunicationService,
    private readonly recognitionService: RecognitionService,
    private readonly financialService: FinancialContributionService,
    private readonly entitlementService: EntitlementService,
    private readonly lifecycleService: MembershipLifecycleService,
  ) {}

  // -------------------------------------------------------------------------
  // Membership class catalogue with entitlements for admin benefit config view
  // -------------------------------------------------------------------------
  async listClassesWithEntitlements() {
    const classes = await db
      .selectFrom('membership_classes')
      .selectAll()
      .orderBy('sort_order', 'asc')
      .execute();

    const entitlements = await db
      .selectFrom('class_entitlements')
      .selectAll()
      .execute();

    const entitlementsByClass = new Map<number, Record<string, string>>();
    for (const e of entitlements) {
      const existing = entitlementsByClass.get(e.membership_class_id) ?? {};
      existing[e.entitlement_key] = e.entitlement_value;
      entitlementsByClass.set(e.membership_class_id, existing);
    }

    return classes.map((cls) => ({
      ...cls,
      entitlements: entitlementsByClass.get(cls.id) ?? {},
    }));
  }

  // -------------------------------------------------------------------------
  // Dashboard stats
  // -------------------------------------------------------------------------
  async getDashboardStats() {
    const statRows = await db
      .selectFrom('memberships as m')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.lifecycle_state',
        'mc.name as class_name',
        'mc.type as class_type',
        db.fn.countAll<string>().as('count'),
      ])
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .groupBy(['m.lifecycle_state', 'mc.name', 'mc.type'])
      .execute();

    const byState: Record<string, number> = {};
    const byClass: Record<string, number> = {};

    for (const row of statRows) {
      byState[row.lifecycle_state] = (byState[row.lifecycle_state] ?? 0) + Number(row.count);
      if (row.class_name) {
        byClass[row.class_name] = (byClass[row.class_name] ?? 0) + Number(row.count);
      }
    }

    // Members expiring in the next 30 days
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const expiringRows = await db
      .selectFrom('memberships')
      .select(db.fn.count<number>('id').as('count'))
      .where('lifecycle_state', '=', 'ACTIVE')
      .where('expires_at', 'is not', null)
      .where('expires_at', '<=', thirtyDaysOut)
      .execute();

    return {
      byState,
      byClass,
      expiringIn30Days: Number(expiringRows[0]?.count ?? 0),
    };
  }

  // -------------------------------------------------------------------------
  // Recent lifecycle audit events
  // -------------------------------------------------------------------------
  async listRecentEvents(limit: number = 50) {
    return db
      .selectFrom('membership_audit_log as al')
      .leftJoin('memberships as m', 'm.id', 'al.membership_id')
      .leftJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('users as actor', 'actor.id', 'al.actor_user_id')
      .select([
        'al.id',
        'al.membership_id',
        'al.event_type',
        'al.actor_type',
        'al.new_value',
        'al.old_value',
        'al.notes',
        'al.created_at',
        'u.full_name as member_name',
        'u.username as member_username',
        'actor.full_name as actor_name',
      ])
      .orderBy('al.created_at', 'desc')
      .limit(limit)
      .execute();
  }

  // -------------------------------------------------------------------------
  // Senior Member eligibility evaluation (MEM-008 three-rule engine)
  //
  // Thresholds are read from recognition_criteria (SENIOR_MEMBER rows)
  // so governance can amend them without a code deployment.
  // Seeded by migration 0085. Fall-back defaults preserve the original
  // constitutional values if a row is missing.
  //
  // Rule 1: age >= rule_age_only_min_age (default 60)
  // Rule 2: age >= rule_age_tenure_min_age (default 50)
  //         AND tenure >= rule_age_tenure_min_tenure_years (default 5)
  // Rule 3: tenure >= rule_tenure_only_min_years (default 10)
  //
  // Returns a list of ACTIVE memberships that qualify but do not yet hold
  // SENIOR_MEMBER recognition. Calling assignSeniorStatus() awards them.
  // -------------------------------------------------------------------------
  async listSeniorStatusEligible() {
    // Load configurable thresholds from DB (MEM-008 P0.3 -- no hardcoded values)
    const criteriaRows = await db
      .selectFrom('recognition_criteria')
      .select(['criteria_key', 'criteria_value'])
      .where('recognition_code', '=', 'SENIOR_MEMBER')
      .execute();
    const cfg = Object.fromEntries(criteriaRows.map((r) => [r.criteria_key, r.criteria_value]));

    const ageOnlyMin        = parseFloat(cfg['rule_age_only_min_age']           ?? '60');
    const ageTenureMinAge   = parseFloat(cfg['rule_age_tenure_min_age']          ?? '50');
    const ageTenureMinTenure = parseFloat(cfg['rule_age_tenure_min_tenure_years'] ?? '5');
    const tenureOnlyMin     = parseFloat(cfg['rule_tenure_only_min_years']       ?? '10');

    const activeRows = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('member_recognitions as mr', (join) =>
        join
          .onRef('mr.membership_id', '=', 'm.id')
          .on('mr.recognition_code', '=', 'SENIOR_MEMBER')
          .on('mr.status', '=', 'ACTIVE'),
      )
      .select([
        'm.id as membership_id',
        'm.join_year',
        'm.join_month',
        'u.id as user_id',
        'u.full_name',
        'u.username',
        'u.date_of_birth',
        'mr.id as recognition_id',
      ])
      .where('m.lifecycle_state', '=', 'ACTIVE')
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .where('mr.id', 'is', null)
      .execute();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const eligible: Array<{
      membershipId: number;
      userId: number;
      fullName: string | null;
      username: string | null;
      joinYear: number | null;
      joinMonth: number | null;
      ageYears: number | null;
      tenureYears: number;
      qualifyingRules: string[];
    }> = [];

    for (const row of activeRows) {
      const qualifyingRules: string[] = [];

      // Compute membership tenure in years (fractional)
      let tenureYears = 0;
      if (row.join_year) {
        tenureYears =
          currentYear - row.join_year + (currentMonth - (row.join_month ?? 1)) / 12;
      }

      // Compute age in years
      let ageYears: number | null = null;
      if (row.date_of_birth) {
        const dob = new Date(row.date_of_birth as unknown as string);
        ageYears =
          currentYear - dob.getFullYear() +
          (currentMonth - (dob.getMonth() + 1)) / 12;
      }

      // Rule 1: age >= ageOnlyMin (default 60)
      if (ageYears !== null && ageYears >= ageOnlyMin) {
        qualifyingRules.push(`age_${ageOnlyMin}_plus`);
      }
      // Rule 2: age >= ageTenureMinAge AND tenure >= ageTenureMinTenure
      if (ageYears !== null && ageYears >= ageTenureMinAge && tenureYears >= ageTenureMinTenure) {
        qualifyingRules.push(`age_${ageTenureMinAge}_tenure_${ageTenureMinTenure}`);
      }
      // Rule 3: tenure >= tenureOnlyMin (default 10)
      if (tenureYears >= tenureOnlyMin) {
        qualifyingRules.push(`tenure_${tenureOnlyMin}_years`);
      }

      if (qualifyingRules.length > 0) {
        eligible.push({
          membershipId: row.membership_id,
          userId: row.user_id,
          fullName: row.full_name,
          username: row.username,
          joinYear: row.join_year,
          joinMonth: row.join_month,
          ageYears: ageYears ? Math.floor(ageYears) : null,
          tenureYears: Math.floor(tenureYears),
          qualifyingRules,
        });
      }
    }

    return eligible;
  }

  // Evaluate all eligible and assign SENIOR_MEMBER recognition, then notify.
  async assignSeniorStatusToEligible(actorUserId: number): Promise<{ assigned: number }> {
    const eligible = await this.listSeniorStatusEligible();
    let assigned = 0;

    for (const member of eligible) {
      try {
        await this.recognitionService.assign(
          member.membershipId,
          'SENIOR_MEMBER',
          'AUTO',
          `Auto-assigned: qualifies via ${member.qualifyingRules.join(', ')}`,
          actorUserId,
        );

        await this.communicationService.dispatch('SENIOR_STATUS_ACHIEVED', member.userId, {
          full_name: member.fullName ?? '',
          portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
        });

        assigned++;
      } catch {
        // Already has recognition or other conflict -- skip silently
      }
    }

    await logMembershipAudit({
      membershipId: null,
      eventType: 'SENIOR_STATUS_BATCH',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { assigned, total_eligible: eligible.length },
    });

    return { assigned };
  }

  // -------------------------------------------------------------------------
  // Renewal reminder dispatch (MEM-008 §Lifecycle P1)
  //
  // Dispatches RENEWAL_REMINDER_30/15/7/1 for members whose expiry falls
  // within a ±1-day window around each threshold. A notification_log check
  // prevents re-sending the same reminder type to the same user within 2 days.
  //
  // No scheduler exists (RAM-conscious, deliberate). Call this endpoint
  // daily via an external cron or admin action to drive the reminder cycle.
  // -------------------------------------------------------------------------
  async dispatchRenewalReminders(): Promise<{ dispatched: Record<string, number> }> {
    const thresholds = [
      { days: 30, typeKey: 'RENEWAL_REMINDER_30' },
      { days: 15, typeKey: 'RENEWAL_REMINDER_15' },
      { days: 7,  typeKey: 'RENEWAL_REMINDER_7'  },
      { days: 1,  typeKey: 'RENEWAL_REMINDER_1'  },
    ];

    const dispatched: Record<string, number> = {};

    for (const { days, typeKey } of thresholds) {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() + days - 1);
      const windowEnd = new Date();
      windowEnd.setDate(windowEnd.getDate() + days + 1);

      const candidates = await db
        .selectFrom('memberships as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
        .select([
          'm.id as membership_id',
          'm.membership_number',
          'm.expires_at',
          'u.id as user_id',
          'u.full_name',
          'mc.name as class_name',
        ])
        .where('m.lifecycle_state', '=', 'ACTIVE')
        .where('m.expires_at', 'is not', null)
        .where('m.expires_at', '>=', windowStart)
        .where('m.expires_at', '<', windowEnd)
        .where('m.owner_type', '=', 'INDIVIDUAL')
        .execute();

      dispatched[typeKey] = 0;
      const dedupeWindow = new Date(Date.now() - 2 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      for (const member of candidates) {
        // Idempotency: skip if same reminder type already sent to this user within last 2 days
        const alreadySent = await db
          .selectFrom('notification_log')
          .select('id')
          .where('user_id', '=', member.user_id)
          .where('type_key', '=', typeKey)
          .where('status', 'in', ['SENT', 'QUEUED'])
          .where(sql<boolean>`created_at >= ${dedupeWindow}`)
          .executeTakeFirst();

        if (alreadySent) continue;

        const expiryDisplay = new Date(member.expires_at as unknown as string)
          .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        await this.communicationService.dispatch(typeKey, member.user_id, {
          full_name: member.full_name ?? '',
          membership_class: member.class_name ?? '',
          membership_number: member.membership_number ?? '',
          expiry_date: expiryDisplay,
          portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
        });

        dispatched[typeKey]++;
      }
    }

    await logMembershipAudit({
      membershipId: null,
      eventType: 'RENEWAL_REMINDERS_DISPATCHED',
      actorType: 'SYSTEM',
      actorUserId: null,
      newValue: dispatched,
    });

    return { dispatched };
  }

  // -------------------------------------------------------------------------
  // Notification type catalogue for admin display
  // -------------------------------------------------------------------------
  async listNotificationTypes() {
    return db
      .selectFrom('notification_types')
      .selectAll()
      .where('module', 'in', ['MEMBERSHIP', 'RENEWAL'])
      .orderBy('is_active', 'desc')
      .orderBy('module', 'asc')
      .orderBy('type_key', 'asc')
      .execute();
  }

  // -------------------------------------------------------------------------
  // Email template listing for admin editor
  // -------------------------------------------------------------------------
  async listEmailTemplates() {
    return db
      .selectFrom('notification_templates')
      .selectAll()
      .where('channel', '=', 'EMAIL')
      .innerJoin('notification_types as nt', 'nt.type_key', 'notification_templates.type_key')
      .where('nt.module', 'in', ['MEMBERSHIP', 'RENEWAL'])
      .orderBy('notification_templates.type_key', 'asc')
      .execute();
  }

  // -------------------------------------------------------------------------
  // Members expiring soon (for admin renewal action list)
  // -------------------------------------------------------------------------
  async listExpiringSoon(days: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    return db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.id',
        'm.membership_number',
        'm.expires_at',
        'm.lifecycle_state',
        'u.full_name',
        'u.email',
        'u.username',
        'mc.name as class_name',
      ])
      .where('m.lifecycle_state', '=', 'ACTIVE')
      .where('m.expires_at', 'is not', null)
      .where('m.expires_at', '<=', cutoff)
      .where('m.owner_type', '=', 'INDIVIDUAL')
      .orderBy('m.expires_at', 'asc')
      .execute();
  }

  // -------------------------------------------------------------------------
  // Exceptional administrative courtesy: grant a time-boxed complimentary
  // (₹0) membership period for a specific, individually-authorized case --
  // e.g. an applicant blocked by a payment gateway that is not currently
  // collecting real payments. This is NOT a general waiver mechanism: it
  // composes existing PAY-001 primitives (zero-value Contribution, refund,
  // cancellation) and the existing lifecycle machine (approve/activate) --
  // it does not touch class-level fee_inr or renewal_term_months, so the
  // standard plan for this class is completely untouched for every other
  // applicant. The complimentary window itself is recorded via the existing
  // individual_overrides mechanism (key: complimentary_period) purely as a
  // marker/expiry-anchor -- entitlement resolution for fee/term keys never
  // reads layer 3 (see EntitlementService.getClassConfigValue), so this
  // marker cannot silently alter pricing for anyone.
  //
  // Requires the membership to be PENDING (the normal application-intake
  // state) -- this is a courtesy extended during onboarding, not a mid-life
  // membership mutation.
  // -------------------------------------------------------------------------
  async grantComplimentaryMembership(
    membershipId: number,
    actorUserId: number,
    months: number,
    reason: string,
  ): Promise<{ membershipNumber: string; expiresAt: string }> {
    const membership = await db
      .selectFrom('memberships')
      .selectAll()
      .where('id', '=', membershipId)
      .executeTakeFirst();
    if (!membership) throw new BadRequestException(`Membership ${membershipId} not found.`);

    if (membership.lifecycle_state !== 'PENDING') {
      throw new ConflictException(
        `Membership ${membershipId} is in state '${membership.lifecycle_state}'; a complimentary grant requires PENDING.`,
      );
    }
    if (membership.owner_type !== 'INDIVIDUAL' || membership.membership_class_id == null || !membership.user_id) {
      throw new BadRequestException('Complimentary grants are only supported for INDIVIDUAL memberships with a membership class.');
    }

    // Resolve any existing Financial Contribution before creating the ₹0
    // complimentary one -- PAY-001 never leaves two live obligations for the
    // same application. A COMPLETED contribution (even one produced by a
    // dummy/test-mode gateway) is reversed through a real refund, never
    // silently discarded; a non-terminal one is cancelled.
    const existing = await this.financialService.findLatestForBusinessReference('MEMBERSHIP', membershipId);
    if (existing) {
      if (existing.state === 'COMPLETED') {
        await this.financialService.requestRefund(
          Number(existing.id),
          `Reversed for complimentary membership grant: ${reason}`,
          { actorType: 'HUMAN', actorUserId },
        );
      } else if (['CREATED', 'AWAITING_SETTLEMENT'].includes(existing.state)) {
        await this.financialService.cancelContribution(
          Number(existing.id),
          `Cancelled for complimentary membership grant: ${reason}`,
        );
      } else if (existing.state === 'SETTLEMENT_IN_PROGRESS') {
        // Not cancellable (PAY-001 state machine) -- this attempt is stuck
        // mid-checkout and will never resolve. ABANDONED is the correct
        // terminal state for an administratively-determined dead attempt.
        await this.financialService.transitionContribution(Number(existing.id), 'ABANDONED');
      }
      // FAILED / CANCELLED / EXPIRED / ABANDONED / REFUNDED are already
      // terminal -- nothing to resolve.
    }

    const idempotencyKey = `MEMBERSHIP-${membershipId}-COMPLIMENTARY-CONTRIBUTION`;
    const { id: contributionId } = await this.financialService.createContribution({
      payerUserId: membership.user_id,
      businessModule: 'MEMBERSHIP',
      businessReferenceId: membershipId,
      purpose: `Complimentary membership (${months}-month courtesy period)`,
      amountPaise: 0,
      idempotencyKey,
    });
    await this.financialService.processZeroValueContribution(contributionId);

    await db
      .updateTable('memberships')
      .set({ pending_contribution_id: contributionId })
      .where('id', '=', membershipId)
      .execute();

    const expiresAtDate = new Date();
    expiresAtDate.setMonth(expiresAtDate.getMonth() + months);
    const expiresAtMysql = toMysqlDatetime(expiresAtDate);

    await this.lifecycleService.approve(membershipId, actorUserId, { expiresAtOverride: expiresAtMysql });

    await this.entitlementService.grantOverride(
      membershipId,
      'complimentary_period',
      'GRANT',
      'ACTIVE',
      reason,
      actorUserId,
      expiresAtMysql,
    );

    const activated = await this.lifecycleService.getOrThrow(membershipId);
    const [cls, user, feeRaw] = await Promise.all([
      db.selectFrom('membership_classes').select(['name', 'code']).where('id', '=', membership.membership_class_id).executeTakeFirst(),
      db.selectFrom('users').select('full_name').where('id', '=', membership.user_id).executeTakeFirst(),
      this.entitlementService.getClassConfigValue(membership.membership_class_id, 'fee_inr'),
    ]);

    await logMembershipAudit({
      membershipId,
      eventType: 'COMPLIMENTARY_MEMBERSHIP_GRANTED',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { months, expiresAt: expiresAtMysql, classCode: cls?.code, contributionId },
      notes: reason,
    });

    const untilDisplay = expiresAtDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    await this.communicationService.dispatch(
      'MEMBERSHIP_COMPLIMENTARY_ACTIVATED',
      membership.user_id,
      {
        full_name: user?.full_name ?? '',
        membership_class: cls?.name ?? '',
        membership_number: activated.membership_number ?? '',
        complimentary_until: untilDisplay,
        renewal_fee: feeRaw ? `₹${feeRaw}` : 'the standard fee',
        portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
      },
      { actionUrl: '/hub/' },
    );

    return { membershipNumber: activated.membership_number ?? '', expiresAt: expiresAtMysql };
  }
}
