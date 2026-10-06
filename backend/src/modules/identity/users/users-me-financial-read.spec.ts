// Track 4 -- /users/me exposes ui.financialRead as a navigation hint, derived
// from the live RBAC permission set (financial.read). Authorization itself
// stays on the financial admin routes (see financial-admin.http.spec.ts).

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

describe('GET /users/me ui.financialRead', () => {
  beforeEach(() => {
    fake.reset();
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      if (op.table === 'users') return [{ id: 1, uuid: 'u', full_name: 'X', identity_status: 'IDENTITY_COMPLETE' }];
      return [];
    };
  });

  const actor = { sub: 1, uuid: 'u', status: 'ACTIVE', sid: 's' } as never;

  it('is true when the user holds financial.read', async () => {
    const res = await controllerWith(['financial.read']).me(actor);
    expect(res.ui.financialRead).toBe(true);
  });

  it('is false for a user with no financial permissions (Coordinator, volunteer, member)', async () => {
    const res = await controllerWith(['membership.record.view', 'event.volunteer.manage']).me(actor);
    expect(res.ui.financialRead).toBe(false);
  });

  it('is false for verify/audit holders without financial.read', async () => {
    const res = await controllerWith(['financial.settlement.verify', 'financial.audit.view']).me(actor);
    expect(res.ui.financialRead).toBe(false);
  });
});
