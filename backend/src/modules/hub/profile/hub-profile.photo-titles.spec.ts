// backend/src/modules/hub/profile/hub-profile.photo-titles.spec.ts
//
// P0 -- Photographic Distinctions round-trip integrity (D1 = a).
// Legacy user_photo_titles rows are READ-ONLY in the Hub: GET projects them
// untouched, and no Hub profile save may DELETE / INSERT / UPDATE that table.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { whereValue } from '../../../test-support/fake-db';
import type { R2Service } from '../../shared/storage/r2.service';
import type { UpdateDistinctionsDto } from './dto/update-distinctions.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { HubProfileService } from './hub-profile.service';

const fake = db as unknown as FakeDb;

interface Row { id: number; user_id: number; body_code: string; title_code: string; body_name: string | null; sort_order: number }

// Production-style user 27 fixture: 11 rows, gapped sort orders, multiple per
// body, and a joined OTHER/GPU string far beyond varchar(50).
const USER27: Row[] = [
  { id: 30, user_id: 27, body_code: 'FIAP', title_code: 'EFIAP', body_name: 'FIAP', sort_order: 10 },
  { id: 31, user_id: 27, body_code: 'GPU', title_code: 'GPU-CR3', body_name: 'Global Photographic Union', sort_order: 40 },
  { id: 32, user_id: 27, body_code: 'GPU', title_code: 'GPU VIP-3', body_name: 'Global Photographic Union', sort_order: 41 },
  { id: 33, user_id: 27, body_code: 'OTHER', title_code: 'FRPA', body_name: 'FRPA', sort_order: 50 },
  { id: 34, user_id: 27, body_code: 'OTHER', title_code: 'GNG', body_name: null, sort_order: 51 },
  { id: 35, user_id: 27, body_code: 'OTHER', title_code: 'Hon PESGSPC', body_name: 'PESGSPC', sort_order: 52 },
  { id: 36, user_id: 27, body_code: 'OTHER', title_code: 'GPA-PESGSPC', body_name: 'PESGSPC', sort_order: 53 },
  { id: 37, user_id: 27, body_code: 'OTHER', title_code: 'HonVNPC', body_name: 'VNPC', sort_order: 54 },
  { id: 38, user_id: 27, body_code: 'OTHER', title_code: 'Hon WPAI', body_name: 'WPAI', sort_order: 55 },
  { id: 39, user_id: 27, body_code: 'PSA', title_code: 'PPSA', body_name: 'PSA', sort_order: 30 },
  { id: 40, user_id: 27, body_code: 'FIP', title_code: 'AFIP', body_name: 'FIP', sort_order: 20 },
];
const USER16: Row[] = [
  { id: 20, user_id: 16, body_code: 'PSA', title_code: 'MPSA', body_name: 'PSA', sort_order: 30 },
];

let table: Row[];

function install(rows: Row[]) {
  table = rows.map((r) => ({ ...r }));
  fake.responder = (op: FakeOp) => {
    if (op.table === 'user_photo_titles') {
      if (op.kind === 'select') {
        const uid = whereValue(op, 'user_id');
        return table
          .filter((r) => r.user_id === uid)
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
          .map((r) => ({ ...r }));
      }
      return undefined;
    }
    if (op.kind === 'select') {
      if (op.table === 'users') return [{ id: 27, username: 'u', awards_html: '<p>a</p>', areas_of_expertise: [], favourite_subjects: [], photography_genres: [] }];
      if (['photos', 'event_registrations', 'user_awards'].includes(op.table)) return [{ count: 0 }];
      return [];
    }
    return undefined;
  };
}

const ptWrites = () => fake.committed.filter((o) => o.table === 'user_photo_titles');

async function fullSave(service: HubProfileService, userId: number, dist: Partial<UpdateDistinctionsDto> = {}) {
  // Mirrors the Hub page's saveAll(): profile + social + gear + distinctions.
  await service.updateProfile(userId, { city: 'Bhopal' } as UpdateProfileDto);
  await service.updateSocial(userId, { links: [] } as never);
  await service.updateGear(userId, { bodies: [], lenses: [], other: [] } as never);
  await service.updateDistinctions(userId, dist as UpdateDistinctionsDto);
}

describe('Hub legacy photo titles -- read-only round trip', () => {
  const service = new HubProfileService({} as R2Service);
  const project = (rows: Row[]) => rows.map((r) => ({
    id: r.id, bodyCode: r.body_code, titleCode: r.title_code, bodyName: r.body_name, sortOrder: r.sort_order,
  }));
  const expected27 = project([...USER27].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));

  beforeEach(() => { fake.reset(); install([...USER27, ...USER16]); });

  it('GET returns all five values per row, ordered sort_order ASC, id ASC, untransformed', async () => {
    const p = await service.getProfile(27);
    expect(p.photoTitleRows).toEqual(expected27);
    expect(p.photoTitleRows).toHaveLength(11);
    const sel = fake.selects.find((o) => o.table === 'user_photo_titles')!;
    expect(sel.orderBys).toEqual([['sort_order', 'asc'], ['id', 'asc']]);
  });

  it('keeps multiple GPU / OTHER rows, mixed bodies, gapped sort orders, ids, body_name, exact codes', async () => {
    const rows = (await service.getProfile(27)).photoTitleRows;
    expect(rows.filter((r) => r.bodyCode === 'GPU').map((r) => r.titleCode)).toEqual(['GPU-CR3', 'GPU VIP-3']);
    expect(rows.filter((r) => r.bodyCode === 'OTHER')).toHaveLength(6);
    expect(new Set(rows.map((r) => r.bodyCode))).toEqual(new Set(['FIAP', 'FIP', 'PSA', 'GPU', 'OTHER']));
    expect(rows.map((r) => r.sortOrder)).toEqual([10, 20, 30, 40, 41, 50, 51, 52, 53, 54, 55]);
    expect(rows.find((r) => r.id === 34)!.bodyName).toBeNull();
    expect(rows.find((r) => r.id === 35)).toMatchObject({ bodyName: 'PESGSPC', titleCode: 'Hon PESGSPC' });
  });

  it('GET -> full profile Save -> GET is identical; all 11 rows unchanged; no writes to the table', async () => {
    const before = (await service.getProfile(27)).photoTitleRows;
    await fullSave(service, 27, { awardsHtml: '<p>new</p>' });
    const after = (await service.getProfile(27)).photoTitleRows;
    expect(after).toEqual(before);
    expect(table.filter((r) => r.user_id === 27)).toEqual(USER27);
    expect(ptWrites()).toHaveLength(0);
  });

  it('no-op Save does not touch legacy rows', async () => {
    await service.updateDistinctions(27, {} as UpdateDistinctionsDto);
    expect(ptWrites()).toHaveLength(0);
    expect(table).toEqual([...USER27, ...USER16]);
  });

  it('awards-only save writes users.awards_html and nothing to user_photo_titles', async () => {
    await service.updateDistinctions(27, { awardsHtml: '<p>x</p>' });
    expect(ptWrites()).toHaveLength(0);
    const u = fake.writes('users', 'update');
    expect(u).toHaveLength(1);
    expect(u[0].set).toEqual({ awards_html: '<p>x</p>' });
  });

  it('empty legacy scalar fields do not cause deletion', async () => {
    await service.updateDistinctions(27, { fiap: '', fip: '', psa: '', other: '' });
    expect(ptWrites()).toHaveLength(0);
    expect(table.filter((r) => r.user_id === 27)).toHaveLength(11);
  });

  it('legacy scalar fields in the request cause no user_photo_titles write of any kind', async () => {
    await service.updateDistinctions(27, { fiap: 'AFIAP', fip: 'AFIP', psa: 'PPSA', other: 'GPU-CR3 GPU-VIP-3 FRPA' });
    expect(ptWrites()).toHaveLength(0);
    expect(table).toEqual([...USER27, ...USER16]);
  });

  it('a long legacy title collection cannot reproduce DELETE -> INSERT -> varchar overflow -> 500', async () => {
    const longOther = USER27.filter((r) => r.body_code === 'OTHER' || r.body_code === 'GPU').map((r) => r.title_code).join(' ');
    expect(longOther.length).toBeGreaterThan(50);
    fake.failWhen = (op) => (op.table === 'user_photo_titles' && op.kind === 'insert' ? new Error('Data too long for column title_code') : null);
    await expect(service.updateDistinctions(27, { other: longOther })).resolves.toMatchObject({ saved: true });
    expect(ptWrites()).toHaveLength(0);
    expect(table.filter((r) => r.user_id === 27)).toEqual(USER27);
  });

  it('another user rows are untouched, and each user only sees their own', async () => {
    await fullSave(service, 27, { other: 'X' });
    expect(table.filter((r) => r.user_id === 16)).toEqual(USER16);
    expect((await service.getProfile(27)).photoTitleRows.every((r) => USER27.some((u) => u.id === r.id))).toBe(true);
  });

  it('no user_photo_titles op of any kind is issued by any Hub profile save method', async () => {
    await fullSave(service, 27, { fiap: 'a', fip: 'b', psa: 'c', other: 'd', awardsHtml: 'e' });
    expect(fake.committed.some((o) => o.table === 'user_photo_titles')).toBe(false);
  });
});
