// WP5 -- SeniorStatusReader: read-only, single authoritative Senior resolver.
// Senior Member = Status Overlay; Honorary Senior = Recognition Class.
// No database writes, no migration, no evaluator: asserted below.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import {
  RECOGNITION_CLASS_CODES,
  SeniorStatusReader,
  ledgerRowToEngineInput,
} from './senior-status.reader';

const fake = db as unknown as FakeDb;
type Row = Record<string, any>;

interface World {
  overlays: Row[];
  recognitions: Row[]; // pre-joined view: recognition + membership + user columns
  memberships: Row[];
  ledger: Row[];
}

const base = (t: string) => t.split(' as ')[0];
const last = (c: unknown) => String(c).split('.').pop()!;

function install(w: World) {
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    const table = base(op.table);
    const rows: Row[] =
      table === 'senior_status_overlays' ? w.overlays
      : table === 'member_recognitions' ? w.recognitions
      : table === 'memberships' ? w.memberships
      : table === 'recognized_service_periods' ? w.ledger
      : [];
    return rows
      .filter((r) =>
        op.wheres.every(([col, cmp, val]) => {
          const v = r[last(col)];
          if (cmp === '=') return v === val;
          if (cmp === 'in') return (val as unknown[]).includes(v);
          return true;
        }),
      )
      .map((r) => ({ ...r }));
  };
}

const emptyWorld = (): World => ({ overlays: [], recognitions: [], memberships: [], ledger: [] });

const legacySenior = (over: Row = {}): Row => ({
  id: 8, membership_id: 12, user_id: 17, owner_type: 'INDIVIDUAL', recognition_code: 'SENIOR_MEMBER',
  track: 'MANUAL', status: 'ACTIVE', start_date: new Date('2026-09-29T00:00:00Z'),
  membership_number: 'BCC20191100022', full_name: 'Meeta Athavale', username: 'meetaathavale', ...over,
});
const honorary = (over: Row = {}): Row => ({
  id: 17, membership_id: 92, user_id: 85, owner_type: 'INDIVIDUAL', recognition_code: 'HONORARY_SENIOR_MEMBER',
  track: 'MANUAL', status: 'ACTIVE', start_date: new Date('2026-10-08T00:00:00Z'), ...over,
});
const overlay = (over: Row = {}): Row => ({
  id: 1, user_id: 17, status: 'ACTIVE', provenance: 'AUTO', achieved_date: new Date('2027-01-01T00:00:00Z'),
  full_name: 'Meeta Athavale', username: 'meetaathavale', ...over,
});
// A WP4 HA YEAR-boundary ledger row exactly as written in production.
const wp4Row = (id: number, userId: number, year: number): Row => ({
  id, user_id: userId, membership_id: 12, start_date: new Date(`${year}-01-01T00:00:00Z`), start_precision: 'YEAR',
  start_attestation: 'BOUNDARY', end_date: null, end_precision: null, end_attestation: null, evidence_kind: 'BOUNDARY',
  continuity_established: 0, basis: 'GOVERNANCE_ATTESTATION', verification_status: 'VERIFIED', correction_state: 'CURRENT',
});

beforeEach(() => fake.reset());
const reader = () => new SeniorStatusReader();

describe('SeniorStatusReader resolution order', () => {
  it('1. active Senior Overlay -> overlay Senior Status', async () => {
    install({ ...emptyWorld(), overlays: [overlay()] });
    const r = await reader().forUser(17);
    expect(r.senior).toEqual({ source: 'OVERLAY', provenance: 'AUTO', overlayId: 1, achievedDate: '2027-01-01' });
  });

  it('1b. overlay takes precedence over the legacy row for the same individual', async () => {
    install({ ...emptyWorld(), overlays: [overlay({ provenance: 'MANUAL' })], recognitions: [legacySenior()] });
    expect((await reader().forUser(17)).senior).toMatchObject({ source: 'OVERLAY', provenance: 'MANUAL' });
  });

  it('1c. a REMOVED overlay is not Senior Status', async () => {
    install({ ...emptyWorld(), overlays: [overlay({ status: 'REMOVED' })] });
    expect((await reader().forUser(17)).senior).toEqual({ source: 'NONE' });
  });

  it('2. no overlay but frozen MANUAL SENIOR_MEMBER -> legacy Senior Status', async () => {
    install({ ...emptyWorld(), recognitions: [legacySenior()] });
    expect((await reader().forUser(17)).senior).toEqual({
      source: 'LEGACY_MANUAL_RECOGNITION', provenance: 'MANUAL', recognitionId: 8, sinceDate: '2026-09-29',
    });
  });

  it('2b. only an ACTIVE MANUAL SENIOR_MEMBER of an INDIVIDUAL membership counts', async () => {
    install({
      ...emptyWorld(),
      recognitions: [
        legacySenior({ id: 8, status: 'HISTORICAL' }),
        legacySenior({ id: 9, track: 'AUTO' }),
        legacySenior({ id: 10, owner_type: 'GROUP' }),
      ],
    });
    expect((await reader().forUser(17)).senior).toEqual({ source: 'NONE' });
  });

  it('3. neither -> no Senior Status', async () => {
    install(emptyWorld());
    expect((await reader().forUser(17)).senior).toEqual({ source: 'NONE' });
  });

  it('forMembership resolves via the membership owner and returns null for an unknown membership', async () => {
    install({ ...emptyWorld(), memberships: [{ id: 12, user_id: 17 }], recognitions: [legacySenior()] });
    expect((await reader().forMembership(12))!.senior.source).toBe('LEGACY_MANUAL_RECOGNITION');
    expect(await reader().forMembership(999)).toBeNull();
  });
});

describe('Senior Status vs Recognition Class', () => {
  it('4. Senior Overlay + Honorary class stay independent', async () => {
    install({ ...emptyWorld(), overlays: [overlay({ user_id: 85 })], recognitions: [honorary()] });
    const r = await reader().forUser(85);
    expect(r.senior.source).toBe('OVERLAY');
    // the class is not part of the Senior result; it remains a Recognition Class
    expect(RECOGNITION_CLASS_CODES).toContain('HONORARY_SENIOR_MEMBER');
    expect(JSON.stringify(r)).not.toMatch(/HONORARY/);
  });

  it('5. Honorary Senior (class) only -> NOT Senior Status', async () => {
    install({ ...emptyWorld(), recognitions: [honorary()] });
    expect((await reader().forUser(85)).senior).toEqual({ source: 'NONE' });
  });

  it('SENIOR_MEMBER is not a Recognition Class code', () => {
    expect([...RECOGNITION_CLASS_CODES]).not.toContain('SENIOR_MEMBER');
  });

  it('listActive: overlay first, legacy rows for others, no duplicate individual', async () => {
    install({
      ...emptyWorld(),
      overlays: [overlay({ id: 3, user_id: 17 })],
      recognitions: [legacySenior({ id: 8, user_id: 17 }), legacySenior({ id: 9, user_id: 18, membership_id: 13, username: 'ankittiwari' })],
    });
    const rows = await reader().listActive();
    expect(rows.map((r) => [r.userId, r.senior.source])).toEqual([[17, 'OVERLAY'], [18, 'LEGACY_MANUAL_RECOGNITION']]);
  });
});

describe('WP4 YEAR-boundary rows: zero tenure, never Senior', () => {
  const rows = Array.from({ length: 5 }, (_, i) => wp4Row(3 + i, 17, 2016 + i));

  it('6. contribute zero counted tenure (CONTINUITY_NOT_ESTABLISHED)', async () => {
    install({ ...emptyWorld(), ledger: rows });
    const r = await reader().forUser(17, { tenureAsOf: '2026-10-09' });
    expect(r.tenure).toEqual({
      evaluationDate: '2026-10-09', totalMonths: 0, remainderDays: 0, countedIntervals: 0, excludedReasons: ['CONTINUITY_NOT_ESTABLISHED'],
    });
  });

  it('7. cannot produce Senior Status, even with decades of boundary rows', async () => {
    install({ ...emptyWorld(), ledger: rows });
    const r = await reader().forUser(17, { tenureAsOf: '2040-01-01' });
    expect(r.senior).toEqual({ source: 'NONE' });
    expect(r.tenure!.totalMonths).toBe(0);
  });

  it('ledgerRowToEngineInput keeps YEAR precision, BOUNDARY attestation and continuity=false', () => {
    const e = ledgerRowToEngineInput(wp4Row(3, 17, 2016) as any);
    expect(e).toMatchObject({
      start: { precision: 'YEAR', value: '2016', attestation: 'BOUNDARY' }, end: null,
      evidenceKind: 'BOUNDARY', continuityEstablished: false, verificationStatus: 'VERIFIED', lifecycleState: 'CURRENT',
    });
  });

  it('tenure is attached only when requested', async () => {
    install({ ...emptyWorld(), ledger: rows });
    expect((await reader().forUser(17)).tenure).toBeUndefined();
  });
});

describe('read-only guarantee', () => {
  it('13. every operation only SELECTs (no insert/update/delete, no transaction)', async () => {
    install({ ...emptyWorld(), overlays: [overlay()], recognitions: [legacySenior(), honorary()], memberships: [{ id: 12, user_id: 17 }], ledger: [wp4Row(3, 17, 2016)] });
    await reader().forUser(17, { tenureAsOf: '2026-10-09' });
    await reader().forMembership(12);
    await reader().listActive();
    expect(fake.committed).toHaveLength(0);
    expect(fake.rolledBack).toHaveLength(0);
    expect(fake.selects.length).toBeGreaterThan(0);
  });

  it('15. the reader source contains no write path, scheduler or evaluator', () => {
    const src = fs.readFileSync(path.join(__dirname, 'senior-status.reader.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/insertInto|updateTable|deleteFrom|\.transaction\(|setInterval|setTimeout|GET_LOCK|cron|calculateSeniorEligibilityDates/i);
  });
});

describe('WP5 scope boundaries (static)', () => {
  const SRC = path.resolve(__dirname, '../../..');
  const REPO = path.resolve(SRC, '../..');
  const read = (p: string) => fs.readFileSync(p, 'utf8');

  it('12. admin page has no Senior award / eligibility action and reads the new endpoint', () => {
    const page = read(path.join(REPO, 'frontend/src/pages/hub/admin/membership/index.astro'));
    expect(page).not.toMatch(/btn-check-senior|btn-assign-senior|senior-status\/eligible|senior-status\/evaluate|Assign Senior Status/);
    expect(page).toContain('/api/v1/membership/admin/senior-status/current');
  });

  it('9. public profile page renders the class badge and the Senior badge independently', () => {
    const page = read(path.join(REPO, 'frontend/src/pages/photographers/[username].astro'));
    expect(page).toContain('id="ph-recognition-badge"');
    expect(page).toContain('id="ph-senior-badge"');
    expect(page).toMatch(/profile\.recognition\s*&&\s*profile\.recognition\.label/);
    expect(page).toMatch(/profile\.seniorStatus\s*&&\s*profile\.seniorStatus\.label/);
    // nothing on the page is derived from the tenure ledger / WP4 boundary data
    expect(page).not.toMatch(/recognized_service_periods|tenureYears|yearsServed|continuity|totalMonths/i);
  });

  it('legacy Senior containment and the legacy admin evaluator are unchanged (still inert)', () => {
    const svc = read(path.join(SRC, 'modules/membership/admin/membership-admin.service.ts'));
    expect(svc).toMatch(/async listSeniorStatusEligible\(\) \{\s*assertLegacySeniorPathwayContained\(\);/);
    expect(svc).toMatch(/async assignSeniorStatusToEligible\(actorUserId: number\): Promise<\{ assigned: number \}> \{\s*assertLegacySeniorPathwayContained\(\);/);
    const rec = read(path.join(SRC, 'modules/membership/recognition/recognition.service.ts'));
    expect(rec).toContain('if (isSeniorStatusCode(recognitionCode)) throw seniorContainmentError();');
    expect(rec).toContain('if (isSeniorStatusCode(active.recognition_code)) throw seniorContainmentError();');
    expect(read(path.join(SRC, 'modules/membership/recognition/senior-containment.ts'))).toMatch(/export function assertLegacySeniorPathwayContained\(\): void \{\s*throw seniorContainmentError\(\);/);
  });

  it('14. WP5 adds no migration (latest migration is not a WP5 file)', () => {
    const names = fs.readdirSync(path.join(REPO, 'database/migrations')).filter((f) => /senior|wp5|reader/i.test(f));
    // pre-existing Senior migrations only; none created for WP5
    expect(names.sort()).toEqual([
      '0085_mem008_senior_criteria_seed.sql',
      '0120_create_senior_status_overlays.sql',
      '0121_create_senior_status_transitions.sql',
      '0123_guard_legacy_senior_recognitions.sql',
    ]);
  });
});
