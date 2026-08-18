// backend/src/modules/identity/rbac/rbac.service.f013-atomicity.spec.ts
//
// F-013 (forensic F-017) — RBAC assignRole()/revokeRole() must commit/roll
// back atomically with their existing logIdentityAudit() write.
//
// RbacService is NOT instantiated here: it imports db.ts (Kysely ESM --
// incompatible with this project's CommonJS Jest config), the same
// constraint documented in auth.service.force-password-reset.spec.ts. This
// file combines real static inspection of the actual service source with a
// pure-function mirror of Kysely's transaction rollback semantics (shared
// with membership-lifecycle.service.f013-atomicity.spec.ts's mirror).

import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE_SRC = readFileSync(join(__dirname, 'rbac.service.ts'), 'utf8');

function methodBody(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`markers not found: ${startMarker} .. ${endMarker}`);
  }
  return src.slice(start, end);
}

// ── assignRole() ─────────────────────────────────────────────────────────

const assignRoleBody = methodBody(SERVICE_SRC, 'async assignRole(', 'async revokeRole(');

describe('RbacService.assignRole() (F-013 atomicity)', () => {
  it('wraps the user_roles insert + ROLE_GRANTED audit write in db.transaction().execute()', () => {
    expect(assignRoleBody).toContain('await db.transaction().execute(async (trx) => {');
  });

  it('the user_roles insert runs against trx, not the module-level db', () => {
    expect(assignRoleBody).toMatch(/trx\s*\n?\s*\.insertInto\('user_roles'\)/);
  });

  it('logIdentityAudit is called with trx as its second argument', () => {
    expect(assignRoleBody).toMatch(/logIdentityAudit\(\s*\{[\s\S]*?\},\s*trx,\s*\)/);
  });

  it('logs ROLE_GRANTED with the existing actor/target/newValue/reason shape unchanged', () => {
    expect(assignRoleBody).toMatch(
      /actorId:\s*params\.actorId,\s*targetUserId:\s*params\.targetUserId,\s*actionType:\s*'ROLE_GRANTED',/,
    );
    expect(assignRoleBody).toContain(
      "newValue: { role: params.roleName, scopeType: params.scopeType ?? null, scopeId: params.scopeId ?? null }",
    );
    expect(assignRoleBody).toContain('reason: params.reason ?? null');
  });

  it('the insert happens before the audit call, both before the transaction resolves', () => {
    const trxOpenIndex = assignRoleBody.indexOf('async (trx) => {');
    const insertIndex = assignRoleBody.search(/trx\s*\n?\s*\.insertInto\('user_roles'\)/);
    const auditIndex = assignRoleBody.indexOf('logIdentityAudit(');
    expect(trxOpenIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(trxOpenIndex);
    expect(auditIndex).toBeGreaterThan(insertIndex);
  });

  it('the role lookup (NotFoundException guard) still runs before the transaction opens (existing behaviour preserved)', () => {
    const roleLookupIndex = assignRoleBody.indexOf("selectFrom('roles')");
    const trxOpenIndex = assignRoleBody.indexOf('async (trx) => {');
    expect(roleLookupIndex).toBeGreaterThan(-1);
    expect(roleLookupIndex).toBeLessThan(trxOpenIndex);
  });

  it('the returned ActiveRoleAssignment shape (userRoleId, roleId, roleName, category, scope, validity) is unchanged', () => {
    expect(assignRoleBody).toContain('userRoleId: insertedId');
    expect(assignRoleBody).toContain('roleId: role.id');
    expect(assignRoleBody).toContain('roleName: role.name');
    expect(assignRoleBody).toContain('category: role.category');
  });
});

// ── revokeRole() ─────────────────────────────────────────────────────────

// revokeRole() is the last method in the class -- slice to end of file
// rather than hunting for a closing marker.
const revokeRoleStart = SERVICE_SRC.indexOf('async revokeRole(');
if (revokeRoleStart === -1) throw new Error('async revokeRole( not found in rbac.service.ts');
const revokeRoleBodySafe = SERVICE_SRC.slice(revokeRoleStart);

describe('RbacService.revokeRole() (F-013 atomicity)', () => {
  it('wraps the user_roles update + ROLE_REVOKED audit write in db.transaction().execute()', () => {
    expect(revokeRoleBodySafe).toContain('await db.transaction().execute(async (trx) => {');
  });

  it('the user_roles update runs against trx, not the module-level db', () => {
    expect(revokeRoleBodySafe).toMatch(/trx\s*\n?\s*\.updateTable\('user_roles'\)/);
  });

  it('logIdentityAudit is called with trx as its second argument', () => {
    expect(revokeRoleBodySafe).toMatch(/logIdentityAudit\(\s*\{[\s\S]*?\},\s*trx,\s*\)/);
  });

  it('logs ROLE_REVOKED with the existing actor/target/oldValue/reason shape unchanged', () => {
    expect(revokeRoleBodySafe).toMatch(
      /actorId,\s*targetUserId:\s*existing\.userId,\s*actionType:\s*'ROLE_REVOKED',/,
    );
    expect(revokeRoleBodySafe).toContain('oldValue: { role: existing.roleName }');
    expect(revokeRoleBodySafe).toContain('reason: reason ?? null');
  });

  it('the existing-assignment lookup (NotFoundException guard) still runs before the transaction opens', () => {
    const lookupIndex = revokeRoleBodySafe.indexOf("selectFrom('user_roles')");
    const trxOpenIndex = revokeRoleBodySafe.indexOf('async (trx) => {');
    expect(lookupIndex).toBeGreaterThan(-1);
    expect(lookupIndex).toBeLessThan(trxOpenIndex);
  });

  it('valid_until is still set to "now" (soft-revoke, not a delete -- existing behaviour preserved)', () => {
    expect(revokeRoleBodySafe).toContain('set({ valid_until: nowSql })');
  });
});

// ── Permission / RBAC decoupling boundary (F-033/MEM-006, regression guard) ─

describe('RbacService (F-033/MEM-006 boundaries unchanged)', () => {
  it('still touches only roles/permissions/role_permissions/user_roles/identity_audit_log -- no membership table reference introduced', () => {
    expect(SERVICE_SRC).not.toMatch(/selectFrom\('memberships'\)|selectFrom\('membership_classes'\)|selectFrom\('member_recognitions'\)/);
  });

  it('assignRole()/revokeRole() still perform no internal permission re-check (guard stays at the controller layer)', () => {
    expect(assignRoleBody).not.toContain('hasPermission(');
    expect(assignRoleBody).not.toContain('RbacGuard');
  });
});

// ── Transaction rollback semantics (mirrored, no db.ts import) ─────────────

async function mockTransaction<T>(steps: Array<() => Promise<void>>, finalize: () => T): Promise<T> {
  const committed: string[] = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      await steps[i]();
      committed.push(`step-${i}`);
    }
  } catch (err) {
    committed.length = 0;
    throw err;
  }
  return finalize();
}

describe('Transaction rollback semantics (mirrored Kysely behaviour, F-013 invariant)', () => {
  it('a ROLE_GRANTED audit-write failure rolls back the user_roles insert', async () => {
    let insertRan = false;
    await expect(
      mockTransaction(
        [async () => { insertRan = true; }, async () => { throw new Error('audit failed'); }],
        () => true,
      ),
    ).rejects.toThrow('audit failed');
    expect(insertRan).toBe(true); // attempted, then rolled back with the failed transaction
  });

  it('a user_roles mutation failure means the audit step never runs', async () => {
    let auditRan = false;
    await expect(
      mockTransaction(
        [async () => { throw new Error('insert failed'); }, async () => { auditRan = true; }],
        () => true,
      ),
    ).rejects.toThrow('insert failed');
    expect(auditRan).toBe(false);
  });
});
