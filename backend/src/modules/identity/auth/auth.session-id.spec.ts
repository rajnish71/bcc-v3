// Behavioural tests for OBS-03 session correlation. AuthService runs for
// real against a recording fake of db.ts (see test-support/fake-db.ts).

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

import { readFileSync } from 'fs';
import { join } from 'path';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './access-token.guard';
import { hashRefreshToken, type AccessTokenPayload } from './token.util';
import { CommunicationService } from '../../shared/communication/communication.service';
import { EmailService } from '../../shared/communication/email.service';
import { RegistrationService } from '../registration/registration.service';
import { hashToken } from '../shared/token-hash.util';

const fake = db as unknown as FakeDb;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEVICE = { ipAddress: '203.0.113.9', userAgent: 'jest-agent' };

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const jwt = new JwtService({});
// Both classes are jest.mock()ed above with no-arg constructors.
const communication = new (CommunicationService as unknown as new () => CommunicationService)();
const email = new (EmailService as unknown as new () => EmailService)();
const service = new AuthService(jwt, communication);
const registration = new RegistrationService(service, email, communication);

async function decode(token: string): Promise<AccessTokenPayload> {
  return jwt.verifyAsync<AccessTokenPayload>(token, { secret: process.env.JWT_ACCESS_SECRET });
}

function inserted(table: string): FakeOp[] {
  return fake.writes(table, 'insert');
}

beforeEach(() => fake.reset());

describe('password login', () => {
  let passwordHash: string;
  beforeAll(async () => { passwordHash = await argon2.hash('correct horse'); });

  function scriptUser() {
    fake.responder = (op) => {
      if (op.kind !== 'select') return undefined;
      if (op.table === 'users') {
        return [{ id: 42, uuid: 'u-42', email: 'a@b.c', password_hash: passwordHash, status: 'ACTIVE', force_password_reset: false }];
      }
      return [];
    };
  }

  it('mints a session id, puts it in the JWT sid, and persists it to refresh_tokens and login_history', async () => {
    scriptUser();
    const pair = await service.login('a@b.c', 'correct horse', DEVICE);

    const refreshRows = inserted('refresh_tokens');
    const historyRows = inserted('login_history');
    expect(refreshRows).toHaveLength(1);
    const sessionId = refreshRows[0].values!.session_id as string;
    expect(sessionId).toMatch(UUID_RE);

    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].values).toMatchObject({ status: 'SUCCESS', session_id: sessionId });

    expect((await decode(pair.accessToken)).sid).toBe(sessionId);
  });

  it('each login is a new session', async () => {
    scriptUser();
    await service.login('a@b.c', 'correct horse', DEVICE);
    await service.login('a@b.c', 'correct horse', DEVICE);
    const ids = inserted('refresh_tokens').map((op) => op.values!.session_id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('a failed login records no session id and issues no refresh token', async () => {
    scriptUser();
    await expect(service.login('a@b.c', 'wrong', DEVICE)).rejects.toThrow();
    expect(inserted('refresh_tokens')).toHaveLength(0);
    const failed = inserted('login_history');
    expect(failed[0].values).toMatchObject({ status: 'FAILED', session_id: null });
  });
});

describe('issueSessionForUser (email/password sign-up, phone OTP, OAuth, magic link, invitation)', () => {
  it('mints a fresh session per call and embeds it as sid', async () => {
    const a = await service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE);
    const b = await service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE);
    const [rowA, rowB] = inserted('refresh_tokens');
    expect(rowA.values!.session_id).toMatch(UUID_RE);
    expect(rowA.values!.session_id).not.toBe(rowB.values!.session_id);
    expect((await decode(a.accessToken)).sid).toBe(rowA.values!.session_id);
    expect((await decode(b.accessToken)).sid).toBe(rowB.values!.session_id);
  });

  it('records one SUCCESS login_history row per session, with the same session id', async () => {
    await service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE);
    const [refresh] = inserted('refresh_tokens');
    const history = inserted('login_history');
    expect(history).toHaveLength(1);
    expect(history[0].values).toMatchObject({
      user_id: 7,
      session_id: refresh.values!.session_id,
      status: 'SUCCESS',
      email_attempted: null,
      ip_address: DEVICE.ipAddress,
      device: DEVICE.userAgent,
    });
  });

  it('writes login_history on the caller transaction, so it rolls back with the session', async () => {
    fake.failWhen = (op) => (op.table === 'login_history' ? new Error('history insert failed') : null);
    await expect(
      fake.transaction().execute((trx) => service.issueSessionForUser(7, 'u-7', 'ACTIVE', DEVICE, trx as never)),
    ).rejects.toThrow('history insert failed');
    expect(inserted('refresh_tokens')).toHaveLength(0);
    expect(fake.rolledBack.map((op) => op.table)).toContain('refresh_tokens');
  });

  it('every registration-side login path goes through issueSessionForUser -- no second signer', () => {
    const src = readFileSync(join(__dirname, '../registration/registration.service.ts'), 'utf8');
    expect(src).not.toMatch(/jwtService\.sign/);
    expect(src).not.toMatch(/insertInto\(\s*['"]refresh_tokens['"]/);
    expect(src).toContain('issueSessionForUser(');
  });
});

describe('refresh rotation', () => {
  function scriptRefresh(existingSessionId: string | null) {
    fake.responder = (op) => {
      if (op.kind !== 'select') return undefined;
      if (op.table === 'refresh_tokens') {
        return [{
          id: 5, user_id: 42, session_id: existingSessionId, token_hash: hashRefreshToken('raw'),
          device_label: 'laptop', revoked_at: null, expires_at: new Date(Date.now() + 86_400_000),
        }];
      }
      if (op.table === 'users') return [{ id: 42, uuid: 'u-42', status: 'ACTIVE', force_password_reset: false }];
      return [];
    };
  }

  it('inherits the existing session id on the new refresh token and in the new JWT', async () => {
    const sessionId = '11111111-2222-4333-8444-555555555555';
    scriptRefresh(sessionId);
    const pair = await service.refresh('raw', DEVICE);
    const [newRow] = inserted('refresh_tokens');
    expect(newRow.values!.session_id).toBe(sessionId);
    expect((await decode(pair.accessToken)).sid).toBe(sessionId);
    const chainUpdate = fake.writes('refresh_tokens', 'update').find((op) => op.set && 'replaced_by_token_id' in op.set);
    expect(chainUpdate).toBeDefined();
  });

  it('a pre-migration row with NULL session_id gets a fresh id going forward', async () => {
    scriptRefresh(null);
    const pair = await service.refresh('raw', DEVICE);
    const [newRow] = inserted('refresh_tokens');
    expect(newRow.values!.session_id).toMatch(UUID_RE);
    expect((await decode(pair.accessToken)).sid).toBe(newRow.values!.session_id);
  });
});

describe('AccessTokenGuard', () => {
  it('exposes sid on request.user from the signature-verified JWT with no DB lookup', async () => {
    const pair = await service.issueSessionForUser(9, 'u-9', 'ACTIVE', DEVICE);
    const selectsBefore = fake.selects.length;
    const request: { headers: Record<string, string>; user?: AccessTokenPayload } = {
      headers: { authorization: `Bearer ${pair.accessToken}` },
    };
    const guard = new AccessTokenGuard(jwt);
    const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user!.sid).toBe(inserted('refresh_tokens')[0].values!.session_id);
    expect(fake.selects.length).toBe(selectsBefore);
  });
});

// ── Every authentication mechanism in the repository ─────────────────────
//
// Each successful authentication must yield one coherent session:
//   session_id -> refresh_tokens -> login_history(SUCCESS) -> JWT sid.
// Runs the real RegistrationService/AuthService; only the DB is faked.

describe('coherent session provenance for every authentication mechanism', () => {
  const FUTURE = new Date(Date.now() + 3_600_000);
  const userRow = (id: number, extra: Record<string, unknown> = {}) => ({
    id, uuid: `u-${id}`, email: `user${id}@example.com`, phone: null, full_name: 'Test User',
    status: 'ACTIVE', registration_method: 'EMAIL_PASSWORD', email_verified_at: null,
    phone_verified_at: null, force_password_reset: false, created_at: '2026-09-27', ...extra,
  });

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

  // Newly created users get the fake's next insert id; toPublicUser() then
  // reads them back by id.
  const anyUserById = (id = 1000) => ({ id: [userRow(id)] });

  async function expectCoherentSession(tokens: { accessToken: string }, userId: number) {
    const refresh = inserted('refresh_tokens');
    const history = inserted('login_history');
    expect(refresh).toHaveLength(1);
    const sessionId = refresh[0].values!.session_id;
    expect(sessionId).toMatch(UUID_RE);
    expect(history).toHaveLength(1);
    expect(history[0].values).toMatchObject({
      user_id: userId, session_id: sessionId, status: 'SUCCESS',
      ip_address: DEVICE.ipAddress, device: DEVICE.userAgent,
    });
    expect((await decode(tokens.accessToken)).sid).toBe(sessionId);
    return { refresh: refresh[0], history: history[0] };
  }

  it('password login (AuthService.login)', async () => {
    const passwordHash = await argon2.hash('pw-123456');
    script({ users: { email: [userRow(42, { password_hash: passwordHash })] } });
    const tokens = await service.login('user42@example.com', 'pw-123456', DEVICE);
    const { history } = await expectCoherentSession(tokens, 42);
    expect(history.values!.email_attempted).toBe('user42@example.com');
  });

  it('email/password registration auto-login', async () => {
    script({ users: { email: [], ...anyUserById() } });
    const { tokens, user } = await registration.registerWithEmailPassword(
      { email: 'new@example.com', password: 'pw-123456', firstName: 'New', lastName: 'User' } as never,
      DEVICE,
    );
    await expectCoherentSession(tokens, user.id);
  });

  it('phone OTP registration', async () => {
    const previous = process.env.PHONE_OTP_ENABLED;
    process.env.PHONE_OTP_ENABLED = 'true';
    try {
      script({
        otp_codes: { phone: [{ id: 5, phone: '9876543210', code_hash: hashToken('123456'), attempt_count: 0, expires_at: FUTURE }] },
        users: { phone: [], ...anyUserById() },
      });
      const { tokens, user } = await registration.verifyPhoneOtpAndRegister(
        { phone: '9876543210', code: '123456', fullName: 'Phone User' } as never,
        DEVICE,
      );
      await expectCoherentSession(tokens, user.id);
    } finally {
      process.env.PHONE_OTP_ENABLED = previous;
    }
  });

  it('OAuth: already-linked account', async () => {
    script({
      auth_identities: { provider: [{ user_id: 42, provider: 'GOOGLE', provider_user_id: 'g-1' }] },
      users: { id: [userRow(42)] },
    });
    const { tokens } = await registration.registerOrLoginWithSocial(
      { provider: 'GOOGLE', providerUserId: 'g-1', email: 'user42@example.com', fullName: 'X' } as never,
      DEVICE,
    );
    await expectCoherentSession(tokens, 42);
  });

  it('OAuth: link to an existing account by email', async () => {
    script({ auth_identities: { provider: [] }, users: { email: [userRow(43)] } });
    const { tokens } = await registration.registerOrLoginWithSocial(
      { provider: 'GOOGLE', providerUserId: 'g-2', email: 'user43@example.com', fullName: 'X' } as never,
      DEVICE,
    );
    await expectCoherentSession(tokens, 43);
  });

  it('OAuth: new account -- session and login_history commit in the sign-up transaction', async () => {
    script({ auth_identities: { provider: [] }, users: { email: [], ...anyUserById() } });
    const { tokens, user } = await registration.registerOrLoginWithSocial(
      { provider: 'GOOGLE', providerUserId: 'g-3', email: 'new3@example.com', fullName: 'X' } as never,
      DEVICE,
    );
    const { refresh, history } = await expectCoherentSession(tokens, user.id);
    expect(refresh.txId).not.toBeNull();
    expect(history.txId).toBe(refresh.txId);
    expect(fake.writes('users', 'insert')[0].txId).toBe(refresh.txId);
  });

  it('magic link: existing account', async () => {
    script({
      magic_links: { token_hash: [{ id: 9, email: 'user44@example.com', consumed_at: null, expires_at: FUTURE }] },
      users: { email: [userRow(44)] },
    });
    const { tokens } = await registration.consumeMagicLink({ token: 'tok' } as never, DEVICE);
    await expectCoherentSession(tokens, 44);
  });

  it('magic link: new account', async () => {
    script({
      magic_links: { token_hash: [{ id: 9, email: 'fresh@example.com', consumed_at: null, expires_at: FUTURE }] },
      users: { email: [], ...anyUserById() },
    });
    const { tokens, user } = await registration.consumeMagicLink({ token: 'tok' } as never, DEVICE);
    await expectCoherentSession(tokens, user.id);
  });

  it('invitation acceptance', async () => {
    script({
      invitations: { token_hash: [{ id: 3, email: 'invited@example.com', invited_by: 1, consumed_at: null, expires_at: FUTURE }] },
      users: { email: [], ...anyUserById() },
    });
    const { tokens, user } = await registration.acceptInvitation(
      { token: 'inv', password: 'pw-123456', fullName: 'Invited' } as never,
      DEVICE,
    );
    await expectCoherentSession(tokens, user.id);
  });

  it('refresh rotation is not a new authentication -- no login_history row, same session', async () => {
    const sessionId = '22222222-3333-4444-8555-666666666666';
    script({
      refresh_tokens: {
        token_hash: [{
          id: 5, user_id: 42, session_id: sessionId, token_hash: hashRefreshToken('raw'),
          device_label: null, revoked_at: null, expires_at: new Date(Date.now() + 86_400_000),
        }],
      },
      users: { id: [userRow(42)] },
    });
    const pair = await service.refresh('raw', DEVICE);
    expect(inserted('login_history')).toHaveLength(0);
    expect(inserted('refresh_tokens')[0].values!.session_id).toBe(sessionId);
    expect((await decode(pair.accessToken)).sid).toBe(sessionId);
  });
});
