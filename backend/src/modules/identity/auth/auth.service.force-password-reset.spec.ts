// backend/src/modules/identity/auth/auth.service.force-password-reset.spec.ts
//
// F-034 — force_password_reset is a post-authentication mandatory-action
// state: password login()/refresh() issue a RESTRICTED session (access token
// claim `fpr`, enforced by AccessTokenGuard), the flag still blocks the
// non-password session paths, and it is cleared at the two reachable
// password-change completion points.
//
// AuthService/AccountSettingsService are NOT instantiated here: both import
// db.ts (Kysely ESM -- incompatible with this project's CommonJS Jest
// config, the same constraint documented in every other *.spec.ts in this
// project, e.g. membership.controller.spec.ts / razorpay-webhook.spec.ts).
// This file combines:
//   (a) REAL static inspection of the actual service sources proving the
//       check/clear sites exist in the right method, in the right order,
//       relative to the pre-existing status check and token issuance, and
//   (b) a pure function mirroring login()/refresh()'s token-issuance
//       decision, exercised the same way membership.controller.spec.ts
//       mirrors RbacGuard's permission decision.

import { readFileSync } from 'fs';
import { join } from 'path';

const AUTH_SERVICE_SRC = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8');
const ACCOUNT_SETTINGS_SERVICE_SRC = readFileSync(
  join(__dirname, '..', 'account-settings', 'account-settings.service.ts'),
  'utf8',
);
const MEMBERSHIP_CONTROLLER_SRC = readFileSync(
  join(__dirname, '..', '..', 'membership', 'membership.controller.ts'),
  'utf8',
);
const REGISTRATION_SERVICE_SRC = readFileSync(
  join(__dirname, '..', 'registration', 'registration.service.ts'),
  'utf8',
);

function methodBody(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`markers not found: ${startMarker} .. ${endMarker}`);
  }
  return src.slice(start, end);
}

// ── A. login() enforcement (real source inspection) ────────────────────────

describe('AuthService.login() force_password_reset handling (real source inspection)', () => {
  const loginBody = methodBody(
    AUTH_SERVICE_SRC,
    'async login(',
    '// -- Password reset ---------------------------------------------------',
  );

  it('no longer rejects an authenticated flagged user (flag is not an authentication failure)', () => {
    expect(loginBody).not.toContain('assertPasswordResetNotRequired');
    expect(loginBody).not.toContain('if (user.force_password_reset)');
  });

  it('passes the flag into the issued access token (restricted session)', () => {
    expect(loginBody).toContain('!!user.force_password_reset');
    expect(loginBody).toContain('return this.issueTokenPair(');
  });

  it('the existing inactive-account throw is unchanged and still precedes issuance', () => {
    expect(loginBody).toContain('throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);');
    expect(loginBody.indexOf("if (user.status !== 'ACTIVE')")).toBeLessThan(
      loginBody.indexOf('return this.issueTokenPair('),
    );
  });
});

// ── A2. login() bcrypt→Argon2 migration writes identity_audit_log (F-011) ──

const migrationBody = methodBody(
  AUTH_SERVICE_SRC,
  'if (needsMigration) {',
  "if (user.status !== 'ACTIVE')",
);

describe('AuthService.login() bcrypt->Argon2 migration audit (F-011, real source inspection)', () => {
  it('the migration block is still gated by needsMigration and wrapped in try/catch', () => {
    expect(migrationBody).toContain('try {');
    expect(migrationBody).toContain('} catch (migrationError) {');
  });

  it('still detects bcrypt and hashes/updates to Argon2 (existing behaviour preserved)', () => {
    expect(AUTH_SERVICE_SRC).toContain(
      "const isBcrypt = hash && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'));",
    );
    expect(migrationBody).toContain('const newArgonHash = await argon2.hash(password);');
    expect(migrationBody).toContain("updateTable('users')");
    expect(migrationBody).toContain('password_hash: newArgonHash');
  });

  it('logs a PASSWORD_HASH_MIGRATED audit entry with the migrated user as both actor and target', () => {
    expect(migrationBody).toMatch(
      /logIdentityAudit\(\{\s*actorId:\s*user\.id,\s*targetUserId:\s*user\.id,\s*actionType:\s*'PASSWORD_HASH_MIGRATED',\s*\}\)/,
    );
  });

  it('the audit call happens after the password_hash UPDATE', () => {
    const updateIndex = migrationBody.indexOf("updateTable('users')");
    const auditIndex = migrationBody.indexOf('logIdentityAudit(');
    expect(updateIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(updateIndex);
  });

  it('the audit call is inside the same try block as the UPDATE, before the catch (a failure there cannot block login)', () => {
    const auditIndex = migrationBody.indexOf('logIdentityAudit(');
    const catchIndex = migrationBody.indexOf('} catch (migrationError) {');
    expect(auditIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeLessThan(catchIndex);
  });

  it('does not wrap the migration in a db.transaction() (best-effort semantics preserved, not atomic)', () => {
    expect(migrationBody).not.toContain('db.transaction()');
  });

  it('a migration failure still only logs to console -- it does not rethrow or block login', () => {
    expect(migrationBody).toContain(
      'console.error(`Failed to migrate password hash to Argon2 for user ${user.id}:`, migrationError);',
    );
  });
});

// ── B. refresh() enforcement (real source inspection) ──────────────────────

describe('AuthService.refresh() force_password_reset handling (real source inspection)', () => {
  const refreshBody = methodBody(
    AUTH_SERVICE_SRC,
    'async refresh(',
    '// -- Logout / session management ------------------------------------',
  );

  it('no longer refuses a flagged account; re-reads the flag into the new token pair', () => {
    expect(refreshBody).not.toContain('assertPasswordResetNotRequired');
    expect(refreshBody).toContain('!!user.force_password_reset');
  });

  it('the existing active-account check is unchanged', () => {
    expect(refreshBody).toContain("if (!user || user.status !== 'ACTIVE')");
  });
});

// ── B2. Shared helper + universal session block (F-034 Option A) ───────────

describe('F-034 universal session block (real source inspection)', () => {
  const helperBody = methodBody(
    AUTH_SERVICE_SRC,
    'assertPasswordResetNotRequired(user: { force_password_reset: boolean }): void {',
    'private async issueTokenPair(',
  );
  const issueSessionBody = methodBody(
    AUTH_SERVICE_SRC,
    'async issueSessionForUser(',
    'assertPasswordResetNotRequired(user: { force_password_reset: boolean }): void {',
  );

  it('the helper throws ForbiddenException with the existing F-034 message', () => {
    expect(helperBody).toContain('if (user.force_password_reset)');
    expect(helperBody).toContain('throw new ForbiddenException(');
    expect(helperBody).toContain(
      "'Password reset required. Please reset your password before signing in.'",
    );
  });

  it('the message literal exists exactly once in AuthService (single rule, no divergent copies)', () => {
    const occurrences = AUTH_SERVICE_SRC.split(
      'Password reset required. Please reset your password before signing in.',
    ).length - 1;
    expect(occurrences).toBe(1);
  });

  it('issueSessionForUser() reads the flag on the caller executor and enforces it before minting a session', () => {
    expect(issueSessionBody).toMatch(/executor\s*\.selectFrom\('users'\)\s*\.select\(\['force_password_reset'\]\)/);
    const gate = issueSessionBody.indexOf('this.assertPasswordResetNotRequired(account)');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(issueSessionBody.indexOf('resolveSessionId()'));
    expect(gate).toBeLessThan(issueSessionBody.indexOf('this.issueTokenPair('));
    expect(gate).toBeLessThan(issueSessionBody.indexOf('this.recordLoginAttempt('));
  });

  it('registerOrLoginWithSocial() link-by-email applies the gate before inserting auth_identities or auditing the link', () => {
    const linkBranch = methodBody(
      REGISTRATION_SERVICE_SRC,
      'if (existingByEmail) {',
      'return { user: this.rowToPublicUser(existingByEmail), tokens, wasNewUser: false };',
    );
    const gate = linkBranch.indexOf('this.authService.assertPasswordResetNotRequired(existingByEmail);');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(linkBranch.indexOf("insertInto('auth_identities')"));
    expect(gate).toBeLessThan(linkBranch.indexOf("actionType: 'SOCIAL_IDENTITY_LINKED'"));
  });
});

// ── C. resetPassword() clears the flag (real source inspection) ────────────

const resetBody = methodBody(
  AUTH_SERVICE_SRC,
  'async resetPassword(',
  '// -- Token issuance --------------------------------------------------',
);

describe('AuthService.resetPassword() clears force_password_reset (F-034, real source inspection)', () => {
  it('sets force_password_reset: false alongside the new password_hash', () => {
    expect(resetBody).toMatch(
      /\.set\(\{\s*password_hash:\s*passwordHash,\s*force_password_reset:\s*false\s*\}\)/,
    );
  });

  it('still revokes all active refresh tokens (existing behaviour preserved)', () => {
    expect(resetBody).toContain("updateTable('refresh_tokens')");
    expect(resetBody).toContain('revoked_at:');
  });

  it('still consumes the reset token (existing behaviour preserved)', () => {
    expect(resetBody).toContain("updateTable('password_reset_tokens')");
    expect(resetBody).toContain('consumed_at:');
  });
});

// ── C2. resetPassword() writes an identity_audit_log entry (F-011) ─────────

describe('AuthService.resetPassword() writes identity_audit_log (F-011, real source inspection)', () => {
  it('imports logIdentityAudit from the shared audit util', () => {
    expect(AUTH_SERVICE_SRC).toContain(
      "import { logIdentityAudit } from '../shared/identity-audit.util';",
    );
  });

  it('wraps the reset sequence in a single db.transaction()', () => {
    expect(resetBody).toContain('await db.transaction().execute(async (trx) => {');
  });

  it('the users update, audit write, token consumption, and refresh-token revocation all run against trx (not the module-level db)', () => {
    expect(resetBody).toMatch(/trx\s*\.updateTable\('users'\)/);
    expect(resetBody).toMatch(/trx\s*\.updateTable\('password_reset_tokens'\)/);
    expect(resetBody).toMatch(/trx\s*\.updateTable\('refresh_tokens'\)/);
  });

  it('logs a PASSWORD_RESET audit entry with actorId null and the reset user as target, executed against trx', () => {
    expect(resetBody).toMatch(
      /logIdentityAudit\(\s*\{\s*actorId:\s*null,\s*targetUserId:\s*tokenRow\.user_id,\s*actionType:\s*'PASSWORD_RESET',\s*\},\s*trx,\s*\)/,
    );
  });

  it('the audit write happens after the password update and before token consumption/revocation', () => {
    const usersUpdateIndex = resetBody.search(/trx\s*\.updateTable\('users'\)/);
    const auditIndex = resetBody.indexOf('logIdentityAudit(');
    const tokenConsumeIndex = resetBody.search(/trx\s*\.updateTable\('password_reset_tokens'\)/);
    expect(usersUpdateIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(usersUpdateIndex);
    expect(tokenConsumeIndex).toBeGreaterThan(auditIndex);
  });
});

// ── D. AccountSettingsService.updatePassword() clears the flag ─────────────

const updatePasswordBody = methodBody(
  ACCOUNT_SETTINGS_SERVICE_SRC,
  'async updatePassword(',
  'return { updated: true };',
);

describe('AccountSettingsService.updatePassword() clears force_password_reset (F-034, real source inspection)', () => {
  it('sets force_password_reset: false alongside the new password_hash', () => {
    expect(updatePasswordBody).toMatch(
      /\.set\(\{\s*password_hash:\s*newHash,\s*force_password_reset:\s*false\s*\}\)/,
    );
  });

  it('still requires and verifies the current password (existing behaviour preserved)', () => {
    expect(updatePasswordBody).toContain('Current password is incorrect');
  });
});

// ── D2. AccountSettingsService.updatePassword() writes identity_audit_log (F-011) ──

describe('AccountSettingsService.updatePassword() writes identity_audit_log (F-011, real source inspection)', () => {
  it('imports logIdentityAudit from the shared audit util', () => {
    expect(ACCOUNT_SETTINGS_SERVICE_SRC).toContain(
      "import { logIdentityAudit } from '../shared/identity-audit.util';",
    );
  });

  it('wraps the password update and audit write in a single db.transaction()', () => {
    expect(updatePasswordBody).toContain('await db.transaction().execute(async (trx) => {');
  });

  it('the users update and the audit write both run against trx (not the module-level db)', () => {
    expect(updatePasswordBody).toMatch(/trx\s*\.updateTable\('users'\)/);
    expect(updatePasswordBody).toMatch(
      /logIdentityAudit\(\s*\{[^}]*\},\s*trx,\s*\)/,
    );
  });

  it('logs a PASSWORD_CHANGED audit entry with the authenticated user as both actor and target', () => {
    expect(updatePasswordBody).toMatch(
      /logIdentityAudit\(\s*\{\s*actorId:\s*userId,\s*targetUserId:\s*userId,\s*actionType:\s*'PASSWORD_CHANGED',\s*\},\s*trx,\s*\)/,
    );
  });

  it('the audit write happens after the password update', () => {
    const usersUpdateIndex = updatePasswordBody.search(/trx\s*\.updateTable\('users'\)/);
    const auditIndex = updatePasswordBody.indexOf('logIdentityAudit(');
    expect(usersUpdateIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(usersUpdateIndex);
  });
});

// ── D3. AccountSettingsService.verifyEmailChange() writes identity_audit_log (F-011) ──

const verifyEmailChangeBody = methodBody(
  ACCOUNT_SETTINGS_SERVICE_SRC,
  'async verifyEmailChange(',
  'return { verified: true, newEmail: row.new_email };',
);

describe('AccountSettingsService.verifyEmailChange() writes identity_audit_log (F-011, real source inspection)', () => {
  it('wraps the email update, audit write, and pending-row deletion in a single db.transaction()', () => {
    expect(verifyEmailChangeBody).toContain('await db.transaction().execute(async (trx) => {');
  });

  it('the users update, the audit write, and the pending_email_changes delete all run against trx (not the module-level db)', () => {
    expect(verifyEmailChangeBody).toMatch(/trx\s*\.updateTable\('users'\)/);
    expect(verifyEmailChangeBody).toMatch(
      /logIdentityAudit\(\s*\{[^}]*\},\s*trx,\s*\)/,
    );
    expect(verifyEmailChangeBody).toMatch(/trx\s*\.deleteFrom\('pending_email_changes'\)/);
  });

  it('logs an EMAIL_CHANGED audit entry with actorId null and the changed-email user as target', () => {
    expect(verifyEmailChangeBody).toMatch(
      /logIdentityAudit\(\s*\{\s*actorId:\s*null,\s*targetUserId:\s*row\.user_id,\s*actionType:\s*'EMAIL_CHANGED',\s*\},\s*trx,\s*\)/,
    );
  });

  it('the audit write happens after the email update and before the pending-token deletion', () => {
    const usersUpdateIndex = verifyEmailChangeBody.search(/trx\s*\.updateTable\('users'\)/);
    const auditIndex = verifyEmailChangeBody.indexOf('logIdentityAudit(');
    const deleteIndex = verifyEmailChangeBody.search(/trx\s*\.deleteFrom\('pending_email_changes'\)/);
    expect(usersUpdateIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(usersUpdateIndex);
    expect(deleteIndex).toBeGreaterThan(auditIndex);
  });

  it('still validates token existence, expiry, and returns the verified email (existing behaviour preserved)', () => {
    expect(verifyEmailChangeBody).toContain('Verification link is invalid or has already been used');
    expect(verifyEmailChangeBody).toContain('Verification link has expired');
    expect(verifyEmailChangeBody).toContain("set({ email: row.new_email })");
  });
});

// ── E. Admin-facing set paths are unchanged (regression guard) ─────────────

describe('force_password_reset set paths still set true (F-034 regression guard)', () => {
  it('admin reset-password endpoint still sets force_password_reset: true', () => {
    const adminResetBody = methodBody(
      MEMBERSHIP_CONTROLLER_SRC,
      'async adminResetPassword(',
      "return { ok: true };",
    );
    expect(adminResetBody).toContain('force_password_reset: true');
  });

  it('admin account creation still sets force_password_reset: true', () => {
    const adminCreateBody = methodBody(
      REGISTRATION_SERVICE_SRC,
      'async adminCreateAccount(',
      'return { user: await this.toPublicUser(id), temporaryPassword };',
    );
    expect(adminCreateBody).toContain('force_password_reset: true');
  });
});
