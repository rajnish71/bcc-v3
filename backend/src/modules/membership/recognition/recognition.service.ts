// backend/src/modules/membership/recognition/recognition.service.ts
//
// Spec 02.9 dual-track recognitions.
//   MANUAL track: explicit admin assignment with mandatory reason.
//   AUTO track:   criteria evaluated against recognition_criteria config.
//
// evaluateAutoEligibility() REPORTS eligibility -- it does not auto-assign.
// Assignment always happens through assign(), as an explicit recorded act.
// Rationale: no scheduler exists (RAM-conscious, deliberate), and silent
// auto-assignment of what is effectively an honour would bypass the human
// step the club actually operates with. If governance later wants true
// automatic assignment, that's a one-line change at the call site, not an
// architecture change.
//
// Single-active-recognition is enforced by the DB (generated active_lock
// column + unique index) -- assign() surfaces that DB error as a clean
// conflict message rather than pre-checking racily.
//
// TENURE INTERPRETATION FLAG: tenure for AUTO criteria is computed from
// join_year/join_month (the permanent, MEM-007-anchored joining date), not
// activated_at. For migrated founding/historical members those will differ
// substantially; join date is the defensible reading of "tenure" but it IS
// an interpretation -- confirm with governance before first real AUTO award.

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../../../database/db';
import { logMembershipAudit } from '../shared/membership-audit.util';

type RecognitionCode =
  | 'SENIOR_MEMBER'
  | 'HONORARY_SENIOR_MEMBER'
  | 'HONORARY_MEMBER'
  | 'HONORARY_MENTOR'
  | 'HONORARY_GRANDMASTER';

@Injectable()
export class RecognitionService {
  async listForMembership(membershipId: number) {
    return db
      .selectFrom('member_recognitions')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .orderBy('start_date', 'desc')
      .execute();
  }

  async assign(
    membershipId: number,
    recognitionCode: RecognitionCode,
    track: 'AUTO' | 'MANUAL',
    reason: string,
    actorUserId: number,
    startDate?: string,
  ): Promise<void> {
    const membership = await db
      .selectFrom('memberships')
      .select(['id', 'lifecycle_state'])
      .where('id', '=', membershipId)
      .executeTakeFirst();
    if (!membership) throw new NotFoundException('Membership record not found.');
    if (membership.lifecycle_state !== 'ACTIVE') {
      throw new ConflictException(
        `Recognitions can only be assigned to ACTIVE memberships (current state: ${membership.lifecycle_state}).`,
      );
    }

    try {
      await db
        .insertInto('member_recognitions')
        .values({
          membership_id: membershipId,
          recognition_code: recognitionCode,
          track,
          status: 'ACTIVE',
          reason,
          assigned_by_user_id: actorUserId,
          start_date: startDate ?? new Date().toISOString().slice(0, 10),
        })
        .execute();
    } catch (err: unknown) {
      // uq on active_lock -> exactly one ACTIVE recognition per membership
      if (err instanceof Error && err.message.includes('Duplicate entry')) {
        throw new ConflictException(
          'This membership already has an active recognition. Revoke it first -- only one recognition may be active at a time (DB-enforced).',
        );
      }
      throw err;
    }

    await logMembershipAudit({
      membershipId,
      eventType: 'RECOGNITION_ASSIGNED',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { recognitionCode, track },
      notes: reason,
    });
  }

  async revoke(membershipId: number, reason: string, actorUserId: number): Promise<void> {
    const active = await db
      .selectFrom('member_recognitions')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();
    if (!active) throw new NotFoundException('No active recognition on this membership.');

    await db
      .updateTable('member_recognitions')
      .set({ status: 'HISTORICAL', end_date: new Date().toISOString().slice(0, 10) })
      .where('id', '=', active.id)
      .execute();

    await logMembershipAudit({
      membershipId,
      eventType: 'RECOGNITION_REVOKED',
      actorType: 'ADMIN',
      actorUserId,
      oldValue: { recognitionCode: active.recognition_code, track: active.track },
      notes: reason,
    });
  }

  // ---- AUTO-track criteria -------------------------------------------

  async listCriteria() {
    return db.selectFrom('recognition_criteria').selectAll().orderBy('recognition_code').execute();
  }

  async setCriteria(
    recognitionCode: RecognitionCode,
    criteriaKey: string,
    criteriaValue: string,
    actorUserId: number,
  ): Promise<void> {
    await db
      .insertInto('recognition_criteria')
      .values({
        recognition_code: recognitionCode,
        criteria_key: criteriaKey,
        criteria_value: criteriaValue,
        updated_by_user_id: actorUserId,
      })
      .onDuplicateKeyUpdate({ criteria_value: criteriaValue, updated_by_user_id: actorUserId })
      .execute();

    await logMembershipAudit({
      membershipId: null,
      eventType: 'RECOGNITION_CRITERIA_SET',
      actorType: 'ADMIN',
      actorUserId,
      newValue: { recognitionCode, criteriaKey, criteriaValue },
    });
  }

  // Reports eligibility; never assigns. See file header.
  async evaluateAutoEligibility(membershipId: number): Promise<{
    membershipId: number;
    tenureYears: number | null;
    evaluations: Array<{
      recognitionCode: string;
      criteriaKey: string;
      required: string;
      actual: string | null;
      eligible: boolean | null;
    }>;
  }> {
    const membership = await db
      .selectFrom('memberships')
      .select(['id', 'join_year', 'join_month', 'lifecycle_state'])
      .where('id', '=', membershipId)
      .executeTakeFirst();
    if (!membership) throw new NotFoundException('Membership record not found.');

    let tenureYears: number | null = null;
    if (membership.join_year && membership.join_month) {
      const joined = new Date(membership.join_year, membership.join_month - 1, 1);
      tenureYears = (Date.now() - joined.getTime()) / (365.25 * 24 * 3600 * 1000);
      tenureYears = Math.floor(tenureYears * 100) / 100;
    }

    const criteria = await db.selectFrom('recognition_criteria').selectAll().execute();

    const evaluations = criteria.map((c) => {
      if (c.criteria_key === 'min_tenure_years') {
        const required = parseFloat(c.criteria_value);
        return {
          recognitionCode: c.recognition_code,
          criteriaKey: c.criteria_key,
          required: c.criteria_value,
          actual: tenureYears === null ? null : String(tenureYears),
          eligible: tenureYears === null ? null : tenureYears >= required,
        };
      }
      // Unknown criteria key: report as un-evaluable rather than guessing.
      // New criteria types (e.g. portfolio thresholds) need explicit
      // evaluator support added here -- deliberately loud, not silent.
      return {
        recognitionCode: c.recognition_code,
        criteriaKey: c.criteria_key,
        required: c.criteria_value,
        actual: null,
        eligible: null,
      };
    });

    return { membershipId, tenureYears, evaluations };
  }
}
