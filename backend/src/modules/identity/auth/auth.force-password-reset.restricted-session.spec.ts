// Behavioural tests for the force_password_reset mandatory-action flow:
// password login()/refresh() authenticate normally and issue a RESTRICTED
// session (access token claim `fpr`); AccessTokenGuard confines that session
// to routes marked @AllowForcedPasswordReset(); the canonical password change
// (AccountSettingsService.updatePassword) clears the flag atomically.
// AuthService / AccountSettingsService run for real against the recording
// fake of db.ts (same harness as auth.force-password-reset.session-block.spec.ts).

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
// users.controller imports `sql` from the ESM-only kysely package (not loadable
// under this CommonJS Jest config); the allow-list test only needs route metadata.
jest.mock('kysely', () => ({ sql: () => ({}) }));
jest.mock('../../shared/communication/communication.service', () => ({
  CommunicationService: class {
    dispatch = jest.fn().mockResolvedValue(undefined);
    wrapEmail = (html: string) => html;
  },
}));

import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccessTokenGuard } from './access-token.guard';
import { AllowForcedPasswordReset, ALLOW_FORCED_PASSWORD_RESET } from './allow-forced-password-reset.decorator';
import { hashRefreshToken, type AccessTokenPayload } from './token.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import { AccountSettingsService } from '../account-settings/account-settings.service';
import { AccountSettingsController } from '../account-settings/account-settings.controller';
import { UsersController } from '../users/users.controller';

const fake = db as unknown as FakeDb;
const DEVICE = { ipAddress: '203.0.113.9', userAgent: 'jest-agent' };

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const jwt = new JwtService({});
const communication = new (CommunicationService as unknown as new () => CommunicationService)();
const service = new AuthService(jwt, communication);
const accountSettings = new AccountSettingsService(communication);

const userRow = (id: number, extra: Record<string, unknown> = {}) => ({
  id, uuid: `u-${id}`, email: `user${id}@example.com`, username: null, full_name: 'Test User',
  status: 'ACTIVE', force_password_reset: false, ...extra,
});

function script(tables: Record<string, Record<string, unknown[]>>) {
  fake.responder = (op) => {
    if (op.kind !== 'select') return undefined;
    const byColumn = tables[op.table];
    if (!byColumn) return [];
    const column = op.wheres.map(([c]) => c).find((c) => typeof c === 'string' && c in byColumn) as string | undefined;
    return column ? byColumn[column] : (byColumn['*'] ?? []);
  };
}
const inserted = (table: string): FakeOp[] => fake.writes(table, 'insert');
const decode = (token: string) => jwt.decode(token) as AccessTokenPayload;

beforeEach(() => fake.reset());

// ── Login ──────────────────────────────────────────────────────────────────

describe('password login()', () => {
  it('correct password, flag FALSE → normal unrestricted session', async () => {
    const hash = await argon2.hash('pw-123456');
    script({ users: { email: [userRow(42, { password_hash: hash })] } });
    const pair = await service.login('user42@example.com', 'pw-123456', DEVICE);
    expect(decode(pair.accessToken).fpr).toBeUndefined();
    expect(inserted('login_history')[0].values).toMatchObject({ status: 'SUCCESS' });
  });

  it('correct password, flag TRUE → authentication succeeds, session established, token marked fpr', async () => {
    const hash = await argon2.hash('pw-123456');
    script({ users: { email: [userRow(42, { password_hash: hash, force_password_reset: true })] } });
    const pair = await service.login('user42@example.com', 'pw-123456', DEVICE);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(decode(pair.accessToken)).toMatchObject({ sub: 42, fpr: true });
    expect(inserted('refresh_tokens')).toHaveLength(1);
    const history = inserted('login_history');
    expect(history).toHaveLength(1);
    expect(history[0].values).toMatchObject({ status: 'SUCCESS' });
  });

  it('wrong password, flag TRUE → normal 401, no session, flag not disclosed', async () => {
    const hash = await argon2.hash('pw-123456');
    script({ users: { email: [userRow(42, { password_hash: hash, force_password_reset: true })] } });
    const attempt = service.login('user42@example.com', 'WRONG-password', DEVICE);
    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toThrow('Invalid email or password');
    expect(inserted('refresh_tokens')).toHaveLength(0);
    expect(inserted('login_history')[0].values).toMatchObject({ status: 'FAILED' });
  });
});

// ── Refresh ────────────────────────────────────────────────────────────────

describe('refresh()', () => {
  const tokenRow = () => ({
    id: 5, user_id: 42, session_id: '11111111-2222-4333-8444-555555555555',
    token_hash: hashRefreshToken('raw'), device_label: null, revoked_at: null,
    expires_at: new Date(Date.now() + 86_400_000),
  });

  it('flagged user keeps a restricted session (new token still carries fpr)', async () => {
    script({ refresh_tokens: { token_hash: [tokenRow()] }, users: { id: [userRow(42, { force_password_reset: true })] } });
    const pair = await service.refresh('raw', DEVICE);
    expect(decode(pair.accessToken).fpr).toBe(true);
  });

  it('after the flag is cleared, refresh yields an unrestricted token', async () => {
    script({ refresh_tokens: { token_hash: [tokenRow()] }, users: { id: [userRow(42)] } });
    const pair = await service.refresh('raw', DEVICE);
    expect(decode(pair.accessToken).fpr).toBeUndefined();
  });
});

// ── Logout stays available ─────────────────────────────────────────────────

describe('logout', () => {
  it('endpoint is not behind AccessTokenGuard (a forced-reset session can always sign out)', () => {
    expect(Reflect.getMetadata('__guards__', AuthController.prototype.logout)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', AuthController.prototype.refresh)).toBeUndefined();
  });

  it('revokes the refresh token', async () => {
    await service.logout('raw');
    expect(fake.writes('refresh_tokens', 'update')[0].set).toHaveProperty('revoked_at');
  });
});

// ── AccessTokenGuard enforcement ───────────────────────────────────────────

describe('AccessTokenGuard', () => {
  class Dummy {
    @AllowForcedPasswordReset() allowed() {}
    blocked() {}
  }
  const ctxFor = (token: string, handler: () => void) => {
    const request: { headers: Record<string, string>; user?: AccessTokenPayload } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => handler, getClass: () => Dummy } as never;
    return { ctx, request };
  };
  const sign = (payload: Partial<AccessTokenPayload>) =>
    jwt.signAsync({ sub: 1, uuid: 'u-1', status: 'ACTIVE', ...payload }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: 60 });
  const guard = new AccessTokenGuard(jwt, new Reflector());

  it('forced-reset session is refused on an ordinary route with PASSWORD_CHANGE_REQUIRED', async () => {
    const { ctx } = ctxFor(await sign({ fpr: true }), Dummy.prototype.blocked);
    const attempt = guard.canActivate(ctx);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toMatchObject({ response: { code: 'PASSWORD_CHANGE_REQUIRED' } });
  });

  it('forced-reset session is admitted on a route marked @AllowForcedPasswordReset()', async () => {
    const { ctx, request } = ctxFor(await sign({ fpr: true }), Dummy.prototype.allowed);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user!.fpr).toBe(true);
  });

  it('normal session is unaffected on every route', async () => {
    for (const handler of [Dummy.prototype.blocked, Dummy.prototype.allowed]) {
      const { ctx } = ctxFor(await sign({}), handler);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
  });

  it('fails closed when constructed without a Reflector', async () => {
    const { ctx } = ctxFor(await sign({ fpr: true }), Dummy.prototype.allowed);
    await expect(new AccessTokenGuard(jwt).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an invalid token is still a plain 401 (the fpr check cannot mask it)', async () => {
    const { ctx } = ctxFor('not-a-jwt', Dummy.prototype.blocked);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('forced-reset route allow-list', () => {
  const allowed = (fn: object) => Reflect.getMetadata(ALLOW_FORCED_PASSWORD_RESET, fn) === true;

  it('only GET /users/me and PUT /hub/account-settings/password are reachable', () => {
    expect(allowed(UsersController.prototype.me)).toBe(true);
    expect(allowed(AccountSettingsController.prototype.updatePassword)).toBe(true);

    for (const proto of [UsersController.prototype, AccountSettingsController.prototype, AuthController.prototype]) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || typeof (proto as never)[name] !== 'function') continue;
        const expected = (proto === UsersController.prototype && name === 'me') ||
          (proto === AccountSettingsController.prototype && name === 'updatePassword');
        expect([proto.constructor.name, name, allowed((proto as never)[name])]).toEqual([proto.constructor.name, name, expected]);
      }
    }
  });
});

// ── Mandatory password change (canonical path: updatePassword) ─────────────

describe('AccountSettingsService.updatePassword()', () => {
  const dto = { currentPassword: 'temp-pass-1', newPassword: 'brand-new-pass-9' };
  const forcedUser = async (flag = true) =>
    script({ users: { id: [{ password_hash: await argon2.hash('temp-pass-1'), force_password_reset: flag }] } });

  it('success clears force_password_reset with the new hash and audits PASSWORD_CHANGED in the same transaction', async () => {
    await forcedUser();
    await expect(accountSettings.updatePassword(42, dto)).resolves.toEqual({ updated: true });
    const update = fake.writes('users', 'update')[0];
    expect(update.set).toMatchObject({ force_password_reset: false });
    expect(await argon2.verify(update.set!.password_hash as string, dto.newPassword)).toBe(true);
    const audit = fake.writes('identity_audit_log', 'insert')[0];
    expect(audit.values).toMatchObject({ actor_id: 42, target_user_id: 42, action_type: 'PASSWORD_CHANGED' });
    expect(update.txId).not.toBeNull();
    expect(audit.txId).toBe(update.txId);
  });

  it('wrong current password → rejected, nothing written, flag untouched', async () => {
    await forcedUser();
    await expect(accountSettings.updatePassword(42, { ...dto, currentPassword: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fake.writes('users')).toHaveLength(0);
    expect(fake.writes('identity_audit_log')).toHaveLength(0);
  });

  it('atomic: if the audit write fails, the password+flag update rolls back (nothing committed)', async () => {
    await forcedUser();
    fake.failWhen = (op) => (op.table === 'identity_audit_log' ? new Error('audit down') : null);
    await expect(accountSettings.updatePassword(42, dto)).rejects.toThrow('audit down');
    expect(fake.writes('users')).toHaveLength(0);
    expect(fake.rolledBack.filter((op) => op.table === 'users')).toHaveLength(1);
  });

  it('atomic: if the user update fails, no audit row is committed', async () => {
    await forcedUser();
    fake.failWhen = (op) => (op.table === 'users' && op.kind === 'update' ? new Error('db down') : null);
    await expect(accountSettings.updatePassword(42, dto)).rejects.toThrow('db down');
    expect(fake.writes('identity_audit_log')).toHaveLength(0);
  });

  it('voluntary change (flag already FALSE) behaves exactly as before', async () => {
    await forcedUser(false);
    await expect(accountSettings.updatePassword(42, dto)).resolves.toEqual({ updated: true });
    expect(fake.writes('users', 'update')[0].set).toMatchObject({ force_password_reset: false });
    expect(fake.writes('identity_audit_log', 'insert')[0].values).toMatchObject({ action_type: 'PASSWORD_CHANGED' });
  });
});
