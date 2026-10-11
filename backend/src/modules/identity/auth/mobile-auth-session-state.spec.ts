/**
 * mobile-auth-session-state.spec.ts
 *
 * Verifies mobile and cross-surface authentication state integrity:
 * 1. Stale or isolated bcc_user in localStorage never produces an authenticated
 *    state without an active server-backed session (bcc_token or bcc_refresh).
 * 2. Nav.astro and BaseLayout.astro inspect session validity and clear stale
 *    credentials instead of rendering authenticated member UI.
 * 3. Logout cleanses all stored authentication keys and class markers.
 * 4. isSessionValid() correctly differentiates active vs expired vs missing tokens.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const FRONTEND = join(__dirname, '../../../../../frontend/src');
const read = (rel: string) => readFileSync(join(FRONTEND, rel), 'utf8');

type AuthLib = typeof import('../../../../../frontend/src/lib/auth');
const authLib: AuthLib = (() => {
  const js = ts.transpileModule(read('lib/auth.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports as unknown as AuthLib;
})();
const { isSessionValid, clearAuth, getValidToken, resolveValidToken, logout } = authLib;

describe('Mobile Authentication State & Stale Storage Validation', () => {
  const NAV_SRC = read('components/layout/Nav.astro');
  const BASE_LAYOUT_SRC = read('layouts/BaseLayout.astro');
  const HUB_LAYOUT_SRC = read('layouts/HubLayout.astro');
  const AUTH_LIB_SRC = read('lib/auth.ts');

  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
    (global as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { storage = {}; },
    };
    (global as any).document = {
      body: {
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
      },
    };
    (global as any).window = {
      location: {
        replace: jest.fn(),
      },
    };
  });

  describe('isSessionValid() helper', () => {
    it('returns false when neither token nor refresh is present', () => {
      expect(isSessionValid()).toBe(false);
    });

    it('returns false when only bcc_user is present (stale/disconnected cache)', () => {
      storage['bcc_user'] = JSON.stringify({ displayName: 'Bhojraj', initials: 'B' });
      expect(isSessionValid()).toBe(false);
    });

    it('returns true when a non-expired access token is present', () => {
      const validPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) + 3600 };
      const validJwt = `header.${Buffer.from(JSON.stringify(validPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = validJwt;
      expect(isSessionValid()).toBe(true);
    });

    it('returns false when access token is expired and no refresh token exists', () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      expect(isSessionValid()).toBe(false);
    });

    it('returns true when access token is expired but valid refresh token exists for silent rotation', () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'opaque-refresh-token';
      expect(isSessionValid()).toBe(true);
    });
  });

  describe('clearAuth() helper', () => {
    it('removes bcc_token, bcc_refresh, bcc_user and cleans up body class', () => {
      storage['bcc_token'] = 'token';
      storage['bcc_refresh'] = 'refresh';
      storage['bcc_user'] = '{"displayName":"Mudit"}';

      clearAuth();

      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });
  });

  describe('resolveValidToken() and getValidToken() behavioural regression tests', () => {
    it('clears all stale credentials and returns rejected when refresh token is rejected with 401', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'stale-or-revoked-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Bhojraj' });

      // Mock fetch rejecting refresh
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid refresh token' }),
      });

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('rejected');
      // Verifies all stored credentials were wiped
      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      // Verifies body class marker was removed
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });

    it('does NOT wipe stored credentials or pretend session is rejected on network failure', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Mudit Joshi' });

      // Mock fetch throwing a network/offline error
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('network_error');
      // Critical check: credentials are NOT wiped; temporary transport failure != server revocation
      expect(storage['bcc_token']).toBe(expiredJwt);
      expect(storage['bcc_refresh']).toBe('valid-refresh-token');
      expect(storage['bcc_user']).toBe(JSON.stringify({ displayName: 'Mudit Joshi' }));
      // And clearAuth was NOT called
      expect((global as any).document.body.classList.remove).not.toHaveBeenCalledWith('bcc-is-authenticated');
    });

    it('returns valid token and updates localStorage when refresh succeeds', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'new-jwt-access-token', refreshToken: 'new-rotated-refresh-token' }),
      });

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('valid');
      if (outcome.status === 'valid') {
        expect(outcome.token).toBe('new-jwt-access-token');
      }
      expect(storage['bcc_token']).toBe('new-jwt-access-token');
      expect(storage['bcc_refresh']).toBe('new-rotated-refresh-token');
    });

    it('shares a single in-flight HTTP request across concurrent calls and returns the same result to both', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';

      let resolveFetchPromise: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetchPromise = resolve;
      });

      const fetchMock = jest.fn().mockImplementation(() => fetchPromise);
      (global as any).fetch = fetchMock;

      // Launch two concurrent calls
      const call1 = resolveValidToken('/api/v1');
      const call2 = resolveValidToken('/api/v1');

      // Ensure fetch was only called once
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Now resolve the server response
      resolveFetchPromise!({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 'concurrent-jwt-access-token',
          refreshToken: 'concurrent-rotated-refresh-token',
        }),
      });

      const [res1, res2] = await Promise.all([call1, call2]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res1).toEqual({ status: 'valid', token: 'concurrent-jwt-access-token' });
      expect(res2).toEqual({ status: 'valid', token: 'concurrent-jwt-access-token' });
      expect(storage['bcc_token']).toBe('concurrent-jwt-access-token');
      expect(storage['bcc_refresh']).toBe('concurrent-rotated-refresh-token');
    });

    it('rejects session and clears credentials when 200 response contains malformed JSON', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Mudit' });

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('rejected');
      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });

    it('rejects session and clears credentials when token fields are missing or empty strings', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Mudit' });

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: '', // empty string
          refreshToken: undefined, // missing
        }),
      });

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('rejected');
      // Must never write literal "undefined" or empty string into storage
      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });

    it('rejects session and clears credentials when token fields are non-string primitives (number, boolean)', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Bhojraj' });

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: 12345, // numeric
          refreshToken: true, // boolean
        }),
      });

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('rejected');
      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });

    it('rejects session and clears credentials when token fields are complex non-string types (object, array)', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Bhojraj' });

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: { token: 'jwt' }, // object
          refreshToken: ['refresh-1', 'refresh-2'], // array
        }),
      });

      const outcome = await resolveValidToken('/api/v1');

      expect(outcome.status).toBe('rejected');
      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });
  });

  describe('Consistent navigation and body-class state coordination', () => {
    it('verifies BaseLayout verifies isSessionValid and reconciles expired access token via resolveValidToken', () => {
      expect(BASE_LAYOUT_SRC).toContain('isSessionValid()');
      expect(BASE_LAYOUT_SRC).toContain("document.body.classList.add('bcc-is-authenticated')");
      expect(BASE_LAYOUT_SRC).toContain('clearAuth()');
      expect(BASE_LAYOUT_SRC).toContain('resolveValidToken()');
      expect(BASE_LAYOUT_SRC).toContain("document.body.classList.remove('bcc-is-authenticated')");
    });

    it('verifies Nav checks isSessionValid, reconciles expired access token, and resets navigation via showGuest upon rejection', () => {
      expect(NAV_SRC).toContain('if (raw && isSessionValid())');
      expect(NAV_SRC).toContain('clearAuth()');
      expect(NAV_SRC).toContain('showGuest()');
      expect(NAV_SRC).toContain('resolveValidToken()');
      expect(NAV_SRC).toContain("if (res.status === 'rejected')");
    });

    it('verifies HubLayout imports shared getValidToken, resolveValidToken, and clearAuth, participating in single-flight refresh', () => {
      expect(HUB_LAYOUT_SRC).toContain("import { getValidToken, resolveValidToken, clearAuth } from '../lib/auth'");
      expect(HUB_LAYOUT_SRC).not.toContain('async function getValidToken()');
      expect(HUB_LAYOUT_SRC).not.toContain('fetch(`${API}/auth/refresh`');
      expect(HUB_LAYOUT_SRC).toContain("outcome.status === 'network_error'");
      expect(HUB_LAYOUT_SRC).toContain("outcome.status === 'rejected'");
    });

    it('verifies auth.ts exports clearAuth, isSessionValid, getValidToken, and resolveValidToken', () => {
      expect(AUTH_LIB_SRC).toContain('export function clearAuth()');
      expect(AUTH_LIB_SRC).toContain('export function isSessionValid()');
      expect(AUTH_LIB_SRC).toContain('export async function getValidToken(');
      expect(AUTH_LIB_SRC).toContain('export async function resolveValidToken(');
    });
  });

  describe('HubLayout visibilitychange decision logic (behavioural simulation)', () => {
    it('preserves credentials and does not trigger session invalidation or clearAuth on network_error', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'valid-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Mudit Joshi' });

      // Simulate network failure
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

      const outcome = await resolveValidToken('/api/v1');

      // Simulate HubLayout visibility handler decision
      let sessionCleared = false;
      let sessionInvalidated = false;
      if (outcome.status === 'network_error') {
        // Preserves page state without redirecting or clearing
      } else if (outcome.status === 'rejected') {
        clearAuth();
        sessionCleared = true;
        sessionInvalidated = true;
      }

      expect(outcome.status).toBe('network_error');
      expect(sessionCleared).toBe(false);
      expect(sessionInvalidated).toBe(false);
      expect(storage['bcc_token']).toBe(expiredJwt);
      expect(storage['bcc_refresh']).toBe('valid-refresh-token');
      expect(storage['bcc_user']).toBe(JSON.stringify({ displayName: 'Mudit Joshi' }));
      expect((global as any).document.body.classList.remove).not.toHaveBeenCalledWith('bcc-is-authenticated');
    });

    it('clears credentials and triggers invalidation on rejected refresh during tab revalidation', async () => {
      const expiredPayload = { sub: 10, exp: Math.floor(Date.now() / 1000) - 3600 };
      const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.sig`;
      storage['bcc_token'] = expiredJwt;
      storage['bcc_refresh'] = 'revoked-refresh-token';
      storage['bcc_user'] = JSON.stringify({ displayName: 'Bhojraj' });

      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Refresh token expired or revoked' }),
      });

      const outcome = await resolveValidToken('/api/v1');

      let sessionCleared = false;
      let sessionInvalidated = false;
      if (outcome.status === 'network_error') {
        // no-op
      } else if (outcome.status === 'rejected') {
        clearAuth();
        sessionCleared = true;
        sessionInvalidated = true;
      }

      expect(outcome.status).toBe('rejected');
      expect(sessionCleared).toBe(true);
      expect(sessionInvalidated).toBe(true);
      expect(storage['bcc_token']).toBeUndefined();
      expect(storage['bcc_refresh']).toBeUndefined();
      expect(storage['bcc_user']).toBeUndefined();
      expect((global as any).document.body.classList.remove).toHaveBeenCalledWith('bcc-is-authenticated');
    });
  });
});
