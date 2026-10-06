// Behavioural tests for the F-034 universal session block (Option A):
// a force_password_reset account receives no session through ANY
// authentication path until the flag is cleared by the existing reset /
// change-password flows. AuthService and RegistrationService run for real
// against the recording fake of db.ts (see test-support/fake-db.ts), the
// same harness as auth.session-id.spec.ts.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/communication/communication.service', () => ({
  CommunicationService: class {
    dispatch = jest.fn().mockResolvedValue(undefined);
    wrapEmail = (html: string) => html;
  },
}));
jest.mock('../../shared/communication/email.service', () => ({
  EmailService: class {
    send = jest.fn().mockResolvedValue(undefined);
  },
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { AuthService } from './auth.service';
import { hashRefreshToken } from './token.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EmailService } from '../../shared/communication/email.service';
import { RegistrationService } from '../registration/registration.service';

const fake = db as unknown as FakeDb;
const DEVICE = { ipAddress: '203.0.113.9', userAgent: 'jest-agent' };
const RESET_REQUIRED = 'Password reset required. Please reset your password before signing in.';
const FUTURE = new Date(Date.now() + 3_600_000);

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const jwt = new JwtService({});
// Both classes are jest.mock()ed above with no-arg constructors.
const communication = new (CommunicationService as unknown as new () => CommunicationService)();
const email = new (EmailService as unknown as new () => EmailService)();
const service = new AuthService(jwt, communication);
const registration = new RegistrationService(service, email, communication);

const userRow = (id: number, extra: Record<string, unknown> = {}) => ({
  id, uuid: `u-${id}`, email: `user${id}@example.com`, phone: null, full_name: 'Test User',
  status: 'ACTIVE', registration_method: 'EMAIL_PASSWORD', email_verified_at: null,
  phone_verified_at: null, force_password_reset: false, created_at: '2026-09-27', ...extra,
});
const flagged = (id: number) => userRow(id, { force_password_reset: true });

// tables: table -> (whereColumn -> rows). Unlisted selects return [].
function script(tables: Record<string, Record<string, unknown[]>>) {
  fake.responder = (op) => {
    if (op.kind !== 'select') return undefined;
    const byColumn = tables[op.table];
    if (!byColumn) return [];
    const column = op.wheres.map(([c]) => c).find((c) => typeof c === 'string' && c in byColumn) as string | undefined;
    return column ? byColumn[column] : (byColumn['*'] ?? []);
  };
}

function inserted(table: string): FakeOp[] {
  return fake.writes(table, 'insert');
}

function expectNoSession() {
  expect(inserted('refresh_tokens')).toHaveLength(0);
  expect(inserted('login_history').filter((op) => op.values!.status === 'SUCCESS')).toHaveLength(0);
}

async function expectResetRequired(p: Promise<unknown>) {
  await expect(p).rejects.toBeInstanceOf(ForbiddenException);
  await expect(p).rejects.toThrow(RESET_REQUIRED);
}

beforeEach(() => fake.reset());

// ── A. issueSessionForUser() — the common non-password boundary ───────────

describe('issueSessionForUser() (F-034 universal session block)', () => {
  it('flagged existing user → 403, no refresh token, no SUCCESS login_history', async () => {
    script({ users: { id: [flagged(7)] } });
    await expectResetRequired(service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE));
    expectNoSession();
    expect(inserted('login_history')).toHaveLength(0);
  });

  it('flagged user on a caller transaction → 403 and nothing is written in that transaction', async () => {
    script({ users: { id: [flagged(7)] } });
    await expectResetRequired(
      fake.transaction().execute((trx) => service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE, trx as never)),
    );
    expectNoSession();
    expect(fake.rolledBack.filter((op) => op.table === 'refresh_tokens')).toHaveLength(0);
  });

  it('reads the flag on the caller executor (in-transaction sign-up sees its own row)', async () => {
    script({ users: { id: [userRow(7)] } });
    await fake.transaction().execute((trx) => service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE, trx as never));
    const flagRead = fake.selects.find((op) => op.table === 'users');
    expect(flagRead?.inTransaction).toBe(true);
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });

  it('unflagged user → session issued (unchanged)', async () => {
    script({ users: { id: [userRow(7)] } });
    const pair = await service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE);
    expect(pair.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
    expect(inserted('login_history')[0].values).toMatchObject({ status: 'SUCCESS' });
  });
});

// ── Password login (pre-existing gate, now via the shared helper) ─────────

describe('password login', () => {
  it('flagged → 403, FAILED login_history, no session (existing behaviour preserved)', async () => {
    const passwordHash = await argon2.hash('pw-123456');
    script({ users: { email: [userRow(42, { password_hash: passwordHash, force_password_reset: true })] } });
    await expectResetRequired(service.login('user42@example.com', 'pw-123456', DEVICE));
    expectNoSession();
    expect(inserted('login_history')[0].values).toMatchObject({ status: 'FAILED' });
  });
});

// ── B. Social login — existing linked account ──────────────────────────────

describe('social login: already-linked account', () => {
  const dto = { provider: 'GOOGLE', providerUserId: 'g-1', email: 'user42@example.com', fullName: 'X' } as never;
  const linked = { provider: [{ user_id: 42, provider: 'GOOGLE', provider_user_id: 'g-1' }] };

  it('flagged → 403, no tokens, no session', async () => {
    script({ auth_identities: linked, users: { id: [flagged(42)] } });
    await expectResetRequired(registration.registerOrLoginWithSocial(dto, DEVICE));
    expectNoSession();
  });

  it('unflagged → session issued (unchanged)', async () => {
    script({ auth_identities: linked, users: { id: [userRow(42)] } });
    const { tokens } = await registration.registerOrLoginWithSocial(dto, DEVICE);
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });
});

// ── C. Social login — link existing account by email ──────────────────────

describe('social login: link existing account by email', () => {
  const dto = { provider: 'GOOGLE', providerUserId: 'g-2', email: 'user43@example.com', fullName: 'X' } as never;

  it('flagged → 403 before any identity-link mutation: no auth_identities row, no SOCIAL_IDENTITY_LINKED audit, no session', async () => {
    script({ auth_identities: { provider: [] }, users: { email: [flagged(43)], id: [flagged(43)] } });
    await expectResetRequired(registration.registerOrLoginWithSocial(dto, DEVICE));
    expect(inserted('auth_identities')).toHaveLength(0);
    expect(inserted('identity_audit_log')).toHaveLength(0);
    expectNoSession();
  });

  it('unflagged → links, audits and issues a session (unchanged)', async () => {
    script({ auth_identities: { provider: [] }, users: { email: [userRow(43)], id: [userRow(43)] } });
    const { tokens } = await registration.registerOrLoginWithSocial(dto, DEVICE);
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('auth_identities')).toHaveLength(1);
    expect(inserted('identity_audit_log')[0].values).toMatchObject({ action_type: 'SOCIAL_IDENTITY_LINKED' });
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });
});

// ── D. Magic link — existing account ───────────────────────────────────────

describe('magic link: existing account', () => {
  const link = { token_hash: [{ id: 9, email: 'user44@example.com', consumed_at: null, expires_at: FUTURE }] };

  it('flagged → 403, no session', async () => {
    script({ magic_links: link, users: { email: [flagged(44)], id: [flagged(44)] } });
    await expectResetRequired(registration.consumeMagicLink({ token: 'tok' } as never, DEVICE));
    expectNoSession();
  });

  it('unflagged → session issued (unchanged)', async () => {
    script({ magic_links: link, users: { email: [userRow(44)], id: [userRow(44)] } });
    const { tokens } = await registration.consumeMagicLink({ token: 'tok' } as never, DEVICE);
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });
});

// ── E. New-user paths are not over-enforced ────────────────────────────────
// New rows carry the column default (false); toPublicUser()/the gate read
// them back by the fake's next insert id (1000).

describe('new-user paths (unchanged)', () => {
  it('social login: new account still gets a session', async () => {
    script({ auth_identities: { provider: [] }, users: { email: [], id: [userRow(1000)] } });
    const { tokens, wasNewUser } = await registration.registerOrLoginWithSocial(
      { provider: 'GOOGLE', providerUserId: 'g-3', email: 'new3@example.com', fullName: 'X' } as never,
      DEVICE,
    );
    expect(wasNewUser).toBe(true);
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });

  it('magic link: new account still gets a session', async () => {
    script({
      magic_links: { token_hash: [{ id: 9, email: 'fresh@example.com', consumed_at: null, expires_at: FUTURE }] },
      users: { email: [], id: [userRow(1000)] },
    });
    const { tokens, wasNewUser } = await registration.consumeMagicLink({ token: 'tok' } as never, DEVICE);
    expect(wasNewUser).toBe(true);
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });

  it('email/password sign-up still gets a session', async () => {
    script({ users: { email: [], id: [userRow(1000)] } });
    const { tokens } = await registration.registerWithEmailPassword(
      { email: 'new@example.com', password: 'pw-123456', firstName: 'New', lastName: 'User' } as never,
      DEVICE,
    );
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });
});

// ── F. Recovery ────────────────────────────────────────────────────────────

describe('recovery via resetPassword()', () => {
  it('clears the flag (and revokes sessions); with the flag cleared, a non-password sign-in issues a session', async () => {
    script({
      password_reset_tokens: { token_hash: [{ id: 3, user_id: 45, consumed_at: null, expires_at: FUTURE.toISOString() }] },
    });
    await service.resetPassword('raw-reset-token', 'new-password-123');
    const userUpdate = fake.writes('users', 'update')[0];
    expect(userUpdate.set).toMatchObject({ force_password_reset: false });
    expect(fake.writes('refresh_tokens', 'update')[0].set).toHaveProperty('revoked_at');

    // State after the committed reset: the account is no longer flagged.
    fake.reset();
    script({
      auth_identities: { provider: [{ user_id: 45, provider: 'GOOGLE', provider_user_id: 'g-45' }] },
      users: { id: [userRow(45)] },
    });
    const { tokens } = await registration.registerOrLoginWithSocial(
      { provider: 'GOOGLE', providerUserId: 'g-45', email: 'user45@example.com', fullName: 'X' } as never,
      DEVICE,
    );
    expect(tokens.accessToken).toBeTruthy();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });
});

// ── G/H. Refresh: regression for rotation and existing security branches ─

describe('refresh()', () => {
  const tokenRow = (extra: Record<string, unknown> = {}) => ({
    id: 5, user_id: 42, session_id: '11111111-2222-4333-8444-555555555555',
    token_hash: hashRefreshToken('raw'), device_label: null, revoked_at: null,
    expires_at: new Date(Date.now() + 86_400_000), ...extra,
  });

  it('unflagged ACTIVE user → rotates: last_used_at updated, replaced_by_token_id chained, new token issued', async () => {
    script({ refresh_tokens: { token_hash: [tokenRow()] }, users: { id: [userRow(42)] } });
    const pair = await service.refresh('raw', DEVICE);
    expect(pair.refreshToken).toBeTruthy();
    const updates = fake.writes('refresh_tokens', 'update');
    expect(updates.find((op) => op.set && 'last_used_at' in op.set)).toBeDefined();
    expect(updates.find((op) => op.set && 'replaced_by_token_id' in op.set)).toBeDefined();
    expect(inserted('refresh_tokens')).toHaveLength(1);
  });

  it('flagged user → existing 403, no rotation, last_used_at untouched', async () => {
    script({ refresh_tokens: { token_hash: [tokenRow()] }, users: { id: [flagged(42)] } });
    await expectResetRequired(service.refresh('raw', DEVICE));
    expect(inserted('refresh_tokens')).toHaveLength(0);
    expect(fake.writes('refresh_tokens', 'update')).toHaveLength(0);
  });

  it('unknown token → 401', async () => {
    script({ refresh_tokens: { token_hash: [] } });
    await expect(service.refresh('raw', DEVICE)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revoked token → 401 and reuse detection revokes all sessions', async () => {
    script({ refresh_tokens: { token_hash: [tokenRow({ revoked_at: new Date() })] } });
    await expect(service.refresh('raw', DEVICE)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fake.writes('refresh_tokens', 'update')[0].set).toHaveProperty('revoked_at');
    expect(inserted('refresh_tokens')).toHaveLength(0);
  });

  it('expired token → 401', async () => {
    script({ refresh_tokens: { token_hash: [tokenRow({ expires_at: new Date(Date.now() - 1000) })] } });
    await expect(service.refresh('raw', DEVICE)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(inserted('refresh_tokens')).toHaveLength(0);
  });
});
