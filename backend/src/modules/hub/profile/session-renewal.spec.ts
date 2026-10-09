// Profile editor -- expired access token (production report, Narendra Bhojraj):
// "Save failed -- Profile / Social links / Equipment / Awards: Invalid or
// expired access token".
//
// Root cause: HubLayout renews the 15-minute access token only at page load;
// the editor's own apiFetch never renewed it, so after a long editing session
// all four parallel PUTs hit AccessTokenGuard with the stale token and returned
// the same 401, which saveAll() printed once per section.
//
// Executes the real frontend code (same pattern as profile-save-guard.spec.ts).

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const FRONTEND = join(__dirname, '../../../../../frontend/src');
const read = (rel: string) => readFileSync(join(FRONTEND, rel), 'utf8');

type Lib = typeof import('../../../../../frontend/src/lib/authed-fetch');
const lib: Lib = (() => {
  const js = ts.transpileModule(read('lib/authed-fetch.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports as unknown as Lib;
})();
const { createAuthedFetch, SessionExpiredError } = lib;

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const flush = () => new Promise((r) => setImmediate(r));

// Fake server: accepts only AT1; AT0 is expired. /auth/refresh rotates.
function harness(opts: { refreshStatus?: number; refreshToken?: string | null; delayRefresh?: boolean } = {}) {
  const store = { at: 'AT0', rt: opts.refreshToken === undefined ? 'RT0' : opts.refreshToken };
  let valid = 'AT1';
  let refreshCalls = 0;
  let cleared = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const calls: string[] = [];
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/auth/refresh') {
      refreshCalls++;
      if (opts.delayRefresh) await gate;
      const status = opts.refreshStatus ?? 200;
      return status === 200 ? res(200, { accessToken: 'AT1', refreshToken: `RT${refreshCalls}` }) : res(status);
    }
    const auth = (init?.headers as Record<string, string>).Authorization;
    calls.push(`${init?.method ?? 'GET'} ${url} ${auth}`);
    if (url.endsWith('/forbidden')) return res(403, { message: 'Missing required permission' });
    return auth === `Bearer ${valid}` ? res(200, { ok: true }) : res(401, { message: 'Invalid or expired access token' });
  });
  const authed = createAuthedFetch({
    fetch: fetchImpl as unknown as (u: string, i?: RequestInit) => Promise<Response>,
    getToken: () => store.at,
    getRefreshToken: () => store.rt,
    storeTokens: (a, r) => { store.at = a; store.rt = r; },
    clearAuth: () => { cleared++; store.at = ''; store.rt = null; },
  });
  return {
    authed, store, calls, release,
    get refreshCalls() { return refreshCalls; },
    get cleared() { return cleared; },
    setValid: (t: string) => { valid = t; },
  };
}

describe('authedFetch', () => {
  it('a valid token is used as-is: no refresh, no retry', async () => {
    const h = harness(); h.store.at = 'AT1';
    const r = await h.authed('/api/v1/hub/profile', { method: 'PUT' });
    expect(r.status).toBe(200);
    expect(h.refreshCalls).toBe(0);
    expect(h.calls).toEqual(['PUT /api/v1/hub/profile Bearer AT1']);
  });

  it('an expired access token is renewed once and the request retried with the new token', async () => {
    const h = harness();
    const r = await h.authed('/api/v1/hub/profile', { method: 'PUT', body: '{}' });
    expect(r.status).toBe(200);
    expect(h.refreshCalls).toBe(1);
    expect(h.store).toMatchObject({ at: 'AT1', rt: 'RT1' });
    expect(h.calls).toEqual(['PUT /api/v1/hub/profile Bearer AT0', 'PUT /api/v1/hub/profile Bearer AT1']);
  });

  it('four concurrent 401s share ONE refresh (rotation reuse would revoke every session)', async () => {
    const h = harness({ delayRefresh: true });
    const all = Promise.all(['', '/social', '/gear', '/distinctions'].map((p) => h.authed(`/api/v1/hub/profile${p}`, { method: 'PUT' })));
    await flush();
    expect(h.refreshCalls).toBe(1);
    h.release();
    const out = await all;
    expect(out.map((o) => o.status)).toEqual([200, 200, 200, 200]);
    expect(h.refreshCalls).toBe(1);
    expect(h.store.at).toBe('AT1');
  });

  it('a 401 for a token another caller/tab already replaced retries with the stored token, no refresh', async () => {
    let reads = 0;
    const authed = createAuthedFetch({
      fetch: (async (_u: string, i?: RequestInit) =>
        ((i?.headers as Record<string, string>).Authorization === 'Bearer AT1' ? res(200) : res(401))) as never,
      getToken: () => (reads++ === 0 ? 'OLD' : 'AT1'),
      getRefreshToken: () => { throw new Error('must not refresh'); },
      storeTokens: () => undefined,
      clearAuth: () => undefined,
    });
    expect((await authed('/b')).status).toBe(200);
  });

  it('a recoverable 401 is retried at most once: a second 401 is returned, no loop', async () => {
    const h = harness(); h.setValid('NEVER');
    const r = await h.authed('/api/v1/hub/profile', { method: 'PUT' });
    expect(r.status).toBe(401);
    expect(h.refreshCalls).toBe(1);
    expect(h.calls).toHaveLength(2);
  });

  it.each([401, 403])('a refresh the server rejects (%s) -> SessionExpiredError, tokens cleared, request not retried', async (status) => {
    const h = harness({ refreshStatus: status });
    await expect(h.authed('/api/v1/hub/profile', { method: 'PUT' })).rejects.toBeInstanceOf(SessionExpiredError);
    expect(h.cleared).toBe(1);
    expect(h.calls).toHaveLength(1);
  });

  it('no stored refresh token -> SessionExpiredError', async () => {
    const h = harness({ refreshToken: null });
    await expect(h.authed('/x')).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('a 5xx refresh failure keeps the stored tokens (not a dead session)', async () => {
    const h = harness({ refreshStatus: 503 });
    const err = await h.authed('/x').catch((e) => e);
    expect(err).not.toBeInstanceOf(SessionExpiredError);
    expect(h.cleared).toBe(0);
    expect(h.store.rt).toBe('RT0');
  });

  it('403 (authorization) is returned untouched: never treated as token expiry', async () => {
    const h = harness();
    const r = await h.authed('/api/v1/forbidden');
    expect(r.status).toBe(403);
    expect(h.refreshCalls).toBe(0);
    expect(h.calls).toHaveLength(1);
  });

  it('after a failed renewal the next call can renew again (state not stuck)', async () => {
    const h = harness({ refreshStatus: 503 });
    await h.authed('/x').catch(() => undefined);
    h.store.at = 'AT1';
    expect((await h.authed('/x')).status).toBe(200);
  });
});

describe('profile page wiring', () => {
  const PAGE = read('pages/hub/profile/index.astro');
  const START = PAGE.indexOf("const API = '/api/v1/hub/profile';");
  const MAIN = PAGE.slice(START, PAGE.indexOf('</script>', START));

  it('apiFetch is the renewing client, not a bare fetch', () => {
    expect(MAIN).toContain('const apiFetch = createAuthedFetch({');
    expect(MAIN).not.toMatch(/async function apiFetch/);
  });

  describe('saveAll()', () => {
    const fnSrc = MAIN.match(/async function saveAll\(\)[\s\S]*?\r?\n\}\r?\n/)![0];
    const js = ts.transpileModule(fnSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

    function run(apiImpl: (url: string) => Promise<Response>) {
      const form: Record<string, string> = { 'field-tagline': 'My tagline' };
      const apiFetch = jest.fn(async (url: string) => apiImpl(url));
      const setStatus = jest.fn();
      const showSessionExpired = jest.fn();
      const dirty = new Set<string>(['main']);
      const deps = {
        document: { getElementById: () => ({ disabled: false, hidden: false }), querySelectorAll: () => [] },
        profileGate: { canSave: () => true },
        bioOverLimit: () => false,
        apiFetch, setStatus, showSessionExpired, SessionExpiredError,
        API: '/api/v1/hub/profile',
        getInp: (id: string) => form[id] ?? '',
        getSel: () => '',
        getTxtArea: () => '',
        getSelectedLayout: () => 'justified',
        chipData: { areasOfExpertise: [], favouriteSubjects: [], bodies: [], lenses: [], drones: [], otherGear: [] },
        selectedGenres: [],
        dirty,
        loadCompletion: async () => undefined,
      };
      const names = Object.keys(deps);
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const saveAll = new Function(...names, `${js}; return saveAll;`)(...names.map((n) => (deps as any)[n])) as () => Promise<void>;
      return { saveAll, apiFetch, setStatus, showSessionExpired, dirty, form };
    }

    it('all four sections save after successful authentication', async () => {
      const t = run(async () => res(200, {}));
      await t.saveAll();
      expect(t.apiFetch).toHaveBeenCalledTimes(4);
      expect(t.setStatus).toHaveBeenLastCalledWith('All changes saved');
      expect(t.dirty.size).toBe(0);
    });

    it('a dead session yields ONE session-expired outcome, not four section errors; edits kept', async () => {
      const t = run(async () => { throw new SessionExpiredError(); });
      await t.saveAll();
      expect(t.showSessionExpired).toHaveBeenCalledTimes(1);
      expect(t.setStatus).not.toHaveBeenCalledWith(expect.stringMatching(/Save failed/), expect.anything());
      expect(t.dirty.has('main')).toBe(true);
      expect(t.form['field-tagline']).toBe('My tagline');
    });

    it('a 403 on a section is reported as that section, not as session expiry', async () => {
      const t = run(async (url) => (url.endsWith('/gear') ? res(403, { message: 'Forbidden' }) : res(200, {})));
      await t.saveAll();
      expect(t.showSessionExpired).not.toHaveBeenCalled();
      expect(t.setStatus).toHaveBeenCalledWith('Save failed — Equipment: Forbidden', 'ob-status--error');
    });

    it('a network failure keeps the generic retry message', async () => {
      const t = run(async () => { throw new TypeError('Failed to fetch'); });
      await t.saveAll();
      expect(t.setStatus).toHaveBeenCalledWith('Network error — try again', 'ob-status--error');
    });
  });
});
