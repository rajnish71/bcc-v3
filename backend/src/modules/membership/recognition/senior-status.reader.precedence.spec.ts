// WP6-A -- SeniorStatusReader dual-state precedence.
//
// Invariant: if ANY Senior Status Overlay exists for a user, that overlay is
// authoritative regardless of its status. The frozen legacy SENIOR_MEMBER row
// (which 0123 makes impossible to deactivate) is consulted ONLY when no
// overlay exists, so it can never resurrect a governance-REMOVED Senior.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { SeniorStatusReader } from './senior-status.reader';

const fake = db as unknown as FakeDb;
type Row = Record<string, any>;
const base = (t: string) => t.split(' as ')[0];
const last = (c: unknown) => String(c).split('.').pop()!;

function install(w: { overlays: Row[]; recognitions: Row[] }) {
  fake.responder = (op: FakeOp) => {
    if (op.kind !== 'select') return undefined;
    const rows = base(op.table) === 'senior_status_overlays' ? w.overlays : base(op.table) === 'member_recognitions' ? w.recognitions : [];
    return rows
      .filter((r) =>
        op.wheres.every(([col, cmp, val]) => {
          const v = r[last(col)];
          if (cmp === '=') return v === val;
          return true;
        }),
      )
      .map((r) => ({ ...r }));
  };
}

const legacy = (over: Row = {}): Row => ({
  id: 8, membership_id: 12, user_id: 17, owner_type: 'INDIVIDUAL', recognition_code: 'SENIOR_MEMBER', track: 'MANUAL',
  status: 'ACTIVE', start_date: new Date('2026-09-29T00:00:00Z'), membership_number: 'BCC20191100022', full_name: 'Meeta Athavale', username: 'meetaathavale', ...over,
});
const overlay = (over: Row = {}): Row => ({
  id: 1, user_id: 17, status: 'ACTIVE', provenance: 'MANUAL', achieved_date: null, full_name: 'Meeta Athavale', username: 'meetaathavale', ...over,
});

beforeEach(() => fake.reset());
const reader = () => new SeniorStatusReader();

describe('forUser -- overlay is authoritative once it exists', () => {
  it('A. no overlay + legacy ACTIVE MANUAL SENIOR_MEMBER -> Senior from legacy', async () => {
    install({ overlays: [], recognitions: [legacy()] });
    expect((await reader().forUser(17)).senior).toMatchObject({ source: 'LEGACY_MANUAL_RECOGNITION', provenance: 'MANUAL', recognitionId: 8 });
  });

  it('B. ACTIVE overlay + legacy ACTIVE -> Senior from the overlay', async () => {
    install({ overlays: [overlay()], recognitions: [legacy()] });
    expect((await reader().forUser(17)).senior).toMatchObject({ source: 'OVERLAY', provenance: 'MANUAL', overlayId: 1 });
  });

  it('C. REMOVED overlay + legacy ACTIVE -> NO Senior; the legacy row does not resurrect it', async () => {
    install({ overlays: [overlay({ status: 'REMOVED' })], recognitions: [legacy()] });
    expect((await reader().forUser(17)).senior).toEqual({ source: 'NONE' });
  });

  it('D. an overlay in any non-ACTIVE status never falls back to legacy', async () => {
    for (const status of ['REMOVED', 'SUSPENDED', 'PENDING', 'anything-else']) {
      install({ overlays: [overlay({ status })], recognitions: [legacy()] });
      expect((await reader().forUser(17)).senior).toEqual({ source: 'NONE' });
    }
  });

  it('E. the overlay stays authoritative even though the frozen legacy row is, and stays, ACTIVE', async () => {
    const frozen = legacy({ status: 'ACTIVE' });
    install({ overlays: [overlay({ status: 'REMOVED' })], recognitions: [frozen] });
    expect((await reader().forUser(17)).senior.source).toBe('NONE');
    // restoring (rescission) the same overlay record makes it ACTIVE again -- still from the overlay
    install({ overlays: [overlay({ status: 'ACTIVE' })], recognitions: [frozen] });
    expect((await reader().forUser(17)).senior.source).toBe('OVERLAY');
  });

  it('the legacy lookup is not even queried once an overlay exists', async () => {
    install({ overlays: [overlay({ status: 'REMOVED' })], recognitions: [legacy()] });
    await reader().forUser(17);
    expect(fake.selects.some((s) => base(s.table) === 'member_recognitions')).toBe(false);
  });

  it('an overlay for another user does not suppress this user\'s legacy fallback', async () => {
    install({ overlays: [overlay({ user_id: 99, status: 'REMOVED' })], recognitions: [legacy()] });
    expect((await reader().forUser(17)).senior.source).toBe('LEGACY_MANUAL_RECOGNITION');
  });

  it('forMembership follows the same precedence', async () => {
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      if (base(op.table) === 'memberships') return [{ user_id: 17 }];
      if (base(op.table) === 'senior_status_overlays') return [overlay({ status: 'REMOVED' })];
      if (base(op.table) === 'member_recognitions') return [legacy()];
      return [];
    };
    expect((await reader().forMembership(12))!.senior).toEqual({ source: 'NONE' });
  });
});

describe('listActive -- same precedence', () => {
  it('lists the legacy holder when no overlay exists', async () => {
    install({ overlays: [], recognitions: [legacy()] });
    expect((await reader().listActive()).map((r) => [r.userId, r.senior.source])).toEqual([[17, 'LEGACY_MANUAL_RECOGNITION']]);
  });

  it('ACTIVE overlay: listed once, from the overlay', async () => {
    install({ overlays: [overlay()], recognitions: [legacy()] });
    expect((await reader().listActive()).map((r) => [r.userId, r.senior.source])).toEqual([[17, 'OVERLAY']]);
  });

  it('REMOVED overlay: the user is not listed at all (legacy row does not resurrect)', async () => {
    install({ overlays: [overlay({ status: 'REMOVED' })], recognitions: [legacy()] });
    expect(await reader().listActive()).toEqual([]);
  });

  it('mixed population: removed user excluded, active-overlay user listed, no-overlay legacy user listed', async () => {
    install({
      overlays: [overlay({ id: 1, user_id: 17, status: 'REMOVED' }), overlay({ id: 2, user_id: 18, status: 'ACTIVE' })],
      recognitions: [legacy({ id: 8, user_id: 17 }), legacy({ id: 9, user_id: 18, membership_id: 13 }), legacy({ id: 10, user_id: 19, membership_id: 14 })],
    });
    expect((await reader().listActive()).map((r) => [r.userId, r.senior.source])).toEqual([[18, 'OVERLAY'], [19, 'LEGACY_MANUAL_RECOGNITION']]);
  });

  it('reads only (no write, no transaction)', async () => {
    install({ overlays: [overlay({ status: 'REMOVED' })], recognitions: [legacy()] });
    await reader().listActive();
    await reader().forUser(17);
    expect(fake.committed).toHaveLength(0);
  });
});
