// Hub profile editor -- Save must require a successful profile load.
//
// Audit (2026-10-08, Severity D): loadProfile() silently ignored a failed GET
// (e.g. a 401 while HubLayout was still refreshing an expired token), leaving
// a blank form with Save enabled; saveAll() then sent four replace-style PUTs
// that deleted social links, equipment and user_photo_titles rows.
//
// The frontend has no test runner (see razorpay-checkout-frontend.spec.ts), so
// this follows the established pattern of testing frontend source from here,
// and EXECUTES the real code:
//   - frontend/src/lib/profile-load-gate.ts is transpiled and evaluated;
//   - saveAll() is extracted from the real page, transpiled and run against
//     stubs, so "zero PUTs" is observed, not inferred.

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const FRONTEND = join(__dirname, '../../../../../frontend/src');
const read = (rel: string) => readFileSync(join(FRONTEND, rel), 'utf8');

type GateLib = typeof import('../../../../../frontend/src/lib/profile-load-gate');
const gateLib: GateLib = (() => {
  const js = ts.transpileModule(read('lib/profile-load-gate.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports as unknown as GateLib;
})();
const { createProfileLoadGate, requireProfileBody } = gateLib;

const PAGE = read('pages/hub/profile/index.astro');
const MAIN = PAGE.slice(PAGE.indexOf("const API = '/api/v1/hub/profile';"), PAGE.indexOf('</script>', PAGE.indexOf("const API = '/api/v1/hub/profile';")));

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setImmediate(r));
const response = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function gateWith(over: Partial<Parameters<typeof createProfileLoadGate>[0]> = {}) {
  const states: string[] = [];
  const gate = createProfileLoadGate({
    waitForHub: async () => undefined,
    load: async () => undefined,
    onStateChange: (s) => states.push(s),
    ...over,
  });
  return { gate, states };
}

// ── Gate state machine ─────────────────────────────────────────────────────

describe('profile load gate', () => {
  it('Save is unavailable before any load has succeeded', () => {
    const { gate } = gateWith();
    expect(gate.state).toBe('loading');
    expect(gate.canSave()).toBe(false);
  });

  it('Save stays unavailable while the load is pending', async () => {
    const pending = deferred();
    const { gate } = gateWith({ load: () => pending.promise });
    const run = gate.start();
    await flush();
    expect(gate.state).toBe('loading');
    expect(gate.canSave()).toBe(false);
    pending.resolve();
    await run;
    expect(gate.canSave()).toBe(true);
  });

  it.each([
    ['401', 401],
    ['403', 403],
    ['500', 500],
  ])('a %s profile GET ends in failed, never an empty "loaded" profile', async (_label, status) => {
    const { gate, states } = gateWith({ load: async () => { await requireProfileBody(response(status)); } });
    await gate.start();
    expect(gate.state).toBe('failed');
    expect(gate.canSave()).toBe(false);
    expect(states).toEqual(['loading', 'failed']);
  });

  it('a network failure ends in failed', async () => {
    const { gate } = gateWith({ load: async () => { throw new TypeError('Failed to fetch'); } });
    await gate.start();
    expect(gate.state).toBe('failed');
  });

  it('an unexpected body (not a JSON object) ends in failed', async () => {
    for (const body of [null, [], 'x']) {
      const { gate } = gateWith({ load: async () => { await requireProfileBody(response(200, body)); } });
      await gate.start();
      expect(gate.state).toBe('failed');
    }
  });

  it('a hydration error after a 200 also ends in failed', async () => {
    const { gate } = gateWith({
      load: async () => { await requireProfileBody(response(200, {})); throw new Error('hydrate'); },
    });
    await gate.start();
    expect(gate.canSave()).toBe(false);
  });

  it('a successful load (GET + hydration) enables Save', async () => {
    const hydrated: string[] = [];
    const { gate, states } = gateWith({
      load: async () => { const p = await requireProfileBody(response(200, { fullName: 'A' })); hydrated.push(String(p.fullName)); },
    });
    await gate.start();
    expect(hydrated).toEqual(['A']);
    expect(gate.canSave()).toBe(true);
    expect(states).toEqual(['loading', 'loaded']);
  });

  it('retry after a failure can reach loaded; there is no automatic retry', async () => {
    let calls = 0;
    const { gate, states } = gateWith({
      load: async () => { calls++; if (calls === 1) await requireProfileBody(response(401)); },
    });
    await gate.start();
    await flush();
    expect(gate.state).toBe('failed');
    expect(calls).toBe(1); // nothing retried on its own
    await gate.start(); // user presses Retry
    expect(gate.state).toBe('loaded');
    expect(states).toEqual(['loading', 'failed', 'loading', 'loaded']);
  });

  it('a retry that fails again leaves Save disabled', async () => {
    const { gate } = gateWith({ load: async () => { throw new Error('down'); } });
    await gate.start();
    await gate.start();
    expect(gate.canSave()).toBe(false);
  });

  it('concurrent starts share one attempt', async () => {
    let calls = 0;
    const { gate } = gateWith({ load: async () => { calls++; } });
    await Promise.all([gate.start(), gate.start()]);
    expect(calls).toBe(1);
  });

  it('race: the profile GET waits for HubLayout, and Save opens only after hydration', async () => {
    const hub = deferred();
    const hydration = deferred();
    const order: string[] = [];
    const { gate } = gateWith({
      waitForHub: () => hub.promise.then(() => { order.push('hub-ready'); }),
      load: async () => { order.push('profile-get'); await hydration.promise; order.push('hydrated'); },
    });
    const run = gate.start();
    await flush();
    expect(order).toEqual([]); // no GET with the stale token
    expect(gate.canSave()).toBe(false);
    hub.resolve();
    await flush();
    expect(order).toEqual(['hub-ready', 'profile-get']);
    expect(gate.canSave()).toBe(false); // GET started, not yet hydrated
    hydration.resolve();
    await run;
    expect(order).toEqual(['hub-ready', 'profile-get', 'hydrated']);
    expect(gate.canSave()).toBe(true);
  });
});

// ── saveAll() (real page code, executed) ───────────────────────────────────

describe('saveAll()', () => {
  const fnSrc = MAIN.match(/async function saveAll\(\)[\s\S]*?\r?\n\}\r?\n/)![0];
  const js = ts.transpileModule(fnSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

  function run(canSave: boolean) {
    const apiFetch = jest.fn(async () => response(200, {}));
    const setStatus = jest.fn();
    const buttons: Record<string, { disabled: boolean }> = { 'save-btn': { disabled: !canSave }, 'mobile-save-btn': { disabled: !canSave } };
    const deps = {
      document: { getElementById: (id: string) => buttons[id] ?? null, querySelectorAll: () => [] },
      profileGate: { canSave: () => canSave },
      apiFetch,
      setStatus,
      API: '/api/v1/hub/profile',
      getInp: () => '',
      getSel: () => '',
      getTxtArea: () => '',
      getSelectedLayout: () => 'justified',
      chipData: { areasOfExpertise: [], favouriteSubjects: [], bodies: [], lenses: [], drones: [], otherGear: [] },
      selectedGenres: [],
      dirty: new Set<string>(),
      loadCompletion: async () => undefined,
    };
    const names = Object.keys(deps);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const saveAll = new Function(...names, `${js}; return saveAll;`)(...names.map((n) => (deps as any)[n])) as () => Promise<void>;
    return { saveAll, apiFetch, setStatus, buttons };
  }

  it('before a successful load: sends ZERO requests and reports why', async () => {
    const { saveAll, apiFetch, setStatus, buttons } = run(false);
    await saveAll();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/not loaded/), 'ob-status--error');
    expect(buttons['save-btn'].disabled).toBe(true);
  });

  it('after a failed load (same guard state): still ZERO requests', async () => {
    const { saveAll, apiFetch } = run(false);
    await saveAll();
    await saveAll();
    expect(apiFetch).toHaveBeenCalledTimes(0);
  });

  it('after a successful load: issues the existing four PUTs unchanged', async () => {
    const { saveAll, apiFetch, buttons } = run(true);
    await saveAll();
    const calls = apiFetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'PUT /api/v1/hub/profile',
      'PUT /api/v1/hub/profile/social',
      'PUT /api/v1/hub/profile/gear',
      'PUT /api/v1/hub/profile/distinctions',
    ]);
    expect(buttons['save-btn'].disabled).toBe(false);
    expect(buttons['mobile-save-btn'].disabled).toBe(false);
  });
});

// ── Page wiring (real source) ──────────────────────────────────────────────

describe('profile page wiring', () => {
  it('both Save buttons start disabled and the status starts as loading', () => {
    expect(PAGE).toMatch(/<button class="ob-save-btn" id="save-btn" type="button" disabled>/);
    expect(PAGE).toMatch(/<button class="mobile-save-btn" id="mobile-save-btn" type="button" disabled>/);
    expect(PAGE).toMatch(/<span class="ob-status ob-status--saving" id="ph-status">Loading profile…<\/span>/);
    expect(PAGE).toMatch(/<button class="ob-retry-btn" id="ph-retry" type="button" hidden>Retry<\/button>/);
  });

  it('saveAll() checks the gate before anything else', () => {
    const body = MAIN.slice(MAIN.indexOf('async function saveAll()'));
    const guard = body.indexOf('if (!profileGate.canSave())');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('apiFetch('));
    expect(guard).toBeLessThan(body.indexOf("getElementById('save-btn')"));
  });

  it('loadProfile() throws on failure instead of returning silently', () => {
    const fn = MAIN.slice(MAIN.indexOf('async function loadProfile()'), MAIN.indexOf('async function loadProfile()') + 400);
    expect(fn).toContain('requireProfileBody(await apiFetch(API))');
    expect(fn).not.toMatch(/if \(!res\.ok\) return;/);
  });

  it('boot and retry go through the gate, which waits for HubLayout', () => {
    expect(MAIN).not.toMatch(/^loadProfile\(\)\.catch/m);
    expect(MAIN).toMatch(/^void profileGate\.start\(\);/m);
    expect(MAIN).toContain("getElementById('ph-retry')?.addEventListener('click', () => { void profileGate.start(); });");
    expect(MAIN).toContain('waitForHub: () => whenHubAuthenticated(),');
    expect(PAGE).toContain("import { whenHubAuthenticated } from '../../../lib/distinctions-admin';");
  });

  it('Save buttons are enabled only in the loaded state; Retry shows only on failure', () => {
    const fn = MAIN.slice(MAIN.indexOf('function applyProfileLoadState'), MAIN.indexOf('const profileGate'));
    expect(fn).toContain("const saveEnabled = state === 'loaded';");
    expect(fn).toContain('btn.disabled = !saveEnabled;');
    expect(fn).toContain("retry.hidden = state !== 'failed';");
  });

  it('no new token refresh is introduced', () => {
    for (const src of [MAIN, read('lib/profile-load-gate.ts')]) {
      expect(src).not.toContain('/auth/refresh');
      expect(src).not.toContain('bcc_refresh');
    }
  });
});
