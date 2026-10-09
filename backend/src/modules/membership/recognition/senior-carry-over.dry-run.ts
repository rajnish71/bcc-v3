// backend/src/modules/membership/recognition/senior-carry-over.dry-run.ts
//
// WP6-A -- READ-ONLY DRY RUN for the future WP6-B carry-over of the eight
// frozen legacy MANUAL Senior records into Senior Status Overlays
// (TENURE-ARCH-001 v1.1 §14.1).
//
// This module only SELECTs. It writes nothing, repairs nothing and creates
// no overlay, transition, audit row or recognition. It validates that the
// production state is exactly the expected pre-carry-over state, previews
// what WP6-B would do, and reports PASS / FAIL.
//
// The carry-over is a STATUS MIGRATION of existing governance records. It
// consults no tenure: no WP1 result, no WP4 ledger row, no eligibility.
//
// Expected mapping (verified against the schema and production, 2026-10-09):
//   legacy recognition id -> membership -> OWNING user. The 0120 insert
//   trigger requires the overlay's user to be the owner of the legacy row's
//   membership, so the user is derived from the membership, not assumed.

import { createHash } from 'crypto';
import type { Kysely } from 'kysely';
import { db, type DB } from '../../../database/db';

// Same literal as TENURE_AUDIT_EVENTS.SENIOR_CARRIED_OVER (WP2 vocabulary).
// A test pins the two together; the vocabulary module itself is deliberately
// not imported here (it is import-restricted to the ledger writers).
export const CARRIED_OVER_AUDIT_EVENT = 'SENIOR_CARRIED_OVER';

export interface ExpectedCarryOver {
  recognitionId: number;
  membershipId: number;
  userId: number;
}

export const EXPECTED_CARRY_OVER: ReadonlyArray<ExpectedCarryOver> = Object.freeze([
  { recognitionId: 8, membershipId: 12, userId: 17 },
  { recognitionId: 9, membershipId: 13, userId: 18 },
  { recognitionId: 10, membershipId: 14, userId: 19 },
  { recognitionId: 11, membershipId: 17, userId: 22 },
  { recognitionId: 12, membershipId: 23, userId: 28 },
  { recognitionId: 13, membershipId: 77, userId: 69 },
  { recognitionId: 14, membershipId: 80, userId: 70 },
  { recognitionId: 15, membershipId: 81, userId: 74 },
]);

export const EXPECTED_LEGACY_STATE = Object.freeze({
  recognitionCode: 'SENIOR_MEMBER',
  track: 'MANUAL',
  status: 'ACTIVE',
  assignedByUserId: 1,
  startDate: '2026-09-29',
});

// Proposed actor attribution. NOT decided: Human Authority chooses before WP6-B.
export const PROPOSED_ACTOR = Object.freeze({ actorType: 'ADMIN' as const, actorUserId: 1, decision: 'PENDING_HUMAN_AUTHORITY' });

// ── Facts (what the database currently holds) ─────────────────────────────

export interface CarryOverFacts {
  recognitions: Array<{
    id: number; membershipId: number; code: string; track: string; status: string;
    assignedByUserId: number | null; startDate: string | null; endDate: string | null;
  }>; // rows whose id is in the expected set
  seniorRecognitionIds: number[]; // ALL SENIOR_MEMBER rows (any status)
  memberships: Array<{ id: number; userId: number | null; ownerType: string; parentMembershipId: number | null; lifecycleState: string }>;
  userMemberships: Array<{ id: number; userId: number; ownerType: string; parentMembershipId: number | null; lifecycleState: string }>;
  existingUserIds: number[];
  overlays: Array<{
    id: number; userId: number; status: string; provenance: string; legacyRecognitionId: number | null;
    achievedDate: string | null; historicalAchievementDate: string | null; eligibilityDate: string | null;
    qualificationSnapshot: string | null; sourceEvaluationRef: string | null; legacyRecordingDate: string | null;
  }>; // ALL overlays
  transitions: Array<{ id: number; overlayId: number; fromStatus: string | null; toStatus: string; transitionType: string }>; // ALL
  carryOverAudit: Array<{ id: number; membershipId: number | null }>; // ALL SENIOR_CARRIED_OVER events
}

// ── Result ────────────────────────────────────────────────────────────────

export type RowState = 'NOT_CARRIED_OVER' | 'CARRIED_OVER' | 'PARTIAL' | 'CONFLICT';
export type OverallState = 'NOT_CARRIED_OVER' | 'FULLY_CARRIED_OVER' | 'PARTIALLY_CARRIED_OVER' | 'INCONSISTENT';

export interface CarryOverRowReport {
  legacyRecognitionId: number;
  userId: number;
  membershipId: number;
  rowState: RowState;
  pass: boolean;
  blockers: string[];
  intendedOverlay: string;
  intendedTransition: string;
  intendedAudit: string;
}

export interface CarryOverDryRun {
  verdict: 'PASS' | 'FAIL';
  readiness: 'READY_FOR_WP6_B' | 'NOT_READY';
  state: OverallState;
  writesPerformed: 0;
  rows: CarryOverRowReport[];
  globalBlockers: string[];
  actor: { actorType: 'ADMIN'; actorUserId: number; decision: string };
  reportHash: string;
}

const NONE = 'NONE (blocked: no write is planned for this row)';

function intendedFor(e: ExpectedCarryOver): Pick<CarryOverRowReport, 'intendedOverlay' | 'intendedTransition' | 'intendedAudit'> {
  return {
    intendedOverlay:
      `INSERT senior_status_overlays {user_id:${e.userId}, status:ACTIVE, provenance:MANUAL, legacy_recognition_id:${e.recognitionId}, ` +
      `legacy_recording_date:${EXPECTED_LEGACY_STATE.startDate}, achieved_date:NULL, historical_achievement_date:NULL, eligibility_date:NULL, ` +
      `qualification_snapshot:NULL, source_evaluation_ref:NULL}`,
    intendedTransition:
      `INSERT senior_status_transitions {overlay:<new>, from_status:NULL, to_status:ACTIVE, transition_type:CARRIED_OVER, ` +
      `actor:${PROPOSED_ACTOR.actorType}/${PROPOSED_ACTOR.actorUserId} (${PROPOSED_ACTOR.decision}), occurred_at:GENERATED_AT_EXECUTION}`,
    intendedAudit:
      `INSERT membership_audit_log {event_type:${CARRIED_OVER_AUDIT_EVENT}, membership_id:${e.membershipId}, subject user:${e.userId}, ` +
      `actor:${PROPOSED_ACTOR.actorType}/${PROPOSED_ACTOR.actorUserId}} (written before the transition)`,
  };
}

// ── Pure evaluation ───────────────────────────────────────────────────────

export function evaluateCarryOver(facts: CarryOverFacts): CarryOverDryRun {
  const expectedIds = new Set(EXPECTED_CARRY_OVER.map((e) => e.recognitionId));
  const expectedUsers = new Set(EXPECTED_CARRY_OVER.map((e) => e.userId));
  const globalBlockers: string[] = [];

  // Exactly the eight expected Senior rows, and no others of any status.
  for (const id of [...facts.seniorRecognitionIds].sort((a, b) => a - b)) {
    if (!expectedIds.has(id)) globalBlockers.push(`UNEXPECTED_SENIOR_RECOGNITION_ROW id=${id}`);
  }
  if (new Set(EXPECTED_CARRY_OVER.map((e) => e.userId)).size !== EXPECTED_CARRY_OVER.length) globalBlockers.push('EXPECTATION_DUPLICATE_USER');
  if (!facts.existingUserIds.includes(PROPOSED_ACTOR.actorUserId)) globalBlockers.push(`ACTOR_USER_MISSING id=${PROPOSED_ACTOR.actorUserId}`);

  // Anything already present for users/rows outside the expected eight.
  for (const o of facts.overlays) {
    if (!expectedUsers.has(o.userId)) globalBlockers.push(`UNEXPECTED_OVERLAY id=${o.id} user=${o.userId}`);
    else if (o.legacyRecognitionId != null && !expectedIds.has(o.legacyRecognitionId)) globalBlockers.push(`OVERLAY_REFERENCES_UNEXPECTED_LEGACY_ROW id=${o.id}`);
  }
  const overlayIds = new Set(facts.overlays.map((o) => o.id));
  for (const t of facts.transitions) {
    if (!overlayIds.has(t.overlayId)) globalBlockers.push(`ORPHAN_TRANSITION id=${t.id}`);
  }
  const expectedMemberships = new Set(EXPECTED_CARRY_OVER.map((e) => e.membershipId));
  for (const a of facts.carryOverAudit) {
    if (a.membershipId == null || !expectedMemberships.has(a.membershipId)) globalBlockers.push(`UNEXPECTED_${CARRIED_OVER_AUDIT_EVENT}_AUDIT id=${a.id}`);
  }
  const legacyRefs = facts.overlays.map((o) => o.legacyRecognitionId).filter((x): x is number => x != null);
  if (new Set(legacyRefs).size !== legacyRefs.length) globalBlockers.push('DUPLICATE_LEGACY_RECOGNITION_REFERENCE');
  const overlayUsers = facts.overlays.map((o) => o.userId);
  if (new Set(overlayUsers).size !== overlayUsers.length) globalBlockers.push('DUPLICATE_OVERLAY_FOR_USER');

  const rows: CarryOverRowReport[] = EXPECTED_CARRY_OVER.map((e) => {
    const blockers: string[] = [];
    const legacy = facts.recognitions.find((r) => r.id === e.recognitionId);
    if (!legacy) blockers.push('LEGACY_ROW_MISSING');
    else {
      if (legacy.code !== EXPECTED_LEGACY_STATE.recognitionCode) blockers.push(`LEGACY_WRONG_CODE (${legacy.code})`);
      if (legacy.track !== EXPECTED_LEGACY_STATE.track) blockers.push(`LEGACY_WRONG_ASSIGNMENT_MODE (${legacy.track})`);
      if (legacy.status !== EXPECTED_LEGACY_STATE.status) blockers.push(`LEGACY_WRONG_STATUS (${legacy.status})`);
      if (legacy.endDate != null) blockers.push(`LEGACY_END_DATE_SET (${legacy.endDate})`);
      if (legacy.assignedByUserId !== EXPECTED_LEGACY_STATE.assignedByUserId) blockers.push(`LEGACY_WRONG_ASSIGNER (${legacy.assignedByUserId})`);
      if (legacy.startDate !== EXPECTED_LEGACY_STATE.startDate) blockers.push(`LEGACY_WRONG_START_DATE (${legacy.startDate})`);
      if (legacy.membershipId !== e.membershipId) blockers.push(`WRONG_MEMBERSHIP_MAPPING (legacy row is on membership ${legacy.membershipId}, expected ${e.membershipId})`);
    }

    const membership = facts.memberships.find((m) => m.id === e.membershipId);
    if (!membership) blockers.push('MEMBERSHIP_MISSING');
    else {
      if (membership.userId !== e.userId) blockers.push(`WRONG_USER_MAPPING (membership owner ${membership.userId}, expected ${e.userId})`);
      if (membership.ownerType !== 'INDIVIDUAL' || membership.parentMembershipId !== null) blockers.push('MEMBERSHIP_NOT_OWN_INDIVIDUAL');
      if (membership.lifecycleState !== 'ACTIVE') blockers.push(`MEMBERSHIP_NOT_ACTIVE (${membership.lifecycleState})`);
    }
    if (!facts.existingUserIds.includes(e.userId)) blockers.push('USER_MISSING');
    const activeIndividuals = facts.userMemberships.filter((m) => m.userId === e.userId && m.ownerType === 'INDIVIDUAL' && m.parentMembershipId === null && m.lifecycleState === 'ACTIVE');
    if (activeIndividuals.length !== 1 || activeIndividuals[0].id !== e.membershipId) {
      blockers.push(`USER_ACTIVE_INDIVIDUAL_MEMBERSHIP_MISMATCH (found ${activeIndividuals.map((m) => m.id).join(',') || 'none'}, expected ${e.membershipId})`);
    }

    // Applied-state detection. Never repaired.
    const ownOverlays = facts.overlays.filter((o) => o.userId === e.userId || o.legacyRecognitionId === e.recognitionId);
    const ownTransitions = facts.transitions.filter((t) => ownOverlays.some((o) => o.id === t.overlayId));
    const ownAudit = facts.carryOverAudit.filter((a) => a.membershipId === e.membershipId);
    let rowState: RowState;
    if (ownOverlays.length === 0 && ownTransitions.length === 0 && ownAudit.length === 0) {
      rowState = 'NOT_CARRIED_OVER';
    } else if (ownOverlays.length > 1) {
      rowState = 'CONFLICT';
      blockers.push(`CONFLICTING_OVERLAYS (${ownOverlays.map((o) => o.id).join(',')})`);
    } else if (ownOverlays.length === 1) {
      const o = ownOverlays[0];
      const matches =
        o.userId === e.userId && o.legacyRecognitionId === e.recognitionId && o.provenance === 'MANUAL' && o.status === 'ACTIVE' &&
        o.achievedDate == null && o.historicalAchievementDate == null && o.eligibilityDate == null && o.qualificationSnapshot == null &&
        o.sourceEvaluationRef == null && o.legacyRecordingDate === EXPECTED_LEGACY_STATE.startDate;
      const carried = ownTransitions.length === 1 && ownTransitions[0].transitionType === 'CARRIED_OVER' && ownTransitions[0].fromStatus === null && ownTransitions[0].toStatus === 'ACTIVE';
      if (!matches) {
        rowState = 'CONFLICT';
        blockers.push(`CONFLICTING_OVERLAY (id=${o.id}, user=${o.userId}, legacy=${o.legacyRecognitionId}, status=${o.status}, provenance=${o.provenance})`);
      } else if (carried && ownAudit.length >= 1) {
        rowState = 'CARRIED_OVER';
        blockers.push('ALREADY_CARRIED_OVER (nothing to do)');
      } else {
        rowState = 'PARTIAL';
        blockers.push('PARTIALLY_APPLIED (overlay present without exactly one CARRIED_OVER transition and an audit row); not repaired');
      }
    } else {
      rowState = 'PARTIAL';
      blockers.push('PARTIALLY_APPLIED (transition/audit present without an overlay); not repaired');
    }

    const pass = rowState === 'NOT_CARRIED_OVER' && blockers.length === 0;
    return {
      legacyRecognitionId: e.recognitionId,
      userId: e.userId,
      membershipId: e.membershipId,
      rowState,
      pass,
      blockers,
      ...(pass ? intendedFor(e) : { intendedOverlay: NONE, intendedTransition: NONE, intendedAudit: NONE }),
    };
  });

  const states = new Set(rows.map((r) => r.rowState));
  let state: OverallState;
  if (states.size === 1 && states.has('NOT_CARRIED_OVER')) state = 'NOT_CARRIED_OVER';
  else if (states.size === 1 && states.has('CARRIED_OVER')) state = 'FULLY_CARRIED_OVER';
  else if (states.has('CONFLICT')) state = 'INCONSISTENT';
  else state = 'PARTIALLY_CARRIED_OVER';

  const ok = rows.every((r) => r.pass) && globalBlockers.length === 0 && state === 'NOT_CARRIED_OVER';
  const body = { state, rows, globalBlockers, actor: { ...PROPOSED_ACTOR } };
  return {
    verdict: ok ? 'PASS' : 'FAIL',
    readiness: ok ? 'READY_FOR_WP6_B' : 'NOT_READY',
    state,
    writesPerformed: 0,
    rows,
    globalBlockers,
    actor: { ...PROPOSED_ACTOR },
    reportHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  };
}

// ── Read-only loader ──────────────────────────────────────────────────────

const ymd = (d: unknown): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function loadCarryOverFacts(executor: Kysely<DB> = db): Promise<CarryOverFacts> {
  const ids = EXPECTED_CARRY_OVER.map((e) => e.recognitionId);
  const membershipIds = EXPECTED_CARRY_OVER.map((e) => e.membershipId);
  const userIds = EXPECTED_CARRY_OVER.map((e) => e.userId);

  const recognitions = await executor.selectFrom('member_recognitions').selectAll().where('id', 'in', ids).orderBy('id').execute();
  const seniorRows = await executor.selectFrom('member_recognitions').select(['id']).where('recognition_code', '=', 'SENIOR_MEMBER').orderBy('id').execute();
  const memberships = await executor
    .selectFrom('memberships')
    .select(['id', 'user_id', 'owner_type', 'parent_membership_id', 'lifecycle_state'])
    .where('id', 'in', membershipIds)
    .orderBy('id')
    .execute();
  const userMemberships = await executor
    .selectFrom('memberships')
    .select(['id', 'user_id', 'owner_type', 'parent_membership_id', 'lifecycle_state'])
    .where('user_id', 'in', userIds)
    .orderBy('id')
    .execute();
  const users = await executor.selectFrom('users').select(['id']).where('id', 'in', [...userIds, PROPOSED_ACTOR.actorUserId]).execute();
  const overlays = await executor.selectFrom('senior_status_overlays').selectAll().orderBy('id').execute();
  const transitions = await executor.selectFrom('senior_status_transitions').selectAll().orderBy('id').execute();
  const audit = await executor
    .selectFrom('membership_audit_log')
    .select(['id', 'membership_id'])
    .where('event_type', '=', CARRIED_OVER_AUDIT_EVENT)
    .orderBy('id')
    .execute();

  return {
    recognitions: recognitions.map((r) => ({
      id: Number(r.id), membershipId: Number(r.membership_id), code: r.recognition_code, track: r.track, status: r.status,
      assignedByUserId: r.assigned_by_user_id == null ? null : Number(r.assigned_by_user_id), startDate: ymd(r.start_date), endDate: ymd(r.end_date),
    })),
    seniorRecognitionIds: seniorRows.map((r) => Number(r.id)),
    memberships: memberships.map((m) => ({
      id: Number(m.id), userId: m.user_id == null ? null : Number(m.user_id), ownerType: m.owner_type,
      parentMembershipId: m.parent_membership_id == null ? null : Number(m.parent_membership_id), lifecycleState: m.lifecycle_state,
    })),
    userMemberships: userMemberships
      .filter((m) => m.user_id != null)
      .map((m) => ({
        id: Number(m.id), userId: Number(m.user_id), ownerType: m.owner_type,
        parentMembershipId: m.parent_membership_id == null ? null : Number(m.parent_membership_id), lifecycleState: m.lifecycle_state,
      })),
    existingUserIds: users.map((u) => Number(u.id)),
    overlays: overlays.map((o) => ({
      id: Number(o.id), userId: Number(o.user_id), status: o.status, provenance: o.provenance,
      legacyRecognitionId: o.legacy_recognition_id == null ? null : Number(o.legacy_recognition_id),
      achievedDate: ymd(o.achieved_date), historicalAchievementDate: ymd(o.historical_achievement_date), eligibilityDate: ymd(o.eligibility_date),
      qualificationSnapshot: o.qualification_snapshot, sourceEvaluationRef: o.source_evaluation_ref, legacyRecordingDate: ymd(o.legacy_recording_date),
    })),
    transitions: transitions.map((t) => ({
      id: Number(t.id), overlayId: Number(t.overlay_id), fromStatus: t.from_status, toStatus: t.to_status, transitionType: t.transition_type,
    })),
    carryOverAudit: audit.map((a) => ({ id: Number(a.id), membershipId: a.membership_id == null ? null : Number(a.membership_id) })),
  };
}

// Invocation: planSeniorCarryOver() (read-only). CLI: src/scripts/senior-carry-over-dry-run.ts
export async function planSeniorCarryOver(executor: Kysely<DB> = db): Promise<CarryOverDryRun> {
  return evaluateCarryOver(await loadCarryOverFacts(executor));
}

// Deterministic, human-readable report (no timestamps, stable ordering).
export function formatCarryOverDryRun(r: CarryOverDryRun): string {
  const lines: string[] = [];
  lines.push('WP6-B CARRY-OVER DRY RUN (READ-ONLY -- NO WRITES PERFORMED)');
  lines.push(`verdict: ${r.verdict}   readiness: ${r.readiness}   state: ${r.state}   writes: ${r.writesPerformed}`);
  lines.push(`proposed actor: ${r.actor.actorType}/${r.actor.actorUserId} (${r.actor.decision})`);
  lines.push('');
  for (const row of r.rows) {
    lines.push(`legacy recognition ${row.legacyRecognitionId} -> user ${row.userId} -> membership ${row.membershipId}   [${row.rowState}] ${row.pass ? 'OK' : 'BLOCKED'}`);
    lines.push(`  overlay:    ${row.intendedOverlay}`);
    lines.push(`  transition: ${row.intendedTransition}`);
    lines.push(`  audit:      ${row.intendedAudit}`);
    for (const b of row.blockers) lines.push(`  ! ${b}`);
  }
  if (r.globalBlockers.length) {
    lines.push('');
    for (const b of r.globalBlockers) lines.push(`! ${b}`);
  }
  lines.push('');
  lines.push(`report hash: ${r.reportHash}`);
  lines.push(`FINAL: ${r.readiness}`);
  return lines.join('\n');
}
