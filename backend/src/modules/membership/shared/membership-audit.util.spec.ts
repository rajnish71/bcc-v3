// backend/src/modules/membership/shared/membership-audit.util.spec.ts
//
// F-018 — logMembershipAudit() runtime execution coverage.
//
// Mirrors identity-audit.util.spec.ts's approach: membership-audit.util.ts
// imports db.ts, which eagerly calls mysql2's createPool() at module load,
// so db.ts is mocked (jest.mock, an existing repo pattern -- see
// razorpay-settlement.provider.spec.ts) purely to make the import safe.
// logMembershipAudit() itself then runs for real against a fake executor.
//
// What this proves: the real logMembershipAudit() body constructs the
// insertInto/values/execute call correctly, maps membership/actor/payload
// fields (including undefined -> null defaulting), uses the passed
// executor when given one and the module-level db otherwise (this is the
// F-013 executor-parameter change), and lets an insert failure propagate
// uncaught.
//
// What this does NOT prove: that membership_audit_log's actual MySQL
// schema accepts these values, or any real transaction/rollback behaviour
// -- that would require real DB integration testing, out of scope here.
// It also does not re-verify F-013's atomicity claim (that the mutation
// and this insert share one trx) -- that remains covered by
// membership-lifecycle.service.f013-atomicity.spec.ts, untouched by this
// change.

jest.mock('../../../database/db', () => ({ db: { __isMockModuleLevelDb: true } }));

import { logMembershipAudit, type MembershipAuditEntry } from './membership-audit.util';

function createMockExecutor() {
  const execute = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ execute });
  const insertInto = jest.fn().mockReturnValue({ values });
  return { insertInto, values, execute };
}

describe('logMembershipAudit() (F-018 runtime execution coverage)', () => {
  it('inserts into membership_audit_log via the passed executor', async () => {
    const trx = createMockExecutor();
    const entry: MembershipAuditEntry = {
      membershipId: 84,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
    };

    await logMembershipAudit(entry, trx as any);

    expect(trx.insertInto).toHaveBeenCalledWith('membership_audit_log');
    expect(trx.execute).toHaveBeenCalledTimes(1);
  });

  it('maps membership/actor/event and JSON-serializes old/new values exactly', async () => {
    const trx = createMockExecutor();
    const entry: MembershipAuditEntry = {
      membershipId: 84,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'ADMIN',
      actorUserId: 7,
      oldValue: { state: 'APPROVED' },
      newValue: { state: 'ACTIVE' },
      notes: 'activation',
    };

    await logMembershipAudit(entry, trx as any);

    expect(trx.values).toHaveBeenCalledWith({
      membership_id: 84,
      event_type: 'LIFECYCLE_TRANSITION',
      actor_type: 'ADMIN',
      actor_user_id: 7,
      old_value: JSON.stringify({ state: 'APPROVED' }),
      new_value: JSON.stringify({ state: 'ACTIVE' }),
      notes: 'activation',
    });
  });

  it('defaults omitted optional fields (actorUserId/oldValue/newValue/notes) to null, membershipId null is preserved as-is', async () => {
    const trx = createMockExecutor();
    const entry: MembershipAuditEntry = {
      membershipId: null,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'SYSTEM',
    };

    await logMembershipAudit(entry, trx as any);

    expect(trx.values).toHaveBeenCalledWith({
      membership_id: null,
      event_type: 'LIFECYCLE_TRANSITION',
      actor_type: 'SYSTEM',
      actor_user_id: null,
      old_value: null,
      new_value: null,
      notes: null,
    });
  });

  it('uses the module-level db as the executor when none is passed (F-013 default-parameter behaviour, executed for real)', async () => {
    const { db } = jest.requireMock('../../../database/db') as {
      db: { insertInto: jest.Mock };
    };
    const mockDb = createMockExecutor();
    Object.assign(db, mockDb);

    await logMembershipAudit({
      membershipId: 1,
      eventType: 'LIFECYCLE_TRANSITION',
      actorType: 'MEMBER',
    });

    expect(db.insertInto).toHaveBeenCalledWith('membership_audit_log');
  });

  it('propagates an insert failure uncaught (no silent swallow)', async () => {
    const trx = createMockExecutor();
    trx.execute.mockRejectedValue(new Error('insert failed'));

    await expect(
      logMembershipAudit(
        { membershipId: 1, eventType: 'LIFECYCLE_TRANSITION', actorType: 'SYSTEM' },
        trx as any,
      ),
    ).rejects.toThrow('insert failed');
  });
});
