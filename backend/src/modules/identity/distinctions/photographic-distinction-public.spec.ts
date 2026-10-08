// Phase 2B -- getPublicDistinctions(): public read of structured, self-declared
// Photographic Distinctions (DECLARED + active distinction + active
// institution), ordered by institution.sort_order then distinction.sort_order,
// four public fields only, one set-based query.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { getPublicDistinctions } from './photographic-distinction-public';

const fake = db as unknown as FakeDb;
const TABLE = 'user_photographic_distinctions as upd';

const FIP = { institution_code: 'FIP', institution_name: 'Federation of Indian Photography', institution_sort: 10 };
const FIAP = { institution_code: 'FIAP', institution_name: "Fédération Internationale de l'Art Photographique", institution_sort: 20 };
const PSA = { institution_code: 'PSA', institution_name: 'Photographic Society of America', institution_sort: 30 };
const GPU = { institution_code: 'GPU', institution_name: 'Global Photographic Union', institution_sort: 50 };

const row = (user_id: number, inst: typeof FIP, code: string, name: string, distinction_sort: number, over: Record<string, unknown> = {}) => ({
  user_id, state: 'DECLARED', distinction_is_active: 1, institution_is_active: 1,
  ...inst, code, name, distinction_sort, ...over,
});

let rows: Array<Record<string, unknown>> = [];
beforeEach(() => {
  fake.reset();
  rows = [];
  fake.responder = (op: FakeOp) => (op.kind === 'select' && op.table === TABLE ? rows : undefined);
});

describe('getPublicDistinctions()', () => {
  it('a DECLARED entry on an active catalogue row appears with exactly the four public fields', async () => {
    rows = [row(10, FIP, 'AFIP', 'AFIP', 10)];
    const out = (await getPublicDistinctions([10])).get(10)!;
    expect(out).toEqual([{ institutionCode: 'FIP', institutionName: 'Federation of Indian Photography', code: 'AFIP', name: 'AFIP' }]);
    expect(Object.keys(out[0]).sort()).toEqual(['code', 'institutionCode', 'institutionName', 'name']);
  });

  it('the query itself filters DECLARED + active distinction + active institution', async () => {
    rows = [];
    await getPublicDistinctions([10]);
    const op = fake.selects.find((s) => s.table === TABLE)!;
    expect(op.wheres).toEqual(expect.arrayContaining([
      ['upd.state', '=', 'DECLARED'],
      ['d.is_active', '=', true],
      ['i.is_active', '=', true],
      ['upd.user_id', 'in', [10]],
    ]));
  });

  it.each([
    ['inactive distinction', { distinction_is_active: 0 }],
    ['inactive institution', { institution_is_active: 0 }],
    ['WITHDRAWN', { state: 'WITHDRAWN' }],
    ['REMOVED', { state: 'REMOVED' }],
  ])('%s is excluded', async (_label, over) => {
    rows = [row(10, FIP, 'AFIP', 'AFIP', 10, over), row(10, PSA, 'PPSA', 'PPSA', 10)];
    expect((await getPublicDistinctions([10])).get(10)!.map((d) => d.code)).toEqual(['PPSA']);
  });

  it('badge eligibility does not affect display (it is not selected or used)', async () => {
    rows = [row(10, GPU, 'CROWN3', 'GPU Crown 3', 10, { badge_eligible: 0 })];
    expect((await getPublicDistinctions([10])).get(10)!.map((d) => d.code)).toEqual(['CROWN3']);
  });

  it('a member with none gets [] (never undefined)', async () => {
    rows = [row(11, FIP, 'AFIP', 'AFIP', 10)];
    const map = await getPublicDistinctions([10, 11]);
    expect(map.get(10)).toEqual([]);
    expect(map.get(11)!.length).toBe(1);
  });

  it('orders by institution.sort_order, then distinction.sort_order (H2), regardless of row order', async () => {
    rows = [
      row(10, GPU, 'VIP3', 'GPU VIP 3', 20),
      row(10, PSA, 'PPSA', 'PPSA', 10),
      row(10, FIP, 'EFIP', 'EFIP', 20),
      row(10, GPU, 'CROWN3', 'GPU Crown 3', 10),
      row(10, FIAP, 'AFIAP', 'AFIAP', 10),
      row(10, FIP, 'AFIP', 'AFIP', 10),
    ];
    expect((await getPublicDistinctions([10])).get(10)!.map((d) => d.code))
      .toEqual(['AFIP', 'EFIP', 'AFIAP', 'PPSA', 'CROWN3', 'VIP3']);
    const op = fake.selects.find((s) => s.table === TABLE)!;
    expect(op.orderBys!.map(([c]) => c)).toEqual(['i.sort_order', 'i.code', 'd.sort_order', 'd.code']);
  });

  it('uses the catalogue code as the post-nominal exactly as stored (H3)', async () => {
    rows = [row(10, GPU, 'CROWN3', 'GPU Crown 3', 10)];
    expect((await getPublicDistinctions([10])).get(10)![0]).toMatchObject({ code: 'CROWN3', name: 'GPU Crown 3' });
  });

  it('is set-based: many users -> ONE query', async () => {
    rows = [row(1, FIP, 'AFIP', 'AFIP', 10), row(2, PSA, 'PPSA', 'PPSA', 10), row(3, FIAP, 'AFIAP', 'AFIAP', 10)];
    const map = await getPublicDistinctions([1, 2, 3, 4, 2]);
    expect(fake.selects.filter((s) => s.table === TABLE)).toHaveLength(1);
    expect([...map.keys()]).toEqual([1, 2, 3, 4]);
  });

  it('does not query for an empty or invalid id list, and never writes', async () => {
    expect((await getPublicDistinctions([])).size).toBe(0);
    expect((await getPublicDistinctions([0, -3, NaN])).size).toBe(0);
    expect(fake.selects).toHaveLength(0);
    expect(fake.committed).toHaveLength(0);
  });
});
