// backend/src/modules/membership/membership.controller.spec.ts
//
// F-033 remediation — admin password-reset authorization boundary.
//
// MembershipController is NOT instantiated here: it imports
// MembershipLifecycleService / ApplicationWorkflowService, both of which
// transitively import db.ts (Kysely ESM — incompatible with this project's
// CommonJS Jest config, the same constraint documented in every other
// *.spec.ts in this project, e.g. financial.controller.spec.ts). Tests
// instead combine:
//   (a) REAL static inspection of the actual controller source (not a
//       mirror) proving the route's guard/permission decorator, and
//   (b) a pure function mirroring RbacGuard's permission-check decision,
//       exercised against the exact role/permission grants seed_0013
//       defines — matching the project's established pattern.
//
// No real password values are used or stored anywhere in this file.

import { readFileSync } from 'fs';
import { join } from 'path';

const CONTROLLER_SRC = readFileSync(join(__dirname, 'membership.controller.ts'), 'utf8');

// ── A. Guard placement (real source inspection) ────────────────────────────

describe('MembershipController admin password-reset guard (F-033, real source inspection)', () => {
  const decorators = CONTROLLER_SRC.slice(
    CONTROLLER_SRC.indexOf("@Post('admin/users/:userId/reset-password')"),
    CONTROLLER_SRC.indexOf('async adminResetPassword'),
  );

  it('route exists at admin/users/:userId/reset-password', () => {
    expect(CONTROLLER_SRC).toContain("@Post('admin/users/:userId/reset-password')");
  });

  it('is guarded by AccessTokenGuard and RbacGuard', () => {
    expect(decorators).toContain('AccessTokenGuard');
    expect(decorators).toContain('RbacGuard');
  });

  it('requires identity.user.reset_password, not membership.application.approve', () => {
    expect(decorators).toContain("RequirePermissions('identity.user.reset_password')");
    expect(decorators).not.toContain('membership.application.approve');
  });

  it('membership.application.approve does not appear anywhere else in this controller\'s source as a guard for this route', () => {
    // Sanity check against a partial revert: the string may legitimately
    // appear elsewhere in the file (e.g. approve/reject application routes)
    // but never inside this route's own decorator block.
    expect(decorators.includes('membership.application.approve')).toBe(false);
  });
});

// ── B. RBAC permission-grant boundary (mirrors seed_0013 + RbacGuard) ──────
//
// RbacGuard (rbac.guard.ts) denies unless the actor's active permission set
// contains every key in @RequirePermissions(...). seed_0013 grants
// identity.user.reset_password to exactly Super Admin and Platform Admin.
// This mirrors that decision without touching the database.

const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Super Admin': ['identity.user.reset_password', 'membership.application.approve'],
  'Platform Admin': ['identity.user.reset_password', 'membership.application.approve'],
  'Coordinator': ['membership.application.approve'],
  'Membership Manager': ['membership.application.approve'],
  'Registered User': [],
};

const REQUIRED_PERMISSION = 'identity.user.reset_password';

function canResetPassword(roleName: string): boolean {
  const heldKeys = new Set(ROLE_PERMISSIONS[roleName] ?? []);
  return heldKeys.has(REQUIRED_PERMISSION);
}

describe('Admin password-reset authorization boundary (F-033, mirrored)', () => {
  it('Super Admin is allowed', () => {
    expect(canResetPassword('Super Admin')).toBe(true);
  });

  it('Platform Admin is allowed', () => {
    expect(canResetPassword('Platform Admin')).toBe(true);
  });

  it('Coordinator is denied (holds only membership.application.approve, the old mis-scoped permission)', () => {
    expect(canResetPassword('Coordinator')).toBe(false);
  });

  it('Membership Manager is denied (holds only membership.application.approve, the old mis-scoped permission)', () => {
    expect(canResetPassword('Membership Manager')).toBe(false);
  });

  it('an actor holding no relevant permission is denied', () => {
    expect(canResetPassword('Registered User')).toBe(false);
  });

  it('holding membership.application.approve alone is never sufficient after the fix', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      const holdsOnlyOldPermission =
        perms.includes('membership.application.approve') && !perms.includes(REQUIRED_PERMISSION);
      if (holdsOnlyOldPermission) {
        expect(canResetPassword(role)).toBe(false);
      }
    }
  });
});

// ── C. adminResetPassword() writes identity_audit_log (F-011, real source inspection) ──
//
// Path 5 of F-011: the admin-facing password reset was the only one of the
// five identity write paths with no @CurrentUser() actor capture at all --
// every sibling route in this controller already injects it. This block
// asserts the actor param was added, the mutation now runs inside a
// db.transaction() alongside the audit write, and none of that touched the
// F-033 guard/permission decorators verified in block A above.

const adminResetPasswordBodyStart = CONTROLLER_SRC.indexOf('async adminResetPassword(');
const adminResetPasswordBody = CONTROLLER_SRC.slice(
  adminResetPasswordBodyStart,
  CONTROLLER_SRC.indexOf('return { ok: true };', adminResetPasswordBodyStart),
);

describe('MembershipController.adminResetPassword() writes identity_audit_log (F-011, real source inspection)', () => {
  it('imports logIdentityAudit from the shared identity audit util', () => {
    expect(CONTROLLER_SRC).toContain(
      "import { logIdentityAudit } from '../identity/shared/identity-audit.util';",
    );
  });

  it('captures the calling admin via @CurrentUser()', () => {
    expect(adminResetPasswordBody).toContain('@CurrentUser() actor: AccessTokenPayload');
  });

  it('wraps the password update and audit write in a single db.transaction()', () => {
    expect(adminResetPasswordBody).toContain('await db.transaction().execute(async (trx) => {');
  });

  it('the users update and the audit write both run against trx (not the module-level db)', () => {
    expect(adminResetPasswordBody).toMatch(/trx\s*\.updateTable\('users'\)/);
    expect(adminResetPasswordBody).toMatch(
      /logIdentityAudit\(\s*\{[^}]*\},\s*trx,\s*\)/,
    );
  });

  it('logs an ADMIN_PASSWORD_RESET audit entry with the calling admin as actor and the target user as target', () => {
    expect(adminResetPasswordBody).toMatch(
      /logIdentityAudit\(\s*\{\s*actorId:\s*actor\.sub,\s*targetUserId:\s*userId,\s*actionType:\s*'ADMIN_PASSWORD_RESET',\s*\},\s*trx,\s*\)/,
    );
  });

  it('the audit write happens after the password update', () => {
    const usersUpdateIndex = adminResetPasswordBody.search(/trx\s*\.updateTable\('users'\)/);
    const auditIndex = adminResetPasswordBody.indexOf('logIdentityAudit(');
    expect(usersUpdateIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(usersUpdateIndex);
  });

  it('still sets force_password_reset: true (existing admin-reset behaviour preserved)', () => {
    expect(adminResetPasswordBody).toMatch(
      /\.set\(\{\s*password_hash:\s*hash,\s*force_password_reset:\s*true\s*\}\)/,
    );
  });

  it('still validates newPassword length before hashing (existing behaviour preserved)', () => {
    expect(adminResetPasswordBody).toContain('newPassword must be at least 8 characters');
    expect(adminResetPasswordBody).toContain('argon2.hash(body.newPassword)');
  });

  it('did not alter the F-033 guard/permission decorators (still identity.user.reset_password only)', () => {
    const decorators = CONTROLLER_SRC.slice(
      CONTROLLER_SRC.indexOf("@Post('admin/users/:userId/reset-password')"),
      CONTROLLER_SRC.indexOf('async adminResetPassword'),
    );
    expect(decorators).toContain('AccessTokenGuard');
    expect(decorators).toContain('RbacGuard');
    expect(decorators).toContain("RequirePermissions('identity.user.reset_password')");
    expect(decorators).not.toContain('membership.application.approve');
  });
});
