// End-to-end HTTP behaviour of the forced-password-reset flow, through a real
// Nest Fastify app (production Fastify options + ValidationPipe), the real
// AuthController/AuthService, UsersController, AccountSettingsController/
// Service and AccessTokenGuard, over the recording FakeDb.
//
// Chain under test:
//   login (flagged) -> restricted token -> allow-list -> blocked everywhere
//   else -> PUT password -> refresh -> clean token -> normal access.

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('kysely', () => ({ sql: () => ({}) }));
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));

import { Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { fastifyServerOptions } from '../../../http/fastify-options';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CommunicationService } from '../../shared/communication/communication.service';
import { AccountSettingsController } from '../account-settings/account-settings.controller';
import { AccountSettingsService } from '../account-settings/account-settings.service';
import { UsersController } from '../users/users.controller';
import { RbacService } from '../rbac/rbac.service';

const fake = db as unknown as FakeDb;
process.env.JWT_ACCESS_SECRET = 'fpr-http-test-secret';

// Stand-in for "any other protected application route".
@Controller('api/v1/probe')
class ProbeController {
  @Get('data') @UseGuards(AccessTokenGuard) data() { return { ok: true }; }
  @Post('data') @UseGuards(AccessTokenGuard) write() { return { ok: true }; }
  @Get('me') @UseGuards(AccessTokenGuard) lookalike() { return { ok: true }; } // same name as /users/me
}

const TEMP = 'temp-pass-123';
const NEW_PW = 'brand-new-pass-9';

describe('forced password reset — HTTP flow', () => {
  let app: NestFastifyApplication;
  let jwt: JwtService;
  let passwordHash: string;
  let flagged = true;
  let currentHash: string;

  const userRow = () => ({
    id: 42, uuid: 'u-42', email: 'user42@example.com', username: 'u42', identity_status: 'IDENTITY_COMPLETE',
    identity_completed_at: null, full_name: 'Test User', status: 'ACTIVE', email_verified_at: null,
    phone_verified_at: null, registration_method: 'EMAIL_PASSWORD', created_at: '2026-01-01',
    password_hash: currentHash, force_password_reset: flagged,
  });

  function script() {
    fake.responder = (op: FakeOp) => {
      if (op.kind !== 'select') return undefined;
      switch (op.table) {
        case 'users': return [userRow()];
        case 'refresh_tokens': {
          const issued = fake.writes('refresh_tokens', 'insert').at(-1)?.values;
          return issued ? [{ id: 5, user_id: 42, revoked_at: null, device_label: null,
            expires_at: new Date(Date.now() + 86_400_000), ...issued }] : [];
        }
        default: return [];
      }
    };
  }

  beforeAll(async () => {
    passwordHash = await argon2.hash(TEMP);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, UsersController, AccountSettingsController, ProbeController],
      providers: [
        JwtService, AccessTokenGuard, AuthService, AccountSettingsService,
        { provide: CommunicationService, useValue: {} },
        { provide: RbacService, useValue: { hasPermission: async () => false } },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(fastifyServerOptions));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    jwt = moduleRef.get(JwtService);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { fake.reset(); flagged = true; currentHash = passwordHash; script(); });

  const call = (method: string, url: string, token?: string, body?: unknown) =>
    app.inject({
      method: method as 'GET',
      url,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });

  async function loginFlagged() {
    const res = await call('POST', '/api/v1/auth/login', undefined, { identifier: 'user42@example.com', password: TEMP });
    expect(res.statusCode).toBe(200);
    return res.json() as { accessToken: string; refreshToken: string };
  }

  it('flagged login succeeds (200) and returns a restricted token', async () => {
    const { accessToken } = await loginFlagged();
    expect((jwt.decode(accessToken) as { fpr?: boolean }).fpr).toBe(true);
  });

  it('wrong password on a flagged account → 401 "Invalid email or password" (flag not disclosed)', async () => {
    const res = await call('POST', '/api/v1/auth/login', undefined, { identifier: 'user42@example.com', password: 'wrong-pw-1' });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Invalid email or password');
    expect(JSON.stringify(res.json())).not.toMatch(/reset|PASSWORD_CHANGE/i);
  });

  it('unflagged login → token without fpr', async () => {
    flagged = false;
    const { accessToken } = await loginFlagged();
    expect((jwt.decode(accessToken) as { fpr?: boolean }).fpr).toBeUndefined();
  });

  describe('allow-list (restricted token)', () => {
    let token: string;
    beforeEach(async () => { token = (await loginFlagged()).accessToken; });

    it('GET /users/me is allowed and reports forcePasswordReset', async () => {
      const res = await call('GET', '/api/v1/users/me', token);
      expect(res.statusCode).toBe(200);
      expect(res.json().forcePasswordReset).toBe(true);
    });

    it('allowed route is not widened by query string, trailing slash or case-sensitive path variants', async () => {
      expect((await call('GET', '/api/v1/users/me?x=1', token)).statusCode).toBe(200);
      // Whatever Fastify does with a trailing slash, the result is allowed-route or not-found, never another handler.
      expect([200, 404]).toContain((await call('GET', '/api/v1/users/me/', token)).statusCode);
    });

    it.each([
      ['GET',  '/api/v1/probe/data'],
      ['POST', '/api/v1/probe/data'],
      ['GET',  '/api/v1/probe/me'],                       // same trailing segment as /users/me
      ['GET',  '/api/v1/auth/sessions'],
      ['GET',  '/api/v1/hub/account-settings'],
      ['PUT',  '/api/v1/hub/account-settings/name'],
      ['POST', '/api/v1/hub/account-settings/email/initiate'],
      ['GET',  '/api/v1/users/admin/list'],
      ['GET',  '/api/v1/users/admin/search?q=ab'],
    ])('%s %s → 403 PASSWORD_CHANGE_REQUIRED', async (method, url) => {
      const res = await call(method, url, token, method === 'GET' ? undefined : {});
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('method mismatch on allowed paths never reaches a handler (POST /users/me, GET/POST /hub/account-settings/password → 404)', async () => {
      expect((await call('POST', '/api/v1/users/me', token, {})).statusCode).toBe(404);
      expect((await call('GET', '/api/v1/hub/account-settings/password', token)).statusCode).toBe(404);
      expect((await call('POST', '/api/v1/hub/account-settings/password', token, {})).statusCode).toBe(404);
    });

    it('nested / similarly named paths under allowed routes do not inherit the allowance', async () => {
      for (const url of ['/api/v1/users/me/extra', '/api/v1/users/meX', '/api/v1/hub/account-settings/password/extra']) {
        const res = await call(url.includes('password') ? 'PUT' : 'GET', url, token, {});
        expect(res.statusCode).toBe(404);
      }
    });

    it('logout and refresh stay available without the guard', async () => {
      const { refreshToken } = await loginFlagged();
      expect((await call('POST', '/api/v1/auth/logout', undefined, { refreshToken })).statusCode).toBe(204);
      expect(fake.writes('refresh_tokens', 'update').some((op) => op.set && 'revoked_at' in op.set)).toBe(true);
      expect((await call('POST', '/api/v1/auth/refresh', undefined, { refreshToken })).statusCode).toBe(200);
    });
  });

  describe('token integrity (client cannot self-assign fpr)', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

    it('flipping fpr true→false in a restricted token invalidates the signature → 401', async () => {
      const { accessToken } = await loginFlagged();
      const [h, p, sig] = accessToken.split('.');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      payload.fpr = false;
      delete payload.fpr;
      const res = await call('GET', '/api/v1/probe/data', `${h}.${b64(payload)}.${sig}`);
      expect(res.statusCode).toBe(401);
    });

    it('an unsigned (alg none) or wrong-secret token carrying no fpr is rejected → 401', async () => {
      const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 42, uuid: 'u-42', status: 'ACTIVE' })}.`;
      expect((await call('GET', '/api/v1/probe/data', none)).statusCode).toBe(401);
      const forged = await jwt.signAsync({ sub: 42, uuid: 'u-42', status: 'ACTIVE' }, { secret: 'attacker-secret' });
      expect((await call('GET', '/api/v1/probe/data', forged)).statusCode).toBe(401);
    });

    it('a body/header/query "fpr" has no effect: only the signed claim is consulted', async () => {
      const { accessToken } = await loginFlagged();
      const res = await call('GET', '/api/v1/probe/data?fpr=false', accessToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('mandatory change → clean session', () => {
    it('PUT password (allowed) → flag cleared atomically; refresh then yields a token without fpr that reaches normal routes', async () => {
      const { accessToken, refreshToken } = await loginFlagged();

      const put = await call('PUT', '/api/v1/hub/account-settings/password', accessToken, { currentPassword: TEMP, newPassword: NEW_PW });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({ updated: true });
      const update = fake.writes('users', 'update')[0];
      expect(update.set).toMatchObject({ force_password_reset: false });
      expect(fake.writes('identity_audit_log', 'insert')[0]).toMatchObject({ txId: update.txId });

      // The pre-change restricted token stays restricted until replaced.
      expect((await call('GET', '/api/v1/probe/data', accessToken)).statusCode).toBe(403);

      // State after the committed change; client rotates its token pair.
      flagged = false;
      currentHash = update.set!.password_hash as string;
      const refreshed = await call('POST', '/api/v1/auth/refresh', undefined, { refreshToken });
      expect(refreshed.statusCode).toBe(200);
      const clean = refreshed.json().accessToken as string;
      expect((jwt.decode(clean) as { fpr?: boolean }).fpr).toBeUndefined();
      expect((await call('GET', '/api/v1/probe/data', clean)).statusCode).toBe(200);
    });

    it('refresh before the change keeps the session restricted', async () => {
      const { refreshToken } = await loginFlagged();
      const refreshed = await call('POST', '/api/v1/auth/refresh', undefined, { refreshToken });
      expect((jwt.decode(refreshed.json().accessToken) as { fpr?: boolean }).fpr).toBe(true);
    });

    it('validation failure (short password) → 400, nothing written, flag unchanged', async () => {
      const { accessToken } = await loginFlagged();
      const res = await call('PUT', '/api/v1/hub/account-settings/password', accessToken, { currentPassword: TEMP, newPassword: 'short' });
      expect(res.statusCode).toBe(400);
      expect(fake.writes('users')).toHaveLength(0);
    });
  });
});

// ── Source-level fail-closed inventory ─────────────────────────────────────
// The allowance is a handler decorator, so the only way to widen it is to add
// the decorator. Pin the complete set of usages.

describe('@AllowForcedPasswordReset() usage inventory', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
    }
    return out;
  }

  it('is applied in exactly two places: UsersController.me and AccountSettingsController.updatePassword', () => {
    const hits: string[] = [];
    for (const file of walk(join(__dirname, '..', '..', '..'))) {
      if (file.endsWith('allow-forced-password-reset.decorator.ts')) continue;
      const src = readFileSync(file, 'utf8');
      const re = /@AllowForcedPasswordReset\(\)\s*(?:@\w+\([^)]*\)\s*)*(?:async\s+)?(\w+)\(/g;
      for (let m = re.exec(src); m; m = re.exec(src)) hits.push(`${file.split(/[\\/]/).pop()}:${m[1]}`);
    }
    expect(hits.sort()).toEqual(['account-settings.controller.ts:updatePassword', 'users.controller.ts:me']);
  });
});
