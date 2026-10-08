// TENURE-ARCH-001 v1.1 WP4 -- historical evidence & ledger reconciliation
// framework. Zero-evidence is the correct current data result: leads are
// retained, nothing is verified, nothing is inserted.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { calculateRecognizedService } from '../tenure/tenure-calculator';
import {
  EVIDENCE_SOURCES,
  HistoricalInsertRejected,
  LEAD_SOURCES,
  applyHistoricalPlan,
  buildLeadsFromMemberships,
  classifyEvidence,
  insertHistoricalPeriod,
  reconcileHistoricalEvidence,
  storedBoundaryDate,
  type HistoricalEvidenceRecord,
  type LedgerPeriodContext,
  type MembershipContext,
  type ReconciliationInput,
} from './historical-reconciliation';

const fake = db as unknown as FakeDb;
const T = '2026-10-08';

// Shape mirrors production memberships (migrated leads only).
const memberships: MembershipContext[] = [
  { id: 11, userId: 16, ownerType: 'INDIVIDUAL', parentMembershipId: null, membershipNumber: 'BCC20191100021', lifecycleState: 'ACTIVE' },
  { id: 12, userId: 17, ownerType: 'INDIVIDUAL', parentMembershipId: null, membershipNumber: 'BCC20191100022', lifecycleState: 'ACTIVE' },
  { id: 40, userId: null, ownerType: 'GROUP', parentMembershipId: null, membershipNumber: null, lifecycleState: 'ACTIVE' },
  { id: 41, userId: 16, ownerType: 'INDIVIDUAL', parentMembershipId: 40, membershipNumber: null, lifecycleState: 'ACTIVE' },
];
const leads = buildLeadsFromMemberships([
  { id: 11, userId: 16, ownerType: 'INDIVIDUAL', joinYear: 2017, joinMonth: 11, membershipNumber: 'BCC20191100021', userYearJoinedBcc: 2014 },
  { id: 12, userId: 17, ownerType: 'INDIVIDUAL', joinYear: 2019, joinMonth: 11, membershipNumber: 'BCC20191100022' },
  { id: 40, userId: null, ownerType: 'GROUP', joinYear: 2020, joinMonth: 1, membershipNumber: null },
]);

const ev = (over: Partial<HistoricalEvidenceRecord> = {}): HistoricalEvidenceRecord => ({
  evidenceId: 'E1',
  source: 'HISTORICAL_ROSTER',
  basis: 'HISTORICAL_RECONCILIATION',
  userId: 16,
  membershipId: 11,
  identityStatus: 'MAPPED',
  evidenceReference: 'roster-2015.xlsx#row12',
  start: { precision: 'EXACT', value: '2015-01-01' },
  end: { precision: 'EXACT', value: '2015-12-31' },
  evidenceKind: 'PERIOD',
  continuityEstablished: true,
  verifierUserId: 1,
  verifiedAt: '2026-10-09 10:00:00',
  ...over,
});

const input = (over: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
  memberships,
  leads,
  evidence: [],
  ledger: [],
  evaluationDate: T,
  ...over,
});

const mById = new Map(memberships.map((m) => [m.id, m]));

describe('WP4 zero-evidence dataset', () => {
  const report = reconcileHistoricalEvidence(input());

  it('produces verified_periods = 0 and nothing to insert', () => {
    expect(report.status).toBe('READY_AWAITING_VERIFIED_HISTORICAL_EVIDENCE');
    expect(report.summary.verified_periods).toBe(0);
    expect(report.summary.recognized_service_periods_to_insert).toBe(0);
    expect(report.planned).toEqual([]);
    expect(report.validation).toEqual([]);
  });

  it('keeps every individual member as an unresolved lead-only candidate', () => {
    expect(report.unresolved.map((u) => [u.userId, u.reasons])).toEqual([
      [16, ['LEAD_ONLY_NO_EVIDENCE']],
      [17, ['LEAD_ONLY_NO_EVIDENCE']],
    ]);
    expect(report.summary.unresolved_candidates).toBe(2);
  });

  it('retains join_year / join_month / number YYYY-MM / year_joined_bcc only as leads', () => {
    const u16 = report.unresolved.find((u) => u.userId === 16)!;
    expect(u16.leads.map((l) => l.source)).toEqual([
      'MEMBERSHIPS_JOIN_MONTH',
      'MEMBERSHIPS_JOIN_YEAR',
      'MEMBERSHIP_NUMBER_YYYYMM',
      'USERS_YEAR_JOINED_BCC',
    ]);
    // group membership 40 contributes no individual lead
    expect(leads.some((l) => l.membershipId === 40)).toBe(false);
  });

  it('is deterministic regardless of input order', () => {
    const shuffled = reconcileHistoricalEvidence(input({ leads: [...leads].reverse(), memberships: [...memberships].reverse() }));
    expect(shuffled.reportHash).toBe(report.reportHash);
    expect(shuffled).toEqual(report);
  });
});

describe('leads never become verified tenure', () => {
  it('lead sources and evidence sources are disjoint', () => {
    for (const s of EVIDENCE_SOURCES) expect((LEAD_SOURCES as readonly string[]).includes(s)).toBe(false);
  });

  it.each(LEAD_SOURCES)('evidence claiming lead source %s is not evidence', (source) => {
    const c = classifyEvidence(ev({ source }), mById);
    expect(c).toEqual({ accepted: false, reasons: expect.arrayContaining(['SOURCE_NOT_EVIDENCE']) });
  });

  it('a join_year-shaped record (YEAR boundary, no PERIOD evidence) stays unresolved', () => {
    const r = reconcileHistoricalEvidence(
      input({
        evidence: [
          ev({
            source: 'MEMBERSHIPS_JOIN_YEAR',
            evidenceReference: 'memberships.join_year',
            start: { precision: 'YEAR', value: '2017', attestation: 'BOUNDARY' },
            end: null,
            evidenceKind: 'BOUNDARY',
            continuityEstablished: false,
            verifierUserId: null,
            verifiedAt: null,
          }),
        ],
      }),
    );
    expect(r.planned).toEqual([]);
    expect(r.summary.verified_periods).toBe(0);
    const entry = r.unresolved.find((u) => u.evidenceId === 'E1')!;
    expect(entry.reasons).toEqual(
      expect.arrayContaining(['SOURCE_NOT_EVIDENCE', 'EVIDENCE_KIND_NOT_PERIOD', 'CONTINUITY_NOT_ESTABLISHED', 'MISSING_VERIFIER', 'MISSING_VERIFIED_AT']),
    );
  });
});

describe('evidence acceptance rules', () => {
  it('accepts a fully evidenced, verified, continuous historical period', () => {
    expect(classifyEvidence(ev(), mById)).toEqual({ accepted: true });
    const r = reconcileHistoricalEvidence(input({ evidence: [ev()] }));
    expect(r.status).toBe('EVIDENCE_EVALUATED');
    expect(r.summary.verified_periods).toBe(1);
    expect(r.planned.map((p) => p.evidenceId)).toEqual(['E1']);
    expect(r.unresolved.map((u) => u.userId)).toEqual([17]); // user 16 now resolved, 17 still lead-only
  });

  const rejected: Array<[string, Partial<HistoricalEvidenceRecord>, string]> = [
    ['missing evidence reference', { evidenceReference: '  ' }, 'MISSING_EVIDENCE_REFERENCE'],
    ['missing verifier', { verifierUserId: null }, 'MISSING_VERIFIER'],
    ['missing verified_at', { verifiedAt: null }, 'MISSING_VERIFIED_AT'],
    ['missing continuity', { continuityEstablished: false }, 'CONTINUITY_NOT_ESTABLISHED'],
    ['POINT evidence', { evidenceKind: 'POINT', continuityEstablished: false }, 'POINT_EVIDENCE'],
    ['BOUNDARY evidence', { evidenceKind: 'BOUNDARY' }, 'EVIDENCE_KIND_NOT_PERIOD'],
    ['unmapped identity', { identityStatus: 'UNMAPPED' }, 'IDENTITY_UNMAPPED'],
    ['ambiguous identity', { identityStatus: 'AMBIGUOUS' }, 'IDENTITY_AMBIGUOUS'],
    ['inverted interval', { end: { precision: 'EXACT', value: '2014-12-31' } }, 'INVERTED_INTERVAL'],
    ['invalid boundary', { start: { precision: 'EXACT', value: '2015-02-30' } }, 'INVALID_BOUNDARY'],
    ['native basis', { basis: 'NATIVE_LIFECYCLE' as never }, 'BASIS_NOT_HISTORICAL'],
    ['group membership link', { membershipId: 40 }, 'MEMBERSHIP_LINK_INVALID'],
    ['child-of-group link', { membershipId: 41 }, 'MEMBERSHIP_LINK_INVALID'],
    ['other user\'s membership', { membershipId: 12 }, 'MEMBERSHIP_LINK_INVALID'],
  ];
  it.each(rejected)('%s stays unresolved', (_n, over, code) => {
    const c = classifyEvidence(ev(over), mById);
    expect(c.accepted).toBe(false);
    if (!c.accepted) expect(c.reasons).toContain(code);
    expect(reconcileHistoricalEvidence(input({ evidence: [ev(over)] })).planned).toEqual([]);
  });
});

describe('contradictions, duplicates, overlaps, gaps', () => {
  it('flags contradictory evidence under one reference and inserts neither', () => {
    const r = reconcileHistoricalEvidence(
      input({ evidence: [ev({ evidenceId: 'E1' }), ev({ evidenceId: 'E2', end: { precision: 'EXACT', value: '2016-06-30' } })] }),
    );
    expect(r.planned).toEqual([]);
    expect(r.summary.contradictory_cases).toBe(1);
    expect(r.findings.find((f) => f.type === 'CONTRADICTION')!.refs).toEqual(['E1', 'E2']);
    expect(r.unresolved.filter((u) => u.reasons.includes('CONTRADICTORY_EVIDENCE')).map((u) => u.evidenceId)).toEqual(['E1', 'E2']);
  });

  it('deduplicates identical evidence deterministically (smallest id kept)', () => {
    const a = reconcileHistoricalEvidence(input({ evidence: [ev({ evidenceId: 'E2' }), ev({ evidenceId: 'E1' })] }));
    const b = reconcileHistoricalEvidence(input({ evidence: [ev({ evidenceId: 'E1' }), ev({ evidenceId: 'E2' })] }));
    expect(a.planned.map((p) => p.evidenceId)).toEqual(['E1']);
    expect(a.findings.filter((f) => f.type === 'DUPLICATE_EVIDENCE')).toHaveLength(1);
    expect(a.reportHash).toBe(b.reportHash);
  });

  it('reports overlap but never double counts', () => {
    const r = reconcileHistoricalEvidence(
      input({
        evidence: [
          ev({ evidenceId: 'E1' }),
          ev({ evidenceId: 'E2', evidenceReference: 'payments-2015.csv', start: { precision: 'EXACT', value: '2015-07-01' }, end: { precision: 'EXACT', value: '2016-06-30' } }),
        ],
      }),
    );
    expect(r.findings.some((f) => f.type === 'OVERLAP')).toBe(true);
    const svc = r.validation[0].service;
    expect(svc.countedIntervals).toHaveLength(1);
    expect(svc.countedIntervals[0]).toMatchObject({ start: '2015-01-01', exclusiveEnd: '2016-07-01', months: 18 });
  });

  it('preserves a genuine gap and counts cumulative service across it', () => {
    const r = reconcileHistoricalEvidence(
      input({
        evidence: [
          ev({ evidenceId: 'E1' }),
          ev({ evidenceId: 'E2', evidenceReference: 'roster-2018.xlsx#row3', start: { precision: 'EXACT', value: '2018-01-01' }, end: { precision: 'EXACT', value: '2018-12-31' } }),
        ],
      }),
    );
    expect(r.findings.find((f) => f.type === 'GAP')).toBeDefined();
    const svc = r.validation[0].service;
    expect(svc.countedIntervals).toHaveLength(2);
    expect(svc.totalMonths).toBe(24);
  });

  it('flags a ledger-held period as already present rather than planning it', () => {
    const ledger: LedgerPeriodContext[] = [
      {
        id: 5, userId: 16, membershipId: 11,
        start: { precision: 'EXACT', value: '2015-01-01' }, end: { precision: 'EXACT', value: '2015-12-31' },
        evidenceKind: 'PERIOD', continuityEstablished: true, basis: 'HISTORICAL_RECONCILIATION',
        evidenceReference: 'roster-2015.xlsx#row12', verificationStatus: 'VERIFIED', verifiedByUserId: 1, correctionState: 'CURRENT',
      },
    ];
    const r = reconcileHistoricalEvidence(input({ evidence: [ev()], ledger }));
    expect(r.planned).toEqual([]);
    expect(r.findings.some((f) => f.type === 'ALREADY_IN_LEDGER')).toBe(true);
  });

  it('flags unsupported historical ledger rows and ignores native rows', () => {
    const base: LedgerPeriodContext = {
      id: 1, userId: 16, membershipId: 11,
      start: { precision: 'EXACT', value: '2026-01-01' }, end: { precision: 'EXACT', value: '2026-12-31' },
      evidenceKind: 'PERIOD', continuityEstablished: true, basis: 'HISTORICAL_RECONCILIATION',
      evidenceReference: null, verificationStatus: 'VERIFIED', verifiedByUserId: null, correctionState: 'CURRENT',
    };
    const r = reconcileHistoricalEvidence(input({ ledger: [base, { ...base, id: 2, basis: 'NATIVE_LIFECYCLE' }] }));
    expect(r.findings.filter((f) => f.type === 'LEDGER_ROW_UNSUPPORTED').map((f) => f.refs[0])).toEqual(['L1']);
  });
});

describe('WP1 engine consumes the reconciled ledger', () => {
  it('matches the engine directly and reports a validation artefact only', () => {
    const r = reconcileHistoricalEvidence(input({ evidence: [ev()] }));
    const direct = calculateRecognizedService(
      [{ periodId: 'E1', start: { precision: 'EXACT', value: '2015-01-01' }, end: { precision: 'EXACT', value: '2015-12-31' }, evidenceKind: 'PERIOD', continuityEstablished: true, verificationStatus: 'VERIFIED', lifecycleState: 'CURRENT' }],
      T,
    );
    expect(r.validation).toEqual([{ userId: 16, service: direct }]);
    expect(direct.totalMonths).toBe(12);
    expect(JSON.stringify(r)).not.toMatch(/senior/i);
  });

  it('encodes imprecise boundaries per the 0119 stored-date convention', () => {
    expect(storedBoundaryDate({ precision: 'YEAR', value: '2015', attestation: 'PERIOD' })).toBe('2015-01-01');
    expect(storedBoundaryDate({ precision: 'MONTH', value: '2015-03', attestation: 'BOUNDARY' })).toBe('2015-03-01');
  });
});

describe('idempotent insertion', () => {
  type Row = Record<string, any>;
  let ledgerRows: Row[];
  let users: Row[];
  let memberRows: Row[];

  const respond = (op: FakeOp): unknown => {
    const table = op.table;
    const rows: Row[] | undefined = table === 'recognized_service_periods' ? ledgerRows : table === 'users' ? users : table === 'memberships' ? memberRows : undefined;
    if (op.kind === 'select') {
      if (!rows) return [];
      return rows.filter((r) =>
        op.wheres.every(([col, c, v]) => {
          const val = r[String(col).split('.').pop()!];
          if (c === '=') return val === v || (val instanceof Date && v instanceof Date && val.getTime() === v.getTime());
          if (c === 'in') return (v as unknown[]).includes(val);
          return true;
        }),
      );
    }
    if (op.kind === 'insert' && table === 'recognized_service_periods') {
      const id = 900 + ledgerRows.length;
      ledgerRows.push({ id, correction_state: 'CURRENT', ...op.values, start_date: new Date(`${op.values!.start_date}T00:00:00Z`), end_date: op.values!.end_date ? new Date(`${op.values!.end_date}T00:00:00Z`) : null });
      return { insertId: BigInt(id) };
    }
    return undefined;
  };

  beforeEach(() => {
    fake.reset();
    ledgerRows = [];
    users = [{ id: 1 }, { id: 16 }];
    memberRows = [{ id: 11, user_id: 16, owner_type: 'INDIVIDUAL', parent_membership_id: null, membership_number: 'BCC20191100021', lifecycle_state: 'ACTIVE' }];
    fake.responder = respond;
  });

  const run = (fn: (trx: any) => Promise<unknown>) => (db as any).transaction().execute(fn);

  it('inserts one append-only row with full provenance, then is a no-op on re-run', async () => {
    const first = await run((trx) => insertHistoricalPeriod(trx, ev(), 1));
    expect(first).toMatchObject({ inserted: true });
    const second = await run((trx) => insertHistoricalPeriod(trx, ev(), 1));
    expect(second).toEqual({ inserted: false, evidenceId: 'E1', reason: 'ALREADY_PRESENT' });
    const inserts = fake.writes('recognized_service_periods', 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      user_id: 16,
      membership_id: 11,
      basis: 'HISTORICAL_RECONCILIATION',
      native_source_type: null,
      native_source_id: null,
      evidence_reference: 'roster-2015.xlsx#row12',
      verification_status: 'VERIFIED',
      verified_by_user_id: 1,
      evidence_kind: 'PERIOD',
      continuity_established: 1,
      established_by_type: 'ADMIN',
      supersedes_period_id: null,
    });
    expect(fake.writes('recognized_service_periods', 'update')).toHaveLength(0);
    expect(fake.writes('recognized_service_periods', 'delete')).toHaveLength(0);
    expect(fake.writes('membership_audit_log', 'insert')).toHaveLength(1);
  });

  it('satisfies the 0126 human-basis VERIFIED predicate on the row it writes', async () => {
    await run((trx) => insertHistoricalPeriod(trx, ev(), 1));
    const v = fake.writes('recognized_service_periods', 'insert')[0].values!;
    expect(v.verified_by_user_id).not.toBeNull();
    expect(v.verified_at).not.toBeNull();
    expect(String(v.evidence_reference).trim()).not.toBe('');
  });

  it('re-validates at write time: provenance and verifier are mandatory', async () => {
    await expect(run((trx) => insertHistoricalPeriod(trx, ev({ evidenceReference: '' }), 1))).rejects.toBeInstanceOf(HistoricalInsertRejected);
    await expect(run((trx) => insertHistoricalPeriod(trx, ev({ verifierUserId: null }), 1))).rejects.toBeInstanceOf(HistoricalInsertRejected);
    await expect(run((trx) => insertHistoricalPeriod(trx, ev({ verifierUserId: 9999 }), 1))).rejects.toBeInstanceOf(HistoricalInsertRejected);
    expect(fake.writes('recognized_service_periods', 'insert')).toHaveLength(0);
  });

  it('a zero-item plan performs no database call at all', async () => {
    const report = reconcileHistoricalEvidence(input());
    const out = await run((trx) => applyHistoricalPlan(trx, report, 1));
    expect(out).toEqual([]);
    expect(fake.committed).toHaveLength(0);
    expect(fake.selects).toHaveLength(0);
  });

  it('never touches Senior / recognition tables when applying a plan', async () => {
    const report = reconcileHistoricalEvidence(input({ evidence: [ev()] }));
    await run((trx) => applyHistoricalPlan(trx, report, 1));
    const touched = new Set([...fake.committed, ...fake.selects].map((o) => o.table));
    for (const t of ['member_recognitions', 'senior_status_overlays', 'senior_status_transitions', 'memberships_update']) {
      expect(touched.has(t)).toBe(false);
    }
    expect(fake.committed.every((o) => o.kind === 'insert' && ['recognized_service_periods', 'membership_audit_log'].includes(o.table))).toBe(true);
  });
});

describe('boundaries: no Senior, containment intact, scope respected', () => {
  const dir = __dirname;
  const read = (p: string) => fs.readFileSync(p, 'utf8');

  it('the WP4 module does not reference Senior state, evaluators or schedulers', () => {
    const code = read(path.join(dir, 'historical-reconciliation.ts')).replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/senior_status|member_recognitions|SENIOR_MEMBER|calculateSeniorEligibilityDates|GET_LOCK|setInterval|cron/i);
  });

  it('the WP4 module is not wired into any runtime path', () => {
    const root = path.resolve(dir, '../../..');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name) && !p.endsWith('historical-reconciliation.ts') && /historical-reconciliation/.test(read(p))) offenders.push(p);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it('WP0 containment is still in place and no migration was added for WP4', () => {
    const containment = read(path.resolve(dir, '../recognition/senior-containment.ts'));
    expect(containment).toMatch(/SENIOR_LEGACY_PATHWAY_CONTAINED/);
    const migrations = fs.readdirSync(path.resolve(dir, '../../../../../database/migrations'));
    expect(migrations.filter((f) => /^012[6-9]|^01[3-9]/.test(f) && /histor.*(tenure|ledger|service)|wp4/i.test(f))).toEqual([]);
  });
});
