// WP6-A -- READ-ONLY dry run for the future WP6-B carry-over.
// Zero writes in every case; PASS only for the exact expected eight-row state.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { TENURE_AUDIT_EVENTS } from '../tenure-ledger/tenure-ledger.vocabulary';
import {
  CARRIED_OVER_AUDIT_EVENT,
  EXPECTED_CARRY_OVER,
  EXPECTED_LEGACY_STATE,
  evaluateCarryOver,
  formatCarryOverDryRun,
  planSeniorCarryOver,
  type CarryOverFacts,
} from './senior-carry-over.dry-run';

const fake = db as unknown as FakeDb;

// Exactly the production pre-carry-over state.
function validFacts(): CarryOverFacts {
  return {
    recognitions: EXPECTED_CARRY_OVER.map((e) => ({
      id: e.recognitionId, membershipId: e.membershipId, code: 'SENIOR_MEMBER', track: 'MANUAL', status: 'ACTIVE',
      assignedByUserId: 1, startDate: '2026-09-29', endDate: null,
    })),
    seniorRecognitionIds: EXPECTED_CARRY_OVER.map((e) => e.recognitionId),
    memberships: EXPECTED_CARRY_OVER.map((e) => ({ id: e.membershipId, userId: e.userId, ownerType: 'INDIVIDUAL', parentMembershipId: null, lifecycleState: 'ACTIVE' })),
    userMemberships: EXPECTED_CARRY_OVER.map((e) => ({ id: e.membershipId, userId: e.userId, ownerType: 'INDIVIDUAL', parentMembershipId: null, lifecycleState: 'ACTIVE' })),
    existingUserIds: [1, ...EXPECTED_CARRY_OVER.map((e) => e.userId)],
    overlays: [],
    transitions: [],
    carryOverAudit: [],
  };
}

const withRec = (id: number, patch: Partial<CarryOverFacts['recognitions'][number]>) => {
  const f = validFacts();
  f.recognitions = f.recognitions.map((r) => (r.id === id ? { ...r, ...patch } : r));
  return f;
};
const blockersOf = (r: ReturnType<typeof evaluateCarryOver>) => [...r.rows.flatMap((x) => x.blockers), ...r.globalBlockers].join(' | ');

const overlayFor = (e: (typeof EXPECTED_CARRY_OVER)[number], id: number, over: Record<string, any> = {}) => ({
  id, userId: e.userId, status: 'ACTIVE', provenance: 'MANUAL', legacyRecognitionId: e.recognitionId, achievedDate: null,
  historicalAchievementDate: null, eligibilityDate: null, qualificationSnapshot: null, sourceEvaluationRef: null, legacyRecordingDate: '2026-09-29', ...over,
});

describe('expectations are the real schema mapping', () => {
  it('eight distinct rows; user is the owner of the legacy row\'s membership', () => {
    expect(EXPECTED_CARRY_OVER).toHaveLength(8);
    expect(EXPECTED_CARRY_OVER.map((e) => e.recognitionId)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(EXPECTED_CARRY_OVER.map((e) => e.membershipId)).toEqual([12, 13, 14, 17, 23, 77, 80, 81]);
    expect(EXPECTED_CARRY_OVER.map((e) => e.userId)).toEqual([17, 18, 19, 22, 28, 69, 70, 74]);
    expect(new Set(EXPECTED_CARRY_OVER.map((e) => e.userId)).size).toBe(8);
    expect(EXPECTED_LEGACY_STATE).toMatchObject({ recognitionCode: 'SENIOR_MEMBER', track: 'MANUAL', status: 'ACTIVE', assignedByUserId: 1, startDate: '2026-09-29' });
  });

  it('uses the already-approved SENIOR_CARRIED_OVER audit vocabulary (no new category)', () => {
    expect(CARRIED_OVER_AUDIT_EVENT).toBe(TENURE_AUDIT_EVENTS.SENIOR_CARRIED_OVER);
  });
});

describe('valid exact eight-row state', () => {
  const r = evaluateCarryOver(validFacts());

  it('PASS / READY_FOR_WP6_B with zero writes', () => {
    expect(r.verdict).toBe('PASS');
    expect(r.readiness).toBe('READY_FOR_WP6_B');
    expect(r.state).toBe('NOT_CARRIED_OVER');
    expect(r.writesPerformed).toBe(0);
    expect(r.globalBlockers).toEqual([]);
    expect(r.rows).toHaveLength(8);
    expect(r.rows.every((x) => x.pass && x.rowState === 'NOT_CARRIED_OVER' && x.blockers.length === 0)).toBe(true);
  });

  it('previews the exact intended overlay / transition / audit per row (preview only)', () => {
    const row = r.rows[0];
    expect(row.intendedOverlay).toContain('user_id:17');
    expect(row.intendedOverlay).toContain('status:ACTIVE');
    expect(row.intendedOverlay).toContain('provenance:MANUAL');
    expect(row.intendedOverlay).toContain('legacy_recognition_id:8');
    expect(row.intendedOverlay).toContain('legacy_recording_date:2026-09-29');
    for (const f of ['achieved_date:NULL', 'historical_achievement_date:NULL', 'eligibility_date:NULL', 'qualification_snapshot:NULL', 'source_evaluation_ref:NULL']) expect(row.intendedOverlay).toContain(f);
    expect(row.intendedTransition).toContain('from_status:NULL');
    expect(row.intendedTransition).toContain('to_status:ACTIVE');
    expect(row.intendedTransition).toContain('transition_type:CARRIED_OVER');
    expect(row.intendedTransition).toContain('GENERATED_AT_EXECUTION');
    expect(row.intendedAudit).toContain('SENIOR_CARRIED_OVER');
    expect(r.actor.decision).toBe('PENDING_HUMAN_AUTHORITY');
  });

  it('is deterministic (same facts -> identical result, hash and text)', () => {
    const again = evaluateCarryOver(validFacts());
    expect(again).toEqual(r);
    expect(again.reportHash).toBe(r.reportHash);
    expect(formatCarryOverDryRun(again)).toBe(formatCarryOverDryRun(r));
    expect(formatCarryOverDryRun(r)).toContain('FINAL: READY_FOR_WP6_B');
  });
});

describe('failures are FAIL, name the blocker and plan nothing', () => {
  const expectFail = (facts: CarryOverFacts, needle: string) => {
    const r = evaluateCarryOver(facts);
    expect(r.verdict).toBe('FAIL');
    expect(r.readiness).toBe('NOT_READY');
    expect(r.writesPerformed).toBe(0);
    expect(blockersOf(r)).toContain(needle);
    expect(formatCarryOverDryRun(r)).toContain('FINAL: NOT_READY');
    return r;
  };

  it('missing legacy row', () => {
    const f = validFacts();
    f.recognitions = f.recognitions.filter((x) => x.id !== 10);
    f.seniorRecognitionIds = f.seniorRecognitionIds.filter((x) => x !== 10);
    const r = expectFail(f, 'LEGACY_ROW_MISSING');
    expect(r.rows.find((x) => x.legacyRecognitionId === 10)!.intendedOverlay).toMatch(/^NONE/);
  });

  it('wrong recognition code', () => { expectFail(withRec(9, { code: 'HONORARY_MEMBER' }), 'LEGACY_WRONG_CODE'); });
  it('wrong assignment mode', () => { expectFail(withRec(9, { track: 'AUTO' }), 'LEGACY_WRONG_ASSIGNMENT_MODE'); });
  it('wrong status', () => { expectFail(withRec(9, { status: 'HISTORICAL' }), 'LEGACY_WRONG_STATUS'); });
  it('wrong assigner', () => { expectFail(withRec(9, { assignedByUserId: 2 }), 'LEGACY_WRONG_ASSIGNER'); });
  it('wrong start date', () => { expectFail(withRec(9, { startDate: '2026-09-30' }), 'LEGACY_WRONG_START_DATE'); });
  it('end date set', () => { expectFail(withRec(9, { endDate: '2026-10-01' }), 'LEGACY_END_DATE_SET'); });

  it('wrong user mapping (membership owned by someone else)', () => {
    const f = validFacts();
    f.memberships = f.memberships.map((m) => (m.id === 12 ? { ...m, userId: 1 } : m));
    expectFail(f, 'WRONG_USER_MAPPING');
  });

  it('wrong membership mapping (legacy row on a different membership)', () => { expectFail(withRec(8, { membershipId: 13 }), 'WRONG_MEMBERSHIP_MAPPING'); });

  it('user lacks the expected single ACTIVE individual membership', () => {
    const f = validFacts();
    f.userMemberships.push({ id: 999, userId: 17, ownerType: 'INDIVIDUAL', parentMembershipId: null, lifecycleState: 'ACTIVE' });
    expectFail(f, 'USER_ACTIVE_INDIVIDUAL_MEMBERSHIP_MISMATCH');
    const g = validFacts();
    g.memberships = g.memberships.map((m) => (m.id === 12 ? { ...m, lifecycleState: 'EXPIRED' } : m));
    g.userMemberships = g.userMemberships.map((m) => (m.id === 12 ? { ...m, lifecycleState: 'EXPIRED' } : m));
    expectFail(g, 'MEMBERSHIP_NOT_ACTIVE');
  });

  it('actor / user missing', () => {
    const f = validFacts();
    f.existingUserIds = f.existingUserIds.filter((u) => u !== 1);
    expectFail(f, 'ACTOR_USER_MISSING');
    const g = validFacts();
    g.existingUserIds = g.existingUserIds.filter((u) => u !== 17);
    expectFail(g, 'USER_MISSING');
  });

  it('conflicting overlay for a target user (REMOVED / AUTO / different legacy row)', () => {
    for (const over of [{ status: 'REMOVED' }, { provenance: 'AUTO' }, { legacyRecognitionId: 9 }]) {
      const f = validFacts();
      f.overlays = [overlayFor(EXPECTED_CARRY_OVER[0], 1, over)];
      const r = evaluateCarryOver(f);
      expect(r.verdict).toBe('FAIL');
      expect(r.state).toBe('INCONSISTENT');
    }
  });

  it('unexpected extra target state: extra Senior row, overlay for a non-target user, orphan transition, stray audit', () => {
    const a = validFacts();
    a.seniorRecognitionIds.push(99);
    expectFail(a, 'UNEXPECTED_SENIOR_RECOGNITION_ROW id=99');
    const b = validFacts();
    b.overlays = [{ ...overlayFor(EXPECTED_CARRY_OVER[0], 5), userId: 500, legacyRecognitionId: null }];
    expectFail(b, 'UNEXPECTED_OVERLAY');
    const c = validFacts();
    c.transitions = [{ id: 1, overlayId: 777, fromStatus: null, toStatus: 'ACTIVE', transitionType: 'CARRIED_OVER' }];
    expectFail(c, 'ORPHAN_TRANSITION');
    const d = validFacts();
    d.carryOverAudit = [{ id: 5, membershipId: 424242 }];
    expectFail(d, 'UNEXPECTED_SENIOR_CARRIED_OVER_AUDIT');
  });

  it('duplicate legacy-reference conflict is detected', () => {
    const f = validFacts();
    f.overlays = [overlayFor(EXPECTED_CARRY_OVER[0], 1), overlayFor(EXPECTED_CARRY_OVER[1], 2, { legacyRecognitionId: 8 })];
    expectFail(f, 'DUPLICATE_LEGACY_RECOGNITION_REFERENCE');
  });
});

describe('already / partially applied state is detected and never repaired', () => {
  it('fully carried over -> FAIL with FULLY_CARRIED_OVER ("nothing to do")', () => {
    const f = validFacts();
    f.overlays = EXPECTED_CARRY_OVER.map((e, i) => overlayFor(e, i + 1));
    f.transitions = f.overlays.map((o, i) => ({ id: i + 1, overlayId: o.id, fromStatus: null, toStatus: 'ACTIVE', transitionType: 'CARRIED_OVER' }));
    f.carryOverAudit = EXPECTED_CARRY_OVER.map((e, i) => ({ id: 100 + i, membershipId: e.membershipId }));
    const r = evaluateCarryOver(f);
    expect(r.verdict).toBe('FAIL');
    expect(r.state).toBe('FULLY_CARRIED_OVER');
    expect(r.rows.every((x) => x.rowState === 'CARRIED_OVER')).toBe(true);
    expect(blockersOf(r)).toContain('ALREADY_CARRIED_OVER');
    expect(r.rows.every((x) => x.intendedOverlay.startsWith('NONE'))).toBe(true);
  });

  it('partially carried over (some rows done) -> PARTIALLY_CARRIED_OVER, FAIL', () => {
    const f = validFacts();
    const e = EXPECTED_CARRY_OVER[0];
    f.overlays = [overlayFor(e, 1)];
    f.transitions = [{ id: 1, overlayId: 1, fromStatus: null, toStatus: 'ACTIVE', transitionType: 'CARRIED_OVER' }];
    f.carryOverAudit = [{ id: 100, membershipId: e.membershipId }];
    const r = evaluateCarryOver(f);
    expect(r.verdict).toBe('FAIL');
    expect(r.state).toBe('PARTIALLY_CARRIED_OVER');
  });

  it('overlay without transition/audit -> PARTIAL, FAIL (not repaired)', () => {
    const f = validFacts();
    f.overlays = [overlayFor(EXPECTED_CARRY_OVER[2], 1)];
    const r = evaluateCarryOver(f);
    expect(r.verdict).toBe('FAIL');
    expect(r.rows.find((x) => x.legacyRecognitionId === 10)!.rowState).toBe('PARTIAL');
    expect(blockersOf(r)).toContain('PARTIALLY_APPLIED');
  });

  it('audit row without an overlay -> PARTIAL, FAIL', () => {
    const f = validFacts();
    f.carryOverAudit = [{ id: 100, membershipId: 12 }];
    const r = evaluateCarryOver(f);
    expect(r.verdict).toBe('FAIL');
    expect(r.rows[0].rowState).toBe('PARTIAL');
  });
});

describe('loader: reads only, zero writes', () => {
  const world = () => {
    const f = validFacts();
    const T = (s: string) => new Date(`${s}T00:00:00Z`);
    return {
      member_recognitions: f.recognitions.map((r) => ({ id: r.id, membership_id: r.membershipId, recognition_code: r.code, track: r.track, status: r.status, assigned_by_user_id: r.assignedByUserId, start_date: T(r.startDate!), end_date: null })),
      memberships: f.memberships.map((m) => ({ id: m.id, user_id: m.userId, owner_type: m.ownerType, parent_membership_id: null, lifecycle_state: m.lifecycleState })),
      users: f.existingUserIds.map((id) => ({ id })),
      senior_status_overlays: [] as any[],
      senior_status_transitions: [] as any[],
      membership_audit_log: [] as any[],
    };
  };
  const install = (w: ReturnType<typeof world>) => {
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      const rows = (w as any)[op.table] as any[] | undefined;
      if (!rows) return [];
      return rows.filter((r) =>
        op.wheres.every(([col, cmp, val]) => {
          const v = r[String(col).split('.').pop()!];
          if (cmp === '=') return v === val;
          if (cmp === 'in') return (val as unknown[]).includes(v);
          return true;
        }),
      );
    };
  };
  beforeEach(() => fake.reset());

  it('PASS on the exact state, with no write of any kind', async () => {
    install(world());
    const r = await planSeniorCarryOver();
    expect(r.verdict).toBe('PASS');
    expect(r.readiness).toBe('READY_FOR_WP6_B');
    expect(fake.committed).toHaveLength(0);
    expect(fake.rolledBack).toHaveLength(0);
    expect(fake.selects.length).toBeGreaterThan(0);
    expect(fake.selects.every((s) => s.kind === 'select')).toBe(true);
  });

  it('FAIL leaves zero writes too (wrong recognition mode)', async () => {
    const w = world();
    w.member_recognitions[0].track = 'AUTO';
    install(w);
    const r = await planSeniorCarryOver();
    expect(r.verdict).toBe('FAIL');
    expect(fake.committed).toHaveLength(0);
  });

  it('detects an already-applied production state through the loader', async () => {
    const w = world();
    w.senior_status_overlays = EXPECTED_CARRY_OVER.map((e, i) => ({
      id: i + 1, user_id: e.userId, status: 'ACTIVE', provenance: 'MANUAL', legacy_recognition_id: e.recognitionId, achieved_date: null,
      historical_achievement_date: null, eligibility_date: null, qualification_snapshot: null, source_evaluation_ref: null, legacy_recording_date: new Date('2026-09-29T00:00:00Z'),
    }));
    w.senior_status_transitions = w.senior_status_overlays.map((o, i) => ({ id: i + 1, overlay_id: o.id, from_status: null, to_status: 'ACTIVE', transition_type: 'CARRIED_OVER' }));
    w.membership_audit_log = EXPECTED_CARRY_OVER.map((e, i) => ({ id: 100 + i, membership_id: e.membershipId, event_type: 'SENIOR_CARRIED_OVER' }));
    install(w);
    const r = await planSeniorCarryOver();
    expect(r.state).toBe('FULLY_CARRIED_OVER');
    expect(r.verdict).toBe('FAIL');
    expect(fake.committed).toHaveLength(0);
  });
});

describe('static guarantees', () => {
  const dir = __dirname;
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const files = [path.join(dir, 'senior-carry-over.dry-run.ts'), path.join(dir, '../../../scripts/senior-carry-over-dry-run.ts')];

  it('the planner and its CLI contain no write path, transaction, evaluator or scheduler', () => {
    for (const f of files) {
      const code = strip(fs.readFileSync(f, 'utf8'));
      expect(code).not.toMatch(/insertInto|updateTable|deleteFrom|\.transaction\(|setInterval|setTimeout|GET_LOCK|calculateSeniorEligibilityDates|calculateRecognizedService|--apply/i);
      expect(code).not.toMatch(/\.(insert|delete)\(/);
    }
  });

  it('the planner consults no tenure data (no ledger table, no WP1 engine)', () => {
    const code = strip(fs.readFileSync(files[0], 'utf8'));
    expect(code).not.toMatch(/recognized_service_periods|tenure-calculator|tenure\//);
  });

  it('WP0 containment and the 0123/0124 guards are untouched (files unchanged in content shape)', () => {
    const SRC = path.resolve(dir, '../../..');
    const REPO = path.resolve(SRC, '..', '..');
    expect(fs.readFileSync(path.join(SRC, 'modules/membership/recognition/senior-containment.ts'), 'utf8')).toMatch(/export function assertLegacySeniorPathwayContained\(\): void \{\s*throw seniorContainmentError\(\);/);
    expect(fs.readFileSync(path.join(REPO, 'database/migrations/0123_guard_legacy_senior_recognitions.sql'), 'utf8')).toContain('legacy SENIOR_MEMBER recognitions are frozen');
    expect(fs.readFileSync(path.join(REPO, 'database/migrations/0124_rescope_recognition_active_lock.sql'), 'utf8')).toContain("recognition_code <> 'SENIOR_MEMBER'");
  });

  it('no migration was added for WP6-A', () => {
    const REPO = path.resolve(dir, '../../../../..');
    const names = fs.readdirSync(path.join(REPO, 'database/migrations')).filter((f) => /wp6|carry/i.test(f));
    expect(names).toEqual([]);
  });
});
