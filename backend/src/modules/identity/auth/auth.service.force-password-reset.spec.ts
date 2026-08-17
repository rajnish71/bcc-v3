// backend/src/modules/identity/auth/auth.service.force-password-reset.spec.ts
//
// F-034 — force_password_reset is now enforced at token issuance and
// cleared at the two reachable password-change completion points.
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

describe('AuthService.login() force_password_reset gate (F-034, real source inspection)', () => {
  const loginBody = methodBody(
    AUTH_SERVICE_SRC,
    'async login(',
    '// -- Password reset ---------------------------------------------------',
  );

  it('checks force_password_reset before issuing tokens', () => {
    expect(loginBody).toContain('if (user.force_password_reset)');
    expect(loginBody.indexOf('if (user.force_password_reset)')).toBeLessThan(
      loginBody.indexOf('return this.issueTokenPair('),
    );
  });

  it('the force_password_reset check runs after the existing status check (preserves inactive-account handling)', () => {
    const statusCheckIndex = loginBody.indexOf("if (user.status !== 'ACTIVE')");
    const flagCheckIndex = loginBody.indexOf('if (user.force_password_reset)');
    expect(statusCheckIndex).toBeGreaterThan(-1);
    expect(flagCheckIndex).toBeGreaterThan(statusCheckIndex);
  });

  it('the existing inactive-account throw is unchanged', () => {
    expect(loginBody).toContain('throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);');
  });

  it('throws before clearFailedAttempts/recordLoginAttempt(SUCCESS) -- no session side effects on a flagged account', () => {
    const flagCheckIndex = loginBody.indexOf('if (user.force_password_reset)');
    const successIndex = loginBody.indexOf("recordLoginAttempt(user.id, identifier, device, 'SUCCESS')");
    expect(flagCheckIndex).toBeLessThan(successIndex);
  });
});

// ── B. refresh() enforcement (real source inspection) ──────────────────────

describe('AuthService.refresh() force_password_reset gate (F-034, real source inspection)', () => {
  const refreshBody = methodBody(
    AUTH_SERVICE_SRC,
    'async refresh(',
    '// -- Logout / session management ------------------------------------',
  );

  it('checks force_password_reset before issuing a new token pair', () => {
    expect(refreshBody).toContain('if (user.force_password_reset)');
    expect(refreshBody.indexOf('if (user.force_password_reset)')).toBeLessThan(
      refreshBody.indexOf('return this.issueTokenPair('),
    );
  });

  it('the force_password_reset check runs after the existing active-account check', () => {
    const statusCheckIndex = refreshBody.indexOf("if (!user || user.status !== 'ACTIVE')");
    const flagCheckIndex = refreshBody.indexOf('if (user.force_password_reset)');
    expect(statusCheckIndex).toBeGreaterThan(-1);
    expect(flagCheckIndex).toBeGreaterThan(statusCheckIndex);
  });
});

// ── C. resetPassword() clears the flag (real source inspection) ────────────

describe('AuthService.resetPassword() clears force_password_reset (F-034, real source inspection)', () => {
  const resetBody = methodBody(
    AUTH_SERVICE_SRC,
    'async resetPassword(',
    '// -- Token issuance --------------------------------------------------',
  );

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

// ── D. AccountSettingsService.updatePassword() clears the flag ─────────────

describe('AccountSettingsService.updatePassword() clears force_password_reset (F-034, real source inspection)', () => {
  const updatePasswordBody = methodBody(
    ACCOUNT_SETTINGS_SERVICE_SRC,
    'async updatePassword(',
    'return { updated: true };',
  );

  it('sets force_password_reset: false alongside the new password_hash', () => {
    expect(updatePasswordBody).toMatch(
      /\.set\(\{\s*password_hash:\s*newHash,\s*force_password_reset:\s*false\s*\}\)/,
    );
  });

  it('still requires and verifies the current password (existing behaviour preserved)', () => {
    expect(updatePasswordBody).toContain('Current password is incorrect');
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

// ── F. Pure-function mirror of the login()/refresh() issuance decision ─────
//
// Mirrors the exact two-check sequence added to login()/refresh() above,
// exercised the same way membership.controller.spec.ts mirrors RbacGuard's
// decision -- without touching db.ts.

type AuthUserState = {
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  force_password_reset: boolean;
};

function canIssueTokens(user: AuthUserState): { allowed: boolean; reason?: string } {
  if (user.status !== 'ACTIVE') {
    return { allowed: false, reason: `Account is ${user.status.toLowerCase()}` };
  }
  if (user.force_password_reset) {
    return {
      allowed: false,
      reason: 'Password reset required. Please reset your password before signing in.',
    };
  }
  return { allowed: true };
}

describe('Token-issuance decision (F-034, mirrored)', () => {
  it('normal login → unchanged (active, not flagged → allowed)', () => {
    expect(canIssueTokens({ status: 'ACTIVE', force_password_reset: false })).toEqual({
      allowed: true,
    });
  });

  it('flagged user login → no token issued', () => {
    const result = canIssueTokens({ status: 'ACTIVE', force_password_reset: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(
      'Password reset required. Please reset your password before signing in.',
    );
  });

  it('normal refresh → unchanged (same decision function governs both)', () => {
    expect(canIssueTokens({ status: 'ACTIVE', force_password_reset: false }).allowed).toBe(true);
  });

  it('flagged refresh → no new token', () => {
    expect(canIssueTokens({ status: 'ACTIVE', force_password_reset: true }).allowed).toBe(false);
  });

  it('inactive account is still rejected regardless of the flag (status check takes precedence)', () => {
    const result = canIssueTokens({ status: 'SUSPENDED', force_password_reset: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Account is suspended');
  });
});
