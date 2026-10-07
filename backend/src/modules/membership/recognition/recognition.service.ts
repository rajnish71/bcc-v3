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
import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';
import { CommunicationService } from '../../shared/communication/communication.service';
import { logMembershipAudit } from '../shared/membership-audit.util';
import {
  assertLegacySeniorPathwayContained,
  isSeniorStatusCode,
  seniorContainmentError,
} from './senior-containment';

type RecognitionCode =
  | 'SENIOR_MEMBER'
  | 'HONORARY_SENIOR_MEMBER'
  | 'HONORARY_MEMBER'
  | 'HONORARY_MENTOR'
  | 'HONORARY_GRANDMASTER';

const HONORARY_CODES: ReadonlyArray<RecognitionCode> = [
  'HONORARY_MEMBER',
  'HONORARY_MENTOR',
  'HONORARY_GRANDMASTER',
];

@Injectable()
export class RecognitionService {
  constructor(private readonly communicationService: CommunicationService) {}

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
    // WP0 containment: no new Senior through the legacy recognition model.
    if (isSeniorStatusCode(recognitionCode)) throw seniorContainmentError();
    this.assertTrackMatchesCode(recognitionCode, track);
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

    // Honorary recognitions dispatch RECOGNITION_AWARDED notification.
    // Existing RECOGNITION_AWARDED type (seed_0005) covers all honorary codes.
    if (HONORARY_CODES.includes(recognitionCode)) {
      const mem = await db
        .selectFrom('memberships')
        .select('user_id')
        .where('id', '=', membershipId)
        .executeTakeFirst();
      if (mem?.user_id) {
        const user = await db
          .selectFrom('users')
          .select('full_name')
          .where('id', '=', mem.user_id)
          .executeTakeFirst();
        await this.communicationService.dispatch('RECOGNITION_AWARDED', mem.user_id, {
          full_name: user?.full_name ?? '',
          recognition_class: recognitionCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          portal_link: `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`,
        });
      }
    }
  }

  // ---- Atomic grant with MEM-006 supersession --------------------------
  //
  // MEM-006 Recognition Precedence Rule: Governance Recognition supersedes
  // Automatic Recognition, which becomes Historical. Everything (the old
  // row's flip to HISTORICAL, the new ACTIVE row, and both audit rows) runs
  // against the caller's trx, so a failure anywhere leaves the member with
  // exactly the recognition they had before.
  //
  // Supersession is deliberately narrow: only an ACTIVE *AUTO* row is
  // superseded, and only by a governance (HONORARY_*) code. Any other
  // conflict (e.g. replacing one MANUAL recognition with another) stays a
  // ConflictException -- that is an explicit revoke decision, not something
  // this method may make silently.
  //
  // Idempotent: re-granting the code the member already holds returns
  // 'NOOP' and writes nothing.
  async grantInTransaction(
    trx: Kysely<DB>,
    params: {
      membershipId: number;
      recognitionCode: RecognitionCode;
      track: 'AUTO' | 'MANUAL';
      reason: string;
      actorUserId: number;
      startDate?: string;
    },
  ): Promise<{ outcome: 'GRANTED' | 'SUPERSEDED' | 'NOOP'; userId: number | null }> {
    const { membershipId, recognitionCode, track, reason, actorUserId } = params;
    // WP0 containment: no new Senior through the legacy recognition model.
    if (isSeniorStatusCode(recognitionCode)) throw seniorContainmentError();
    this.assertTrackMatchesCode(recognitionCode, track);

    const membership = await trx
      .selectFrom('memberships')
      .select(['id', 'user_id', 'lifecycle_state'])
      .where('id', '=', membershipId)
      .forUpdate()
      .executeTakeFirst();
    if (!membership) throw new NotFoundException('Membership record not found.');
    if (membership.lifecycle_state !== 'ACTIVE') {
      throw new ConflictException(
        `Recognitions can only be assigned to ACTIVE memberships (current state: ${membership.lifecycle_state}).`,
      );
    }
    const userId = membership.user_id !== null ? Number(membership.user_id) : null;

    const active = await trx
      .selectFrom('member_recognitions')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();

    const today = new Date().toISOString().slice(0, 10);
    let outcome: 'GRANTED' | 'SUPERSEDED' = 'GRANTED';

    if (active) {
      // WP0 containment: an existing Senior row is never superseded (flipped
      // to HISTORICAL) by a governance grant (MEM-006 v1.1 precedence scope).
      if (isSeniorStatusCode(active.recognition_code)) throw seniorContainmentError();
      if (active.recognition_code === recognitionCode) return { outcome: 'NOOP', userId };
      const supersedable = active.track === 'AUTO' && HONORARY_CODES.includes(recognitionCode);
      if (!supersedable) {
        throw new ConflictException(
          `Membership ${membershipId} already holds active ${active.recognition_code} (${active.track}); only an AUTO recognition can be superseded, and only by a governance recognition. Revoke explicitly first.`,
        );
      }
      await trx
        .updateTable('member_recognitions')
        .set({ status: 'HISTORICAL', end_date: today })
        .where('id', '=', active.id)
        .execute();
      await logMembershipAudit(
        {
          membershipId,
          eventType: 'RECOGNITION_SUPERSEDED',
          actorType: 'ADMIN',
          actorUserId,
          oldValue: { recognitionCode: active.recognition_code, track: active.track },
          newValue: { recognitionCode, track },
          notes: reason,
        },
        trx,
      );
      outcome = 'SUPERSEDED';
    }

    await trx
      .insertInto('member_recognitions')
      .values({
        membership_id: membershipId,
        recognition_code: recognitionCode,
        track,
        status: 'ACTIVE',
        reason,
        assigned_by_user_id: actorUserId,
        start_date: params.startDate ?? today,
      })
      .execute();
    await logMembershipAudit(
      {
        membershipId,
        eventType: 'RECOGNITION_ASSIGNED',
        actorType: 'ADMIN',
        actorUserId,
        newValue: { recognitionCode, track },
        notes: reason,
      },
      trx,
    );

    return { outcome, userId };
  }

  // Sent only AFTER the transaction commits, so a rolled-back batch never
  // emails anyone. HONORARY_* -> RECOGNITION_AWARDED; SENIOR_MEMBER ->
  // SENIOR_STATUS_ACHIEVED (same variable sets the existing paths use).
  async notifyGrant(userId: number, recognitionCode: RecognitionCode): Promise<void> {
    const user = await db.selectFrom('users').select('full_name').where('id', '=', userId).executeTakeFirst();
    const portalLink = `${process.env.FRONTEND_BASE_URL ?? 'https://bcc.bhopal.info'}/hub/`;
    if (HONORARY_CODES.includes(recognitionCode)) {
      await this.communicationService.dispatch('RECOGNITION_AWARDED', userId, {
        full_name: user?.full_name ?? '',
        recognition_class: recognitionCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        portal_link: portalLink,
      });
    } else if (recognitionCode === 'SENIOR_MEMBER') {
      // WP0 containment: no Senior achievement notice from the legacy path.
      assertLegacySeniorPathwayContained();
      await this.communicationService.dispatch('SENIOR_STATUS_ACHIEVED', userId, {
        full_name: user?.full_name ?? '',
        portal_link: portalLink,
      });
    }
  }

  // Governance classes are MANUAL by definition (MEM-006 governance track).
  // SENIOR_MEMBER may be AUTO (system qualification) or MANUAL (recorded
  // owner exception); HONORARY_SENIOR_MEMBER is management-awarded per
  // MEM-008, so it is MANUAL only.
  private assertTrackMatchesCode(code: RecognitionCode, track: 'AUTO' | 'MANUAL'): void {
    const manualOnly = HONORARY_CODES.includes(code) || code === 'HONORARY_SENIOR_MEMBER';
    if (manualOnly && track !== 'MANUAL') {
      throw new ConflictException(`${code} is a governance recognition and must use the MANUAL track.`);
    }
  }

  async revoke(membershipId: number, reason: string, actorUserId: number): Promise<void> {
    const active = await db
      .selectFrom('member_recognitions')
      .selectAll()
      .where('membership_id', '=', membershipId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirst();
    if (!active) throw new NotFoundException('No active recognition on this membership.');
    // WP0 containment: Senior is not revoked through the legacy recognition model.
    if (isSeniorStatusCode(active.recognition_code)) throw seniorContainmentError();

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
    // WP0 containment: obsolete configurable Senior criteria are frozen as-is.
    if (isSeniorStatusCode(recognitionCode)) throw seniorContainmentError();
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
    // WP0 containment: the legacy AUTO evaluator (365.25-day join_year tenure,
    // configurable criteria) is non-conforming and is disabled.
    assertLegacySeniorPathwayContained();
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
