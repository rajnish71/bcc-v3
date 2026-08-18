// backend/src/modules/identity/shared/identity-audit.util.spec.ts
//
// F-018 — logIdentityAudit() runtime execution coverage.
//
// identity-audit.util.ts imports db.ts, which eagerly calls mysql2's
// createPool() at module load -- the same reason RBAC/lifecycle service
// files can't be imported directly in this project's Jest config. Unlike
// those services, logIdentityAudit() takes its Kysely executor as a plain
// parameter, so mocking the db.ts import (jest.mock, already used
// elsewhere in this repo for external deps -- see
// razorpay-settlement.provider.spec.ts) is enough to import and actually
// RUN the real function against a fake executor. No real DB, no new test
// infrastructure.
//
// What this proves: the real logIdentityAudit() body constructs the
// insertInto/values/execute call correctly, maps actor/target/payload
// fields (including undefined -> null defaulting), uses the passed
// executor when given one and the module-level db otherwise, and lets an
// insert failure propagate uncaught.
//
// What this does NOT prove: that identity_audit_log's actual MySQL schema
// accepts these values, or any real transaction/rollback behaviour --
// that would require real DB integration testing, which is out of scope
// for this change.

jest.mock('../../../database/db', () => ({ db: { __isMockModuleLevelDb: true } }));

import { logIdentityAudit, type IdentityAuditEntry } from './identity-audit.util';

function createMockExecutor() {
  const execute = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ execute });
  const insertInto = jest.fn().mockReturnValue({ values });
  return { insertInto, values, execute };
}

describe('logIdentityAudit() (F-018 runtime execution coverage)', () => {
  it('inserts into identity_audit_log via the passed executor', async () => {
    const trx = createMockExecutor();
    const entry: IdentityAuditEntry = {
      actorId: 5,
      targetUserId: 10,
      actionType: 'ROLE_GRANTED',
    };

    await logIdentityAudit(entry, trx as any);

    expect(trx.insertInto).toHaveBeenCalledWith('identity_audit_log');
    expect(trx.execute).toHaveBeenCalledTimes(1);
  });

  it('maps actor/target/action and JSON-serializes old/new values exactly', async () => {
    const trx = createMockExecutor();
    const entry: IdentityAuditEntry = {
      actorId: 5,
      targetUserId: 10,
      actionType: 'ROLE_GRANTED',
      oldValue: { role: 'MEMBER' },
      newValue: { role: 'ADMIN' },
      reason: 'promotion',
    };

    await logIdentityAudit(entry, trx as any);

    expect(trx.values).toHaveBeenCalledWith({
      actor_id: 5,
      target_user_id: 10,
      action_type: 'ROLE_GRANTED',
      old_value: JSON.stringify({ role: 'MEMBER' }),
      new_value: JSON.stringify({ role: 'ADMIN' }),
      reason: 'promotion',
    });
  });

  it('defaults omitted optional fields (oldValue/newValue/reason) to null, actorId null is preserved as-is', async () => {
    const trx = createMockExecutor();
    const entry: IdentityAuditEntry = {
      actorId: null,
      targetUserId: 42,
      actionType: 'PASSWORD_RESET',
    };

    await logIdentityAudit(entry, trx as any);

    expect(trx.values).toHaveBeenCalledWith({
      actor_id: null,
      target_user_id: 42,
      action_type: 'PASSWORD_RESET',
      old_value: null,
      new_value: null,
      reason: null,
    });
  });

  it('uses the module-level db as the executor when none is passed', async () => {
    const { db } = jest.requireMock('../../../database/db') as {
      db: { insertInto: jest.Mock };
    };
    const mockDb = createMockExecutor();
    Object.assign(db, mockDb);

    await logIdentityAudit({
      actorId: 1,
      targetUserId: 2,
      actionType: 'PASSWORD_CHANGED',
    });

    expect(db.insertInto).toHaveBeenCalledWith('identity_audit_log');
  });

  it('propagates an insert failure uncaught (no silent swallow)', async () => {
    const trx = createMockExecutor();
    trx.execute.mockRejectedValue(new Error('insert failed'));

    await expect(
      logIdentityAudit(
        { actorId: 1, targetUserId: 2, actionType: 'EMAIL_CHANGED' },
        trx as any,
      ),
    ).rejects.toThrow('insert failed');
  });
});
