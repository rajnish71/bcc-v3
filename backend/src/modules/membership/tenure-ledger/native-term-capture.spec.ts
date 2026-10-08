// TENURE-ARCH-001 v1.1 WP3 -- native lifecycle capture, 0126 verification
// semantics, timezone determinism and sequencing. Database behaviour that
// only MySQL can enforce (CHECK/trigger execution) is covered by the static
// assertions on 0126 below plus the model predicate in this file; no
// migration is executed by this suite.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { toMysqlDatetime } from '../../identity/shared/token-hash.util';
import { calculateRecognizedService } from '../tenure/tenure-calculator';
import type { RecognizedServicePeriodInput } from '../tenure/tenure.types';
import {
  NATIVE_SOURCE,
  captureNativeTerm,
  closeNativePeriodsAtTermination,
  inclusiveEndDate,
  nativeTermCivilDates,
  parseStoredInstant,
} from './native-term-capture';

const fake = db as unknown as FakeDb;
const SRC = path.resolve(__dirname, '../../..');
const REPO = path.resolve(SRC, '../..');
const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

type Row = Record<string, any>;
interface World {
  users: Row[];
  memberships: Row[];
  recognized_service_periods: Row[];
}

const asDate = (s: string | Date | null) => (s == null ? null : s instanceof Date ? s : new Date(`${s}T00:00:00Z`));

function install(world: World) {
  let id = 500;
  const matchRow = (r: Row, op: FakeOp) =>
    op.wheres.every(([col, cmp, val]) => {
      const v = r[String(col).split('.').pop()!];
      if (cmp === '=') return v === val;
      if (cmp === 'is') return (v ?? null) === val;
      return true;
    });
  fake.responder = (op: FakeOp) => {
    const rows = (world as any)[op.table] as Row[] | undefined;
    if (op.kind === 'select') {
      if (!rows) return [];
      return rows.filter((r) => matchRow(r, op)).map((r) => ({ ...r }));
    }
    if (op.kind === 'insert' && op.table === 'recognized_service_periods') {
      const v = op.values!;
      const lock = v.native_source_type != null && v.supersedes_period_id == null ? `${v.native_source_type}:${v.native_source_id}` : null;
      if (lock && world.recognized_service_periods.some((r) => r.lock === lock)) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      const row = { id: id++, correction_state: 'CURRENT', lock, ...v, start_date: asDate(v.start_date as string), end_date: asDate(v.end_date as string | null) };
      world.recognized_service_periods.push(row);
      return { insertId: BigInt(row.id) };
    }
    if (op.kind === 'update' && op.table === 'recognized_service_periods') {
      const hit = rows!.filter((r) => matchRow(r, op));
      hit.forEach((r) => Object.assign(r, op.set));
      return { numUpdatedRows: BigInt(hit.length) };
    }
    return undefined;
  };
}

const baseWorld = (): World => ({
  users: [{ id: 7, username: 'member7' }, { id: 118, username: null }],
  memberships: [
    { id: 1, user_id: 7, owner_type: 'INDIVIDUAL', parent_membership_id: null },
    { id: 2, user_id: 7, owner_type: 'INDIVIDUAL', parent_membership_id: 99 },
    { id: 3, user_id: 7, owner_type: 'GROUP', parent_membership_id: null },
    { id: 4, user_id: 118, owner_type: 'INDIVIDUAL', parent_membership_id: null },
  ],
  recognized_service_periods: [],
});

const inTx = <T>(fn: (trx: any) => Promise<T>) => fake.transaction().execute(fn as any) as Promise<T>;
const ledgerInserts = () => fake.writes('recognized_service_periods', 'insert');
const auditEvents = () => fake.writes('membership_audit_log', 'insert').map((o) => o.values!.event_type);

// Mirror of 0126 chk_rsp_verification + 0119 chk_rsp_native_source.
function verificationShapeValid(r: Row): boolean {
  const nativeOk =
    r.basis === 'NATIVE_LIFECYCLE'
      ? r.native_source_type != null && r.native_source_id != null
      : r.native_source_type == null && r.native_source_id == null;
  const ev = r.evidence_reference;
  const v =
    (r.verification_status === 'UNVERIFIED' && r.verified_by_user_id == null && r.verified_at == null) ||
    (r.verification_status === 'VERIFIED' &&
      r.verified_at != null &&
      ((r.basis === 'NATIVE_LIFECYCLE' && r.verified_by_user_id == null) ||
        (r.basis !== 'NATIVE_LIFECYCLE' && r.verified_by_user_id != null && ev != null && String(ev).trim() !== ''))) ||
    (r.verification_status === 'REJECTED' &&
      r.verified_by_user_id != null &&
      r.verified_at != null &&
      r.verification_reason != null &&
      String(r.verification_reason).trim() !== '');
  return nativeOk && v;
}

beforeEach(() => fake.reset());

describe('0126 (WP2-A1) verification CHECK amendment', () => {
  const sql = read(path.join(REPO, 'database/migrations/0126_amend_service_period_verification_check.sql'));
  const code = sql.replace(/^\s*--.*$/gm, '');

  it('is CHECK-only: drops and re-adds chk_rsp_verification, adds no column, touches no data', () => {
    expect(code).toMatch(/DROP CHECK chk_rsp_verification;/);
    expect(code).toMatch(/ADD CONSTRAINT chk_rsp_verification CHECK/);
    expect(code).not.toMatch(/ADD COLUMN|MODIFY COLUMN|CREATE TABLE|CREATE TRIGGER|DROP TRIGGER|DROP TABLE/i);
    expect([...code.matchAll(/INSERT\s+(?:IGNORE\s+)?INTO\s+(\w+)/gi)].map((m) => m[1])).toEqual(['schema_migrations']);
    expect(code).not.toMatch(/\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i);
    expect(code.indexOf('SET NAMES utf8mb4;')).toBeLessThan(code.indexOf('START TRANSACTION;'));
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('encodes the approved semantics for every status', () => {
    expect(code).toMatch(/verification_status = 'UNVERIFIED' AND verified_by_user_id IS NULL AND verified_at IS NULL/);
    expect(code).toMatch(/basis = 'NATIVE_LIFECYCLE' AND verified_by_user_id IS NULL/);
    expect(code).toMatch(/basis <> 'NATIVE_LIFECYCLE' AND verified_by_user_id IS NOT NULL\s+AND evidence_reference IS NOT NULL AND TRIM\(evidence_reference\) <> ''/);
    expect(code).toMatch(/verification_status = 'REJECTED' AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL\s+AND verification_reason IS NOT NULL AND TRIM\(verification_reason\) <> ''/);
  });

  it('native-source requirements stay enforced by 0119 (unchanged)', () => {
    expect(read(path.join(REPO, 'database/migrations/0119_create_recognized_service_periods.sql'))).toMatch(
      /basis = 'NATIVE_LIFECYCLE' AND native_source_type IS NOT NULL AND native_source_id IS NOT NULL/,
    );
  });

  const native = { basis: 'NATIVE_LIFECYCLE', native_source_type: 'X', native_source_id: 1, verification_status: 'VERIFIED', verified_by_user_id: null, verified_at: 't', evidence_reference: null };
  const human = { basis: 'HISTORICAL_RECONCILIATION', native_source_type: null, native_source_id: null, verification_status: 'VERIFIED', verified_by_user_id: 5, verified_at: 't', evidence_reference: 'minutes 2014-03' };

  it('NATIVE_SYSTEM: VERIFIED, no verifier, source present', () => {
    expect(verificationShapeValid(native)).toBe(true);
    expect(verificationShapeValid({ ...native, native_source_id: null })).toBe(false);
    expect(verificationShapeValid({ ...native, verified_at: null })).toBe(false);
  });
  it('rejects a human verifier masquerading on a native row', () => {
    expect(verificationShapeValid({ ...native, verified_by_user_id: 5 })).toBe(false);
  });
  it('HUMAN_HISTORICAL: verifier, verified_at and non-blank evidence_reference required', () => {
    expect(verificationShapeValid(human)).toBe(true);
    expect(verificationShapeValid({ ...human, verified_by_user_id: null })).toBe(false);
    expect(verificationShapeValid({ ...human, evidence_reference: null })).toBe(false);
    expect(verificationShapeValid({ ...human, evidence_reference: '   ' })).toBe(false);
    expect(verificationShapeValid({ ...human, native_source_type: 'X', native_source_id: 1 })).toBe(false);
  });
  it('REJECTED keeps its human + reason requirements', () => {
    const rej = { basis: 'GOVERNANCE_ATTESTATION', native_source_type: null, native_source_id: null, verification_status: 'REJECTED', verified_by_user_id: 5, verified_at: 't', verification_reason: 'no evidence' };
    expect(verificationShapeValid(rej)).toBe(true);
    expect(verificationShapeValid({ ...rej, verification_reason: ' ' })).toBe(false);
    expect(verificationShapeValid({ ...rej, verified_by_user_id: null })).toBe(false);
  });

  it('writer rows satisfy the model predicate', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-10-01 05:00:00', endInstant: '2027-10-01 05:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    expect(verificationShapeValid(w.recognized_service_periods[0])).toBe(true);
    expect(w.recognized_service_periods[0]).toMatchObject({ basis: 'NATIVE_LIFECYCLE', verification_status: 'VERIFIED', verified_by_user_id: null, established_by_type: 'SYSTEM', established_by_user_id: null });
  });
});

describe('civil-date conversion (exclusive end instant, Asia/Kolkata)', () => {
  it('IST midnight boundary: 18:29:59Z is still the same IST day, 18:30:00Z is the next', () => {
    expect(nativeTermCivilDates(new Date('2026-03-31T18:29:59Z'), new Date('2027-03-31T18:30:00Z'))).toEqual({
      startDate: '2026-03-31',
      endDate: '2027-03-31', // end instant 00:00:00 IST on 1 Apr is exclusive -> inclusive 31 Mar
    });
    expect(nativeTermCivilDates(new Date('2026-03-31T18:30:00Z'), new Date('2027-04-01T18:30:00Z'))).toEqual({
      startDate: '2026-04-01',
      endDate: '2027-04-01',
    });
  });
  it('end - 1 second: an end at exactly IST midnight belongs to the previous day', () => {
    expect(inclusiveEndDate(new Date('2026-12-31T18:30:00Z'))).toBe('2026-12-31');
    expect(inclusiveEndDate(new Date('2026-12-31T18:30:01Z'))).toBe('2027-01-01');
  });
  it('fractional seconds are truncated to the stored resolution', () => {
    expect(nativeTermCivilDates(new Date('2026-03-31T18:29:59.999Z'), new Date('2026-04-30T05:00:00.900Z'))?.startDate).toBe('2026-03-31');
  });
  it('empty or inverted terms yield nothing', () => {
    expect(nativeTermCivilDates(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBeNull();
    expect(nativeTermCivilDates(new Date('2026-01-02T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });
  it('is identical for the same instants regardless of process TZ (checked under TZ=UTC and TZ=Asia/Kolkata runs)', () => {
    const stored = '2026-09-30 18:30:00';
    expect(toMysqlDatetime(parseStoredInstant(stored))).toBe(stored);
    expect(nativeTermCivilDates(parseStoredInstant(stored), parseStoredInstant('2027-09-30 18:30:00'))).toEqual({
      startDate: '2026-10-01',
      endDate: '2027-09-30', // exclusive end = 00:00 IST on 1 Oct 2027
    });
    // toMysqlDatetime must use UTC getters: a fixed instant has one text form.
    expect(toMysqlDatetime(new Date('2026-10-08T23:59:59Z'))).toBe('2026-10-08 23:59:59');
  });
});

describe('native capture', () => {
  it('first activation: one VERIFIED NATIVE_LIFECYCLE row from the stored instants', async () => {
    const w = baseWorld();
    install(w);
    const r = await inTx((trx) =>
      captureNativeTerm(trx, { membershipId: 1, startInstant: new Date('2026-10-08T07:41:09.456Z'), endInstant: '2027-10-08 07:41:09', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }),
    );
    expect(r).toMatchObject({ captured: true, startDate: '2026-10-08', endDate: '2027-10-08' });
    expect(ledgerInserts()).toHaveLength(1);
    expect(ledgerInserts()[0].values).toMatchObject({
      user_id: 7, membership_id: 1, start_date: '2026-10-08', end_date: '2027-10-08', start_precision: 'EXACT', end_precision: 'EXACT',
      evidence_kind: 'PERIOD', continuity_established: 1, native_source_type: 'MEMBERSHIP_ACTIVATION', native_source_id: 1,
      supersedes_period_id: null,
    });
    expect(auditEvents()).toEqual(['SERVICE_PERIOD_ESTABLISHED']);
    expect(fake.writes('membership_audit_log', 'insert')[0].values).toMatchObject({ subject_user_id: 7, actor_type: 'SYSTEM' });
  });

  it('is idempotent per native source', async () => {
    const w = baseWorld();
    install(w);
    const input = { membershipId: 1, startInstant: '2026-10-01 05:00:00', endInstant: '2027-10-01 05:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 };
    await inTx((trx) => captureNativeTerm(trx, input));
    const again = await inTx((trx) => captureNativeTerm(trx, input));
    expect(again).toEqual({ captured: false, reason: 'ALREADY_CAPTURED' });
    expect(w.recognized_service_periods).toHaveLength(1);
  });

  it('NULL expires_at is excluded', async () => {
    const w = baseWorld();
    install(w);
    expect(await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-10-01 05:00:00', endInstant: null, sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }))).toEqual({ captured: false, reason: 'NULL_EXPIRY' });
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('group-linked and GROUP rows never transfer tenure', async () => {
    const w = baseWorld();
    install(w);
    for (const membershipId of [2, 3]) {
      expect(await inTx((trx) => captureNativeTerm(trx, { membershipId, startInstant: '2026-10-01 05:00:00', endInstant: '2027-10-01 05:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: membershipId }))).toEqual({ captured: false, reason: 'NOT_INDIVIDUAL_OWN_TERM' });
    }
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('continuous renewal: the new term starts at the previous exclusive end; engine coalesces with no gap', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2025-10-08 07:41:09', endInstant: '2026-10-08 07:41:09', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-10-08 07:41:09', endInstant: '2027-10-08 07:41:09', sourceType: NATIVE_SOURCE.RENEWAL_OPERATION, sourceId: 41 }));
    const res = calculateRecognizedService(toEngine(w), '2027-10-08');
    expect(res.countedIntervals).toHaveLength(1);
    expect(res.totalMonths).toBe(24);
  });

  it('post-expiry reinstatement is a NEW period; the lapse stays a gap', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2025-01-10 06:00:00', endInstant: '2026-01-10 06:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-03-10 06:00:00', endInstant: '2027-03-10 06:00:00', sourceType: NATIVE_SOURCE.RENEWAL_OPERATION, sourceId: 42 }));
    expect(w.recognized_service_periods).toHaveLength(2);
    const res = calculateRecognizedService(toEngine(w), '2027-03-10');
    expect(res.countedIntervals).toHaveLength(2);
    expect(res.totalMonths).toBe(24);
    // 2026-01-10..2026-03-09 is not counted: 12 + 12 months, not 26.
  });

  it('carries no username/identity guard: a member with a NULL username is captured normally', async () => {
    const w = baseWorld();
    install(w);
    const r = await inTx((trx) =>
      captureNativeTerm(trx, { membershipId: 4, startInstant: '2026-10-01 05:00:00', endInstant: '2027-10-01 05:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 4 }),
    );
    expect(r).toMatchObject({ captured: true });
    expect(ledgerInserts()).toHaveLength(1);
  });
});

describe('termination', () => {
  it('truncates at MIN(term end, terminated_at) by appending a superseding row', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-01-10 06:00:00', endInstant: '2027-01-10 06:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    const out = await inTx((trx) => closeNativePeriodsAtTermination(trx, 1, new Date('2026-06-15T10:00:00Z'), 99));
    expect(out).toEqual({ corrected: 1 });
    const [orig, repl] = w.recognized_service_periods;
    expect(orig.correction_state).toBe('CORRECTED');
    expect(repl).toMatchObject({ correction_state: 'CURRENT', supersedes_period_id: orig.id, native_source_type: 'MEMBERSHIP_TERMINATION', native_source_id: 1, verified_by_user_id: null });
    expect(repl.end_date.toISOString().slice(0, 10)).toBe('2026-06-15');
    expect(orig.start_date.getTime()).toBe(repl.start_date.getTime());
    expect(auditEvents()).toEqual(['SERVICE_PERIOD_ESTABLISHED', 'SERVICE_PERIOD_CORRECTED']);
    // Only the corrected row counts.
    const res = calculateRecognizedService(toEngine(w), '2026-12-31');
    expect(res.excluded.find((e) => e.periodId === String(orig.id))?.reason).toBe('NOT_CURRENT');
    expect(res.countedIntervals[0].exclusiveEnd).toBe('2026-06-16');
  });

  it('termination at an exact IST midnight ends service on the previous civil day', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-01-10 06:00:00', endInstant: '2027-01-10 06:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    await inTx((trx) => closeNativePeriodsAtTermination(trx, 1, new Date('2026-06-14T18:30:00Z')));
    expect(w.recognized_service_periods[1].end_date.toISOString().slice(0, 10)).toBe('2026-06-14');
  });

  it('after term end: nothing changes (MIN rule)', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2025-01-10 06:00:00', endInstant: '2026-01-10 06:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    const out = await inTx((trx) => closeNativePeriodsAtTermination(trx, 1, new Date('2026-06-15T10:00:00Z')));
    expect(out).toEqual({ corrected: 0 });
    expect(w.recognized_service_periods).toHaveLength(1);
    expect(w.recognized_service_periods[0].correction_state).toBe('CURRENT');
  });

  it('a term that has not begun is corrected by the normal path: end < start, zero service, no SUPERSEDED', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2025-10-08 07:41:09', endInstant: '2026-10-08 07:41:09', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-10-08 07:41:09', endInstant: '2027-10-08 07:41:09', sourceType: NATIVE_SOURCE.RENEWAL_OPERATION, sourceId: 41 }));
    const out = await inTx((trx) => closeNativePeriodsAtTermination(trx, 1, new Date('2026-09-01T00:00:00Z')));
    expect(out).toEqual({ corrected: 2 });
    expect(w.recognized_service_periods.map((r) => r.correction_state)).toEqual(['CORRECTED', 'CORRECTED', 'CURRENT', 'CURRENT']);
    const [, future, , futureRepl] = w.recognized_service_periods;
    expect(futureRepl.supersedes_period_id).toBe(future.id);
    expect(futureRepl.end_date.getTime()).toBeLessThan(futureRepl.start_date.getTime());
    const res = calculateRecognizedService(toEngine(w), '2027-12-31');
    expect(res.excluded.find((e) => e.periodId === String(futureRepl.id))?.reason).toBe('INVERTED_INTERVAL');
    expect(res.countedIntervals).toHaveLength(1);
    expect(res.countedIntervals[0].exclusiveEnd).toBe('2026-09-02');
    expect(auditEvents().filter((e) => e === 'SERVICE_PERIOD_SUPERSEDED')).toHaveLength(0);
  });

  it('closing twice is idempotent', async () => {
    const w = baseWorld();
    install(w);
    await inTx((trx) => captureNativeTerm(trx, { membershipId: 1, startInstant: '2026-01-10 06:00:00', endInstant: '2027-01-10 06:00:00', sourceType: NATIVE_SOURCE.ACTIVATION, sourceId: 1 }));
    await inTx((trx) => closeNativePeriodsAtTermination(trx, 1, new Date('2026-06-15T10:00:00Z')));
    const again = await inTx((trx) => closeNativePeriodsAtTermination(trx, 1, new Date('2026-06-15T10:00:00Z')));
    expect(again).toEqual({ corrected: 0 });
    expect(w.recognized_service_periods).toHaveLength(2);
  });
});

describe('engine consumption and ledger immutability', () => {
  it('the WP1 engine counts only VERIFIED + CURRENT periods', () => {
    const mk = (id: string, v: 'VERIFIED' | 'UNVERIFIED', s: 'CURRENT' | 'CORRECTED'): RecognizedServicePeriodInput => ({
      periodId: id, start: { precision: 'EXACT', value: '2020-01-01' }, end: { precision: 'EXACT', value: '2020-12-31' },
      evidenceKind: 'PERIOD', continuityEstablished: true, verificationStatus: v, lifecycleState: s,
    });
    const res = calculateRecognizedService([mk('a', 'VERIFIED', 'CURRENT'), mk('b', 'UNVERIFIED', 'CURRENT'), mk('c', 'VERIFIED', 'CORRECTED')], '2021-01-01');
    expect(res.excluded.map((e) => [e.periodId, e.reason])).toEqual([['b', 'NOT_VERIFIED'], ['c', 'NOT_CURRENT']]);
    expect(res.totalMonths).toBe(12);
  });

  it('0119 append-only protections are untouched by WP3 and the writer never deletes', () => {
    const src = read(path.join(__dirname, 'native-term-capture.ts'));
    expect(src).not.toMatch(/deleteFrom/);
    const updates = [...src.matchAll(/updateTable\('recognized_service_periods'\)\s*\.set\(\{([^}]*)\}\)/g)].map((m) => m[1].trim());
    expect(updates.every((u) => /^correction_state: '(CORRECTED|SUPERSEDED)'$/.test(u))).toBe(true);
    expect(read(path.join(REPO, 'database/migrations/0119_create_recognized_service_periods.sql'))).toMatch(/trg_rsp_before_delete/);
  });
});

describe('wiring boundaries (static)', () => {
  const lifecycle = read(path.join(SRC, 'modules/membership/lifecycle/membership-lifecycle.service.ts'));
  const method = (name: string) => {
    const start = lifecycle.search(new RegExp(`\\n  async ${name}\\(`));
    expect(start).toBeGreaterThan(-1);
    const next = lifecycle.slice(start + 10).search(/\n  async \w+\(|\n  \/\/ ={20,}/);
    return lifecycle.slice(start, next < 0 ? undefined : start + 10 + next);
  };

  it('capture is wired only to activation, applied renewal/reinstatement and termination', () => {
    expect(method('activate')).toMatch(/captureNativeTerm/);
    expect(method('activate')).toMatch(/!isGroupMember && !opts\?\.expiresAtOverride/);
    expect(method('terminate')).toMatch(/closeNativePeriodsAtTermination/);
    expect(read(path.join(SRC, 'modules/membership/renewal/membership-renewal.service.ts'))).toMatch(/captureNativeTerm/);
  });

  it('suspension, resume, expiry, class change and legacy renewal paths capture nothing', () => {
    for (const m of ['suspend', 'resume', 'markExpired', 'renewFromExpired', 'renewGroup', 'changeClass']) {
      const body = lifecycle.includes(`async ${m}(`) ? method(m) : '';
      expect(body).not.toMatch(/captureNativeTerm|closeNativePeriodsAtTermination|recognized_service_periods/);
    }
  });

  it('the capture module computes no tenure, no Senior state and no historical term from migrations', () => {
    const src = read(path.join(__dirname, 'native-term-capture.ts')).replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/calculateRecognizedService|senior_status|recognition|activated_at|join_year|join_month|addMonths|setMonth|365/i);
  });

  it('no migration backfill of the 37 historical activation rows exists', () => {
    const dir = path.join(REPO, 'database/migrations');
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f) && f > '0119')
      .filter((f) => /INSERT\s+(IGNORE\s+)?INTO\s+recognized_service_periods/i.test(read(path.join(dir, f))));
    expect(offenders).toEqual([]);
  });

  it('the database layer pins UTC at driver and session level', () => {
    const dbts = read(path.join(SRC, 'database/db.ts'));
    expect(dbts).toMatch(/timezone: 'Z'/);
    expect(dbts).toMatch(/SET time_zone = '\+00:00'/);
  });
});

function toEngine(w: World): RecognizedServicePeriodInput[] {
  return w.recognized_service_periods.map((r) => ({
    periodId: String(r.id),
    start: { precision: 'EXACT', value: r.start_date.toISOString().slice(0, 10) },
    end: r.end_date ? { precision: 'EXACT', value: r.end_date.toISOString().slice(0, 10) } : null,
    evidenceKind: r.evidence_kind,
    continuityEstablished: r.continuity_established === 1,
    verificationStatus: r.verification_status,
    lifecycleState: r.correction_state,
  }));
}
