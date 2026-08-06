// backend/src/modules/membership/admin/membership-admin.service.ts
//
// Admin-facing queries for the membership dashboard and management console.
// Provides:
//   - Class catalogue with their current entitlements (benefit config view)
//   - Dashboard stats (counts by lifecycle state / class)
//   - Senior status eligibility evaluation (MEM-008 three-rule engine)
//   - Recent audit events
//   - Notification type catalogue for admin panel display

import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { db } from '../../../database/db';
import { CommunicationService } from '../../shared/communication/communication.service';
import { RecognitionService } from '../recognition/recognition.service';
import { logMembershipAudit } from '../shared/membership-audit.util';

@Injectable()
export class MembershipAdminService {
  constructor(
    private readonly communicationService: CommunicationService,
    private readonly recognitionService: RecognitionService,
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
          portal_link: 'https://v3bcc.bhopal.info/hub/',
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
          portal_link: 'https://v3bcc.bhopal.info/hub/',
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
}
