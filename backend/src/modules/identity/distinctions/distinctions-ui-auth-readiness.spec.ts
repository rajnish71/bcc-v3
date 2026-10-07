// Photographic Distinctions UI -- HubLayout authentication-readiness race.
//
// The frontend has no test runner (see razorpay-checkout-frontend.spec.ts),
// so this follows the established pattern of testing frontend source from
// here. Unlike a pure static check it also EXECUTES the readiness logic:
//   - whenHubAuthenticated()/loadUiFlags() are imported from the real
//     frontend lib (it has no imports and touches the DOM only through
//     injected arguments / call-time globals);
//   - the profile block's inline pdWhenHubAuthenticated() is extracted from
//     the real page and transpiled, then run against fakes.
//
// The race: HubLayout's initHub() awaits a token refresh while page scripts
// already run, so a first request could use the expired token. Both Phase 2A
// consumers must wait for HubLayout's post-authentication signal on
// #hub-frame (data-hub-financial) and must never refresh the token themselves.

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const FRONTEND = join(__dirname, '../../../../../frontend/src');
const read = (rel: string) => readFileSync(join(FRONTEND, rel), 'utf8');

// frontend/ is an ES-module package that this CommonJS Jest config cannot
// import directly, so the real lib source is transpiled and evaluated here.
// It has no imports; DOM globals are only touched via arguments or at call time.
type Lib = typeof import('../../../../../frontend/src/lib/distinctions-admin');
const lib: Lib = (() => {
  const js = ts.transpileModule(read('lib/distinctions-admin.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports as unknown as Lib;
})();
const { HUB_AUTH_READY_ATTR, whenHubAuthenticated, loadUiFlags, DistinctionsAccessError } = lib;
const scriptOf = (src: string, marker: string) => {
  const start = src.indexOf(marker);
  return src.slice(start, src.indexOf('</script>', start));
};

// ── Fakes ───────────────────────────────────────────────────────────────────

class FakeFrame {
  private attrs = new Set<string>();
  hasAttribute(name: string) { return this.attrs.has(name); }
  setAttribute(name: string) { this.attrs.add(name); }
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  options: MutationObserverInit | undefined;
  disconnected = 0;
  constructor(private readonly cb: () => void) { FakeObserver.instances.push(this); }
  observe(_target: unknown, options: MutationObserverInit) { this.options = options; }
  disconnect() { this.disconnected++; }
  fire() { this.cb(); }
}

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => { FakeObserver.instances = []; });

// ── whenHubAuthenticated (admin page) ───────────────────────────────────────

describe('whenHubAuthenticated()', () => {
  const as = (f: FakeFrame) => f as unknown as HTMLElement;
  const Obs = FakeObserver as unknown as typeof MutationObserver;

  it('uses the same post-authentication attribute HubSidebar observes', () => {
    expect(HUB_AUTH_READY_ATTR).toBe('data-hub-financial');
  });

  it('proceeds immediately when HubLayout has already finished', async () => {
    const frame = new FakeFrame();
    frame.setAttribute(HUB_AUTH_READY_ATTR);
    await expect(whenHubAuthenticated(as(frame), Obs)).resolves.toBeUndefined();
    expect(FakeObserver.instances).toHaveLength(0);
  });

  it('waits while authentication is unresolved, then resolves exactly once', async () => {
    const frame = new FakeFrame();
    let resolved = 0;
    whenHubAuthenticated(as(frame), Obs).then(() => { resolved++; });
    await flush();
    expect(resolved).toBe(0);
    const [obs] = FakeObserver.instances;
    expect(obs.options).toEqual({ attributes: true, attributeFilter: ['data-hub-financial'] });

    obs.fire(); // unrelated mutation, attribute still absent
    await flush();
    expect(resolved).toBe(0);

    frame.setAttribute(HUB_AUTH_READY_ATTR);
    obs.fire();
    obs.fire(); // HubLayout never rewrites it, but a second record must not re-run
    await flush();
    expect(resolved).toBe(1);
    expect(obs.disconnected).toBeGreaterThanOrEqual(1);
  });
});

// ── loadUiFlags: sequencing and 401 interpretation ──────────────────────────

describe('loadUiFlags()', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    (global as any).localStorage = { getItem: () => 'token' };
  });
  afterAll(() => { delete (global as any).fetch; delete (global as any).localStorage; });

  const respond = (status: number, body: unknown = {}) =>
    fetchMock.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });

  it('the /users/me request is not issued before HubLayout readiness', async () => {
    respond(200, { ui: { distinctionView: true } });
    const frame = new FakeFrame();
    const boot = whenHubAuthenticated(frame as unknown as HTMLElement, FakeObserver as unknown as typeof MutationObserver)
      .then(() => loadUiFlags());
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    frame.setAttribute(HUB_AUTH_READY_ATTR);
    FakeObserver.instances[0].fire();
    await expect(boot).resolves.toMatchObject({ view: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/users/me');
  });

  it('a 401 is a session error, never a silent "no permissions"', async () => {
    respond(401, { message: 'Invalid or expired access token' });
    await expect(loadUiFlags()).rejects.toBeInstanceOf(DistinctionsAccessError);
    await expect(loadUiFlags()).rejects.toThrow(/session could not be verified/);
  });

  it('other failures also throw instead of returning all-false', async () => {
    respond(500);
    await expect(loadUiFlags()).rejects.toThrow(/Could not load your permissions \(500\)/);
  });

  it('a genuine post-readiness denial (200, flags off) still yields no access', async () => {
    respond(200, { ui: { distinctionView: false, distinctionRemove: false, distinctionCatalogueManage: false } });
    await expect(loadUiFlags()).resolves.toEqual({ view: false, remove: false, catalogueManage: false });
  });

  it('only calls /users/me -- never the token refresh endpoint', async () => {
    respond(200, { ui: {} });
    await loadUiFlags();
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/auth/refresh'))).toBe(true);
  });
});

// ── Admin page boot sequence (real source) ─────────────────────────────────

describe('admin distinctions page boot', () => {
  const page = read('pages/hub/admin/users/distinctions/index.astro');
  const boot = page.slice(page.indexOf('// ── Boot'), page.lastIndexOf('</script>'));

  it('awaits HubLayout readiness before the first authenticated request', () => {
    const wait = boot.indexOf('await whenHubAuthenticated()');
    const flags = boot.indexOf('await loadUiFlags()');
    expect(wait).toBeGreaterThan(-1);
    expect(flags).toBeGreaterThan(wait);
    expect(boot.indexOf('loadRegister()')).toBeGreaterThan(flags);
  });

  it('reports a flag-loading failure as an error, and "no access" only for !flags.view', () => {
    expect(boot).toMatch(/catch \(err\) \{\s*showError\(\$\('pd-access'\), err\);\s*return;/);
    const denial = boot.indexOf('You do not have access to photographic distinction administration.');
    expect(denial).toBeGreaterThan(boot.indexOf('if (!flags.view)'));
  });
});

// ── Profile holder block (real source, executed) ────────────────────────────

describe('profile Photographic Distinctions block', () => {
  const page = read('pages/hub/profile/index.astro');
  const script = scriptOf(page, "const PD_API = '/api/v1/identity/distinctions/me'");
  const fnSrc = script.match(/function pdWhenHubAuthenticated[\s\S]*?\r?\n\}\r?\n/)![0];
  const js = ts.transpileModule(fnSrc, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

  function load(frame: FakeFrame | null) {
    const document = { getElementById: (id: string) => (id === 'hub-frame' ? frame : null) };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function('document', 'MutationObserver', `${js}; return pdWhenHubAuthenticated;`)(
      document, FakeObserver,
    ) as (run: () => void) => void;
  }

  it('the first pdLoad() runs only inside the readiness callback', () => {
    const calls = [...script.matchAll(/pdLoad\(\)/g)].map((m) => m.index!);
    const gate = script.indexOf('pdWhenHubAuthenticated(() => {');
    expect(gate).toBeGreaterThan(-1);
    // the only top-level invocation is the one inside the gate; the others
    // are inside pdAct() (user actions, after load)
    const topLevel = calls.filter((i) => i > script.indexOf('function pdWhenHubAuthenticated'));
    expect(topLevel).toHaveLength(1);
    expect(topLevel[0]).toBeGreaterThan(gate);
  });

  it('uses the same readiness attribute as HubSidebar / the admin lib', () => {
    expect(fnSrc).toContain(`const READY_ATTR = '${HUB_AUTH_READY_ATTR}';`);
  });

  it('runs immediately when ready, waits otherwise, and runs exactly once', () => {
    const ready = new FakeFrame();
    ready.setAttribute(HUB_AUTH_READY_ATTR);
    const run1 = jest.fn();
    load(ready)(run1);
    expect(run1).toHaveBeenCalledTimes(1);
    expect(FakeObserver.instances).toHaveLength(0);

    const pending = new FakeFrame();
    const run2 = jest.fn();
    load(pending)(run2);
    expect(run2).not.toHaveBeenCalled();
    const [obs] = FakeObserver.instances;
    obs.fire();
    expect(run2).not.toHaveBeenCalled();
    pending.setAttribute(HUB_AUTH_READY_ATTR);
    obs.fire();
    expect(run2).toHaveBeenCalledTimes(1);
    expect(obs.disconnected).toBe(1);
  });
});

// ── No second token refresh; HubLayout signal contract ─────────────────────

describe('no additional token refresh; HubLayout signal unchanged', () => {
  it('neither consumer refreshes the token itself', () => {
    const lib = read('lib/distinctions-admin.ts');
    const admin = read('pages/hub/admin/users/distinctions/index.astro');
    const profilePd = scriptOf(read('pages/hub/profile/index.astro'), "const PD_API = '/api/v1/identity/distinctions/me'");
    for (const src of [lib, admin, profilePd]) {
      expect(src).not.toContain('/auth/refresh');
      expect(src).not.toContain('bcc_refresh');
    }
  });

  it('HubLayout writes the readiness attribute only after /users/me, and not in the initial markup', () => {
    const layout = read('layouts/HubLayout.astro');
    expect(layout).not.toMatch(/<div id="hub-frame"[^>]*data-hub-financial/);
    const script = layout.slice(layout.indexOf('async function initHub'));
    const me = script.indexOf('/users/me');
    const write = script.indexOf("setAttribute('data-hub-financial'");
    expect(me).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(me);
  });
});
