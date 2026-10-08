// WP5 -- public profile: Recognition Class and Senior Status are separate,
// resolved independently (class rows vs SeniorStatusReader). Read-only.

jest.mock('../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('kysely', () => {
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
    { ref: (r: string) => ({ ref: r }), raw: (r: string) => ({ raw: r }), lit: (v: unknown) => ({ lit: v }), join: (v: unknown[]) => ({ join: v }) },
  );
  return { sql };
});
jest.mock('../gallery/portfolio-exposure.service', () => ({
  PortfolioExposureService: class {},
  exposedPhotoPredicate: () => ({}),
}));
jest.mock('../gallery/gallery.service', () => ({ GalleryService: class {} }));
jest.mock('../membership/current-members.query', () => ({ countCurrentMembers: async () => 0 }));
jest.mock('./directory-eligibility.service', () => {
  const { db: fakeDb } = jest.requireMock('../../database/db');
  return {
    DirectoryEligibilityService: class {},
    directoryBaseQuery: () => fakeDb.selectFrom('users as u'),
  };
});

import { db } from '../../database/db';
import type { FakeDb, FakeOp } from '../../test-support/fake-db';
import { PhotographerProfilesService } from './photographer-profiles.service';
import { HONORARY_RECOGNITION_CODES } from './directory-listing.policy';

const fake = db as unknown as FakeDb;
const svc = new PhotographerProfilesService({ getExposureSet: async () => ({}) } as any, { listableUserIds: async () => null, baseUserIds: async () => [] } as any, {} as any);

const USER = {
  id: 17, username: 'meetaathavale', full_name: 'Meeta Athavale', name_title: null,
  profile_visibility: 'PUBLIC', membership_id: 12, membership_number: 'BCC20191100022',
  class_code: 'LEGACY_MEMBER', tagline: null, bio: null, city: 'Bhopal', join_year: 2019,
};

type Row = Record<string, any>;
function script(opts: { classRows?: Row[]; overlays?: Row[]; legacy?: Row[]; ledger?: Row[] }) {
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    if (op.table === 'users as u') return [USER];
    if (op.table === 'member_recognitions') {
      // class lookup: must be restricted to Recognition Class codes
      const codes = op.wheres.find(([c, cmp]) => c === 'recognition_code' && cmp === 'in')?.[2] as string[] | undefined;
      return (opts.classRows ?? []).filter((r) => !codes || codes.includes(r.recognition_code));
    }
    if (op.table === 'senior_status_overlays') return opts.overlays ?? [];
    if (op.table === 'member_recognitions as mr') return opts.legacy ?? [];
    if (op.table === 'recognized_service_periods') return opts.ledger ?? [];
    return [];
  };
}

beforeEach(() => fake.reset());

const legacySenior = { id: 8, start_date: new Date('2026-09-29T00:00:00Z') };
const overlay = { id: 1, provenance: 'AUTO', achieved_date: new Date('2027-01-01T00:00:00Z') };
const classRow = (code: string) => ({ recognition_code: code, track: 'MANUAL' });

describe('GET /photographers/:username -- recognition vs Senior Status', () => {
  it('8. legacy Senior holder: seniorStatus set, recognition (class) null', async () => {
    script({ legacy: [legacySenior] });
    const { data } = await svc.getPhotographer('meetaathavale');
    expect(data.seniorStatus).toEqual({ label: 'Senior Member' });
    expect(data.recognition).toBeNull();
  });

  it('class lookup is class-codes-only and deterministic (never a Senior row, ordered by id desc)', async () => {
    script({ legacy: [legacySenior] });
    await svc.getPhotographer('meetaathavale');
    const op = fake.selects.find((s) => s.table === 'member_recognitions')!;
    const codes = op.wheres.find(([c, cmp]) => c === 'recognition_code' && cmp === 'in')![2] as string[];
    expect(codes).not.toContain('SENIOR_MEMBER');
    expect(codes).toContain('HONORARY_SENIOR_MEMBER');
    expect(op.orderBys).toEqual([['id', 'desc']]);
  });

  it('Senior Overlay + Honorary class: both returned independently', async () => {
    script({ overlays: [overlay], classRows: [classRow('HONORARY_MENTOR')] });
    const { data } = await svc.getPhotographer('meetaathavale');
    expect(data.seniorStatus).toEqual({ label: 'Senior Member' });
    expect(data.recognition).toEqual({ code: 'HONORARY_MENTOR', label: 'Honorary Mentor', track: 'MANUAL' });
  });

  it('5. Honorary Senior (class) only: recognition set, NOT Senior Status', async () => {
    script({ classRows: [classRow('HONORARY_SENIOR_MEMBER')] });
    const { data } = await svc.getPhotographer('meetaathavale');
    expect(data.recognition).toEqual({ code: 'HONORARY_SENIOR_MEMBER', label: 'Honorary Senior Member', track: 'MANUAL' });
    expect(data.seniorStatus).toBeNull();
  });

  it('neither: both null (existing field preserved, new field always present)', async () => {
    script({});
    const { data } = await svc.getPhotographer('meetaathavale');
    expect(data).toHaveProperty('seniorStatus', null);
    expect(data).toHaveProperty('recognition', null);
  });

  it('7. WP4 boundary rows alone give no Senior Status and expose no tenure / evidence fields', async () => {
    const wp4 = Array.from({ length: 5 }, (_, i) => ({
      id: 3 + i, user_id: 17, start_date: new Date(`${2016 + i}-01-01T00:00:00Z`), start_precision: 'YEAR', start_attestation: 'BOUNDARY',
      end_date: null, end_precision: null, end_attestation: null, evidence_kind: 'BOUNDARY', continuity_established: 0,
      verification_status: 'VERIFIED', correction_state: 'CURRENT',
    }));
    script({ ledger: wp4 });
    const { data } = await svc.getPhotographer('meetaathavale');
    expect(data.seniorStatus).toBeNull();
    const keys = JSON.stringify(data);
    expect(keys).not.toMatch(/tenure|yearsServed|continuity|GOVERNANCE_ATTESTATION|evidence/i);
    // pre-existing memberSince is the stored join_year (unchanged), never derived from the ledger
    expect(data.memberSince).toBe(2019);
    // the public profile never even reads the ledger
    expect(fake.selects.some((s) => s.table === 'recognized_service_periods')).toBe(false);
  });

  it('public Senior representation is the fact only (no provenance, dates, ids)', async () => {
    script({ overlays: [overlay] });
    const { data } = await svc.getPhotographer('meetaathavale');
    expect(Object.keys(data.seniorStatus!)).toEqual(['label']);
  });

  it('is read-only', async () => {
    script({ legacy: [legacySenior], classRows: [classRow('HONORARY_MEMBER')] });
    await svc.getPhotographer('meetaathavale');
    expect(fake.committed).toHaveLength(0);
  });
});

describe('11. Honorary directory filter excludes Senior Status', () => {
  it('SENIOR_MEMBER is not an Honorary code; Honorary Senior (a class) is', () => {
    expect(HONORARY_RECOGNITION_CODES).not.toContain('SENIOR_MEMBER');
    expect(HONORARY_RECOGNITION_CODES).toContain('HONORARY_SENIOR_MEMBER');
  });
});
