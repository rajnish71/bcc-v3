// Photographic Distinctions -- /users/me exposes per-permission ui hints so
// the Hub shows admin controls only where RBAC allows them. Authorization
// itself stays on the identity/distinctions/admin routes (see
// photographic-distinctions.http.spec.ts).

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('kysely', () => ({ sql: () => ({}) }));

import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import type { RbacService } from '../rbac/rbac.service';
import { UsersController } from './users.controller';

const fake = db as unknown as FakeDb;

function controllerWith(keys: string[]) {
  const rbac = { hasPermission: async (_id: number, key: string) => keys.includes(key) } as unknown as RbacService;
  return new UsersController(rbac);
}

describe('GET /users/me ui distinction flags', () => {
  beforeEach(() => {
    fake.reset();
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      if (op.table === 'users') return [{ id: 1, uuid: 'u', full_name: 'X', identity_status: 'IDENTITY_COMPLETE' }];
      return [];
    };
  });

  const actor = { sub: 1, uuid: 'u', status: 'ACTIVE', sid: 's' } as never;

  it('mirrors each permission independently (Super Admin set)', async () => {
    const res = await controllerWith([
      'identity.distinction.view', 'identity.distinction.remove', 'identity.distinction.catalogue.manage',
    ]).me(actor);
    expect(res.ui).toMatchObject({ distinctionView: true, distinctionRemove: true, distinctionCatalogueManage: true });
  });

  it('Coordinator set: view only', async () => {
    const res = await controllerWith(['identity.distinction.view']).me(actor);
    expect(res.ui).toMatchObject({ distinctionView: true, distinctionRemove: false, distinctionCatalogueManage: false });
  });

  it('ordinary member: all false', async () => {
    const res = await controllerWith([]).me(actor);
    expect(res.ui).toMatchObject({ distinctionView: false, distinctionRemove: false, distinctionCatalogueManage: false });
  });
});
