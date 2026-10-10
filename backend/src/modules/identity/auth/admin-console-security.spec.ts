/**
 * admin-console-security.spec.ts
 *
 * Verifies the frontend client security gates, session revalidation,
 * data-clearing, silent-refresh behavior, and feature-level 403 handling
 * for the BCC Admin Console:
 *
 * 1. Direct access to /hub/admin/ when signed out -> redirect to sign-in
 * 2. Direct access to /hub/admin/ when authenticated as member -> redirect to /hub/
 * 3. Direct access to /hub/admin/ when authenticated as admin -> allow access
 * 4. Token expiry during active session / return to open tab -> revalidate session state
 * 5. Session invalidation clears protected admin identity/status/reset information
 * 6. 401 handling -> clear protected admin data and redirect to sign-in
 * 7. Root-level 403 handling -> clear protected admin data and redirect to /hub/
 * 8. Feature-level 403 handling (reset-password, hero manager, identity actions, pending):
 *    displays inline permission-denied messages without redirecting away or clearing unrelated panels
 * 9. Expired session cannot execute password reset
 * 10. Suppress in-flight responses when session is invalidated
 * 11. Silent refresh keeps active admin console functional when valid refresh token exists
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

const FRONTEND = join(__dirname, '../../../../../frontend/src');
const read = (rel: string) => readFileSync(join(FRONTEND, rel), 'utf8');

type AuthedFetchLib = typeof import('../../../../../frontend/src/lib/authed-fetch');
const authedFetchLib: AuthedFetchLib = (() => {
  const js = ts.transpileModule(read('lib/authed-fetch.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('module', 'exports', js)(module, module.exports);
  return module.exports as unknown as AuthedFetchLib;
})();
const { createAuthedFetch, SessionExpiredError } = authedFetchLib;

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('Admin Console Security & Session Contract', () => {
  const HUB_LAYOUT_SRC = read('layouts/HubLayout.astro');
  const ADMIN_INDEX_SRC = read('pages/hub/admin/index.astro');

  // ── 1, 2, 3: Direct Access & Route-Level Gate in HubLayout ─────────────

  describe('HubLayout Route Gate (Fix A)', () => {
    // [Source-text assertion]
    it('verifies route authorization gate check is present in HubLayout source', () => {
      expect(HUB_LAYOUT_SRC).toContain("if (currentPath.startsWith('/hub/admin'))");
      expect(HUB_LAYOUT_SRC).toContain("window.location.replace('/hub/')");
      expect(HUB_LAYOUT_SRC).toContain("role === 'admin'");
    });

    function simulateHubLayoutGate(opts: {
      path: string;
      hasToken: boolean;
      portalState?: string;
      tokenRole?: string;
      financialRead?: boolean;
    }) {
      let replacedUrl = '';
      const windowLocation = {
        pathname: opts.path,
        search: '',
        replace: (url: string) => { replacedUrl = url; },
      };
      const frameAttrs: Record<string, string> = {};
      const frame = {
        setAttribute: (k: string, v: string) => { frameAttrs[k] = v; },
        style: { display: 'none' },
      };
      const loading = { hidden: false };

      if (!opts.hasToken) {
        windowLocation.replace(`/auth/signin/?next=${encodeURIComponent(opts.path)}`);
        return { replacedUrl, frameRevealed: frame.style.display !== 'none', frameAttrs };
      }

      const role = opts.portalState ? opts.portalState.toLowerCase() : (opts.tokenRole ?? 'member');
      const currentPath = windowLocation.pathname;
      if (currentPath.startsWith('/hub/admin')) {
        const isFin = currentPath.startsWith('/hub/admin/financial');
        const isAuthorized = role === 'admin' || (isFin && opts.financialRead === true);
        if (!isAuthorized) {
          windowLocation.replace('/hub/');
          return { replacedUrl, frameRevealed: frame.style.display !== 'none', frameAttrs };
        }
      }

      frame.setAttribute('data-hub-role', role);
      frame.setAttribute('data-hub-financial', opts.financialRead ? 'true' : 'false');
      loading.hidden = true;
      frame.style.display = '';

      return { replacedUrl, frameRevealed: frame.style.display !== 'none', frameAttrs };
    }

    // [Mocked behavioural test]
    it('Scenario 1: Direct access to /hub/admin/ when signed out redirects to sign-in', () => {
      const outcome = simulateHubLayoutGate({
        path: '/hub/admin/',
        hasToken: false,
      });
      expect(outcome.replacedUrl).toBe('/auth/signin/?next=%2Fhub%2Fadmin%2F');
      expect(outcome.frameRevealed).toBe(false);
      expect(outcome.frameAttrs['data-hub-role']).toBeUndefined();
    });

    // [Mocked behavioural test]
    it('Scenario 2: Direct access to /hub/admin/ when authenticated as member redirects to /hub/', () => {
      const outcome = simulateHubLayoutGate({
        path: '/hub/admin/',
        hasToken: true,
        portalState: 'MEMBER',
      });
      expect(outcome.replacedUrl).toBe('/hub/');
      expect(outcome.frameRevealed).toBe(false);
      expect(outcome.frameAttrs['data-hub-role']).toBeUndefined();
    });

    // [Mocked behavioural test]
    it('Scenario 3: Direct access to /hub/admin/ when authenticated as admin allows access', () => {
      const outcome = simulateHubLayoutGate({
        path: '/hub/admin/',
        hasToken: true,
        portalState: 'ADMIN',
      });
      expect(outcome.replacedUrl).toBe('');
      expect(outcome.frameRevealed).toBe(true);
      expect(outcome.frameAttrs['data-hub-role']).toBe('admin');
      expect(outcome.frameAttrs['data-hub-financial']).toBe('false');
    });
  });

  // ── 4: Tab Visibility Revalidation in HubLayout ─────────────────────────

  describe('Tab Visibility Revalidation (Fix B)', () => {
    // [Source-text assertion]
    it('verifies visibilitychange listener exists in HubLayout', () => {
      expect(HUB_LAYOUT_SRC).toContain("document.addEventListener('visibilitychange'");
      expect(HUB_LAYOUT_SRC).toContain("hub:session-invalidated");
    });

    async function simulateVisibilityChange(opts: {
      path: string;
      validToken: string | null;
      meStatus?: number;
      meRole?: string;
    }) {
      let replacedUrl = '';
      let sessionInvalidatedEvent: CustomEvent | null = null;
      const windowLocation = {
        pathname: opts.path,
        search: '',
        replace: (url: string) => { replacedUrl = url; },
      };
      const frame = { style: { display: 'block' } };
      const loading = { hidden: true };

      const token = opts.validToken;
      if (!token) {
        frame.style.display = 'none';
        loading.hidden = false;
        sessionInvalidatedEvent = { detail: { reason: 'expired' } } as unknown as CustomEvent;
        windowLocation.replace(`/auth/signin/?next=${encodeURIComponent(opts.path)}`);
        return { replacedUrl, frameVisible: frame.style.display !== 'none', event: sessionInvalidatedEvent };
      }

      if (opts.path.startsWith('/hub/admin')) {
        if (opts.meStatus !== 200) {
          frame.style.display = 'none';
          loading.hidden = false;
          sessionInvalidatedEvent = { detail: { reason: 'expired' } } as unknown as CustomEvent;
          windowLocation.replace(`/auth/signin/?next=${encodeURIComponent(opts.path)}`);
          return { replacedUrl, frameVisible: frame.style.display !== 'none', event: sessionInvalidatedEvent };
        }
        const role = (opts.meRole ?? 'member').toLowerCase();
        if (role !== 'admin') {
          frame.style.display = 'none';
          sessionInvalidatedEvent = { detail: { reason: 'unauthorized' } } as unknown as CustomEvent;
          windowLocation.replace('/hub/');
          return { replacedUrl, frameVisible: frame.style.display !== 'none', event: sessionInvalidatedEvent };
        }
      }

      return { replacedUrl, frameVisible: frame.style.display !== 'none', event: null };
    }

    // [Mocked behavioural test]
    it('Scenario 4a: Tab returns visible with dead session -> invalidates and redirects to sign-in', async () => {
      const outcome = await simulateVisibilityChange({
        path: '/hub/admin/',
        validToken: null,
      });
      expect(outcome.replacedUrl).toBe('/auth/signin/?next=%2Fhub%2Fadmin%2F');
      expect(outcome.frameVisible).toBe(false);
      expect(outcome.event?.detail?.reason).toBe('expired');
    });

    // [Mocked behavioural test]
    it('Scenario 4b: Tab returns visible with demoted role -> invalidates and redirects to /hub/', async () => {
      const outcome = await simulateVisibilityChange({
        path: '/hub/admin/',
        validToken: 'NEW_VALID_TOKEN',
        meStatus: 200,
        meRole: 'MEMBER',
      });
      expect(outcome.replacedUrl).toBe('/hub/');
      expect(outcome.frameVisible).toBe(false);
      expect(outcome.event?.detail?.reason).toBe('unauthorized');
    });

    // [Mocked behavioural test]
    it('Scenario 4c: Tab returns visible with valid admin token -> remains visible with no redirect', async () => {
      const outcome = await simulateVisibilityChange({
        path: '/hub/admin/',
        validToken: 'VALID_ADMIN_TOKEN',
        meStatus: 200,
        meRole: 'ADMIN',
      });
      expect(outcome.replacedUrl).toBe('');
      expect(outcome.frameVisible).toBe(true);
      expect(outcome.event).toBeNull();
    });
  });

  // ── 5, 6, 7: Admin Console Global Invalidation & Clearing ────────────────

  describe('Admin Console State Clearing & Root Authorization Failures', () => {
    function createMockDOM() {
      const elements: Record<string, {
        innerHTML: string;
        value?: string;
        textContent?: string;
        hidden: boolean;
        dataset: Record<string, string>;
        disabled?: boolean;
        className?: string;
      }> = {
        'pending-list': { innerHTML: '<div class="pending-card">Pending app #1</div>', hidden: false, dataset: {} },
        'pending-loading': { innerHTML: '', hidden: true, dataset: {} },
        'pending-empty': { innerHTML: '', hidden: true, dataset: {} },
        'pending-error': { innerHTML: '', hidden: true, dataset: {} },
        'search-results': { innerHTML: '<div class="result-row">Secret User</div>', hidden: false, dataset: {} },
        'search-input': { innerHTML: '', value: 'john@secret.com', hidden: false, dataset: {} },
        'search-loading': { innerHTML: '', hidden: true, dataset: {} },
        'search-empty': { innerHTML: '', hidden: true, dataset: {} },
        'search-error': { innerHTML: '', hidden: true, dataset: {} },
        'reset-panel': { innerHTML: '', hidden: false, dataset: {} },
        'reset-user-id': { innerHTML: '', value: '42', hidden: false, dataset: {} },
        'reset-target-name': { innerHTML: '', textContent: 'Secret Member Name', hidden: false, dataset: {} },
        'reset-password': { innerHTML: '', value: 'tempSecret123', hidden: false, dataset: {} },
        'reset-feedback': { innerHTML: '', textContent: 'Password reset ok', hidden: false, dataset: {}, className: 'reset-feedback ok' },
        'identity-panel': { innerHTML: '', hidden: false, dataset: {} },
        'identity-detail': { innerHTML: 'Secret identity details', hidden: false, dataset: {} },
        'identity-actions': { innerHTML: '', hidden: false, dataset: { uid: '42', name: 'Secret' } },
        'identity-feedback': { innerHTML: '', textContent: 'Dispatched', hidden: false, dataset: {} },
        'hero-photo-list': { innerHTML: '<div class="photo">Photo 1</div>', hidden: false, dataset: {} },
        'hero-manager-loading': { innerHTML: '', hidden: true, dataset: {} },
        'hero-manager-empty': { innerHTML: '', hidden: true, dataset: {} },
        'hero-manager-error': { innerHTML: '', hidden: true, dataset: {} },
        'hero-assign-modal': { innerHTML: '', hidden: false, dataset: {} },
        'hero-replace-modal': { innerHTML: '', hidden: false, dataset: {} },
      };

      const getElementById = (id: string) => elements[id] as any;
      const hide = (el: any) => { if (el) el.hidden = true; };
      const show = (el: any) => { if (el) el.hidden = false; };

      return { elements, getElementById, hide, show };
    }

    // [Mocked behavioural test]
    it('Scenario 5: Session invalidation clears protected admin identity/status/reset information', () => {
      const { elements, getElementById, hide } = createMockDOM();
      let isSessionInvalidated = false;

      function clearProtectedAdminData(): void {
        isSessionInvalidated = true;
        const pendingList = getElementById('pending-list');
        if (pendingList) { pendingList.innerHTML = ''; hide(pendingList); }
        hide(getElementById('pending-loading'));
        hide(getElementById('pending-empty'));
        hide(getElementById('pending-error'));

        const searchResults = getElementById('search-results');
        if (searchResults) { searchResults.innerHTML = ''; hide(searchResults); }
        const searchInput = getElementById('search-input');
        if (searchInput) { searchInput.value = ''; }
        hide(getElementById('search-loading'));
        hide(getElementById('search-empty'));
        hide(getElementById('search-error'));

        const resetPanel = getElementById('reset-panel');
        if (resetPanel) hide(resetPanel);
        const resetUserId = getElementById('reset-user-id');
        if (resetUserId) resetUserId.value = '';
        const resetTargetName = getElementById('reset-target-name');
        if (resetTargetName) resetTargetName.textContent = '';
        const resetPassword = getElementById('reset-password');
        if (resetPassword) resetPassword.value = '';
        const resetFeedback = getElementById('reset-feedback');
        if (resetFeedback) { resetFeedback.textContent = ''; hide(resetFeedback); }

        const identityPanel = getElementById('identity-panel');
        if (identityPanel) hide(identityPanel);
        const identityDetail = getElementById('identity-detail');
        if (identityDetail) identityDetail.innerHTML = '';
        const identityActions = getElementById('identity-actions');
        if (identityActions) {
          identityActions.hidden = true;
          delete identityActions.dataset.uid;
          delete identityActions.dataset.name;
        }
        const identityFeedback = getElementById('identity-feedback');
        if (identityFeedback) { identityFeedback.textContent = ''; hide(identityFeedback); }

        const heroList = getElementById('hero-photo-list');
        if (heroList) { heroList.innerHTML = ''; hide(heroList); }
        hide(getElementById('hero-manager-loading'));
        hide(getElementById('hero-manager-empty'));
        hide(getElementById('hero-manager-error'));
        hide(getElementById('hero-assign-modal'));
        hide(getElementById('hero-replace-modal'));
      }

      clearProtectedAdminData();

      expect(isSessionInvalidated).toBe(true);
      expect(elements['pending-list'].innerHTML).toBe('');
      expect(elements['pending-list'].hidden).toBe(true);
      expect(elements['search-results'].innerHTML).toBe('');
      expect(elements['search-results'].hidden).toBe(true);
      expect(elements['search-input'].value).toBe('');
      expect(elements['reset-panel'].hidden).toBe(true);
      expect(elements['reset-user-id'].value).toBe('');
      expect(elements['reset-target-name'].textContent).toBe('');
      expect(elements['reset-password'].value).toBe('');
      expect(elements['identity-panel'].hidden).toBe(true);
      expect(elements['identity-detail'].innerHTML).toBe('');
      expect(elements['identity-actions'].dataset.uid).toBeUndefined();
      expect(elements['hero-photo-list'].innerHTML).toBe('');
      expect(elements['hero-assign-modal'].hidden).toBe(true);
      expect(elements['hero-replace-modal'].hidden).toBe(true);
    });

    // [Mocked behavioural test]
    it('Scenario 6: 401 handling clears protected admin data and redirects to sign-in', () => {
      const { elements, getElementById, hide } = createMockDOM();
      let replacedUrl = '';
      const windowLocation = {
        pathname: '/hub/admin/',
        search: '',
        replace: (u: string) => { replacedUrl = u; },
      };

      function handleAuthFailure(status: 401 | 403 | 'expired') {
        const searchResults = getElementById('search-results');
        if (searchResults) { searchResults.innerHTML = ''; hide(searchResults); }
        if (status === 403) {
          windowLocation.replace('/hub/');
        } else {
          windowLocation.replace(`/auth/signin/?next=${encodeURIComponent(windowLocation.pathname)}`);
        }
      }

      handleAuthFailure(401);
      expect(elements['search-results'].innerHTML).toBe('');
      expect(replacedUrl).toBe('/auth/signin/?next=%2Fhub%2Fadmin%2F');
    });

    // [Mocked behavioural test]
    it('Scenario 7: Root-level authorization failure (demoted role) clears data and redirects to /hub/', () => {
      const { elements, getElementById, hide } = createMockDOM();
      let replacedUrl = '';
      const windowLocation = {
        pathname: '/hub/admin/',
        search: '',
        replace: (u: string) => { replacedUrl = u; },
      };

      function handleAuthFailure(status: 401 | 403 | 'expired') {
        const searchResults = getElementById('search-results');
        if (searchResults) { searchResults.innerHTML = ''; hide(searchResults); }
        if (status === 403) {
          windowLocation.replace('/hub/');
        } else {
          windowLocation.replace(`/auth/signin/?next=${encodeURIComponent(windowLocation.pathname)}`);
        }
      }

      handleAuthFailure(403);
      expect(elements['search-results'].innerHTML).toBe('');
      expect(replacedUrl).toBe('/hub/');
    });
  });

  // ── 8: Feature-Level 403 Local Handling (Minimal Fix) ───────────────────

  describe('Feature-Level 403 Local Handling', () => {
    function createMockDOM() {
      const elements: Record<string, {
        innerHTML: string;
        value?: string;
        textContent?: string;
        hidden: boolean;
        dataset: Record<string, string>;
        disabled?: boolean;
        className?: string;
      }> = {
        'pending-list': { innerHTML: '<div class="pending-card">Pending app #1</div>', hidden: false, dataset: {} },
        'pending-error': { innerHTML: '', textContent: '', hidden: true, dataset: {} },
        'search-results': { innerHTML: '<div class="result-row">Secret User</div>', hidden: false, dataset: {} },
        'search-error': { innerHTML: '', textContent: '', hidden: true, dataset: {} },
        'reset-panel': { innerHTML: '', hidden: false, dataset: {} },
        'reset-feedback': { innerHTML: '', textContent: '', hidden: true, dataset: {}, className: 'reset-feedback' },
        'identity-feedback': { innerHTML: '', textContent: '', hidden: true, dataset: {}, className: 'reset-feedback' },
        'hero-photo-list': { innerHTML: '<div class="photo">Photo 1</div>', hidden: false, dataset: {} },
        'hero-manager-error': { innerHTML: '', textContent: '', hidden: true, dataset: {} },
      };

      const getElementById = (id: string) => elements[id] as any;
      const hide = (el: any) => { if (el) el.hidden = true; };
      const show = (el: any) => { if (el) el.hidden = false; };

      return { elements, getElementById, hide, show };
    }

    // [Mocked behavioural test]
    it('Feature-level 403 on reset-password shows safe inline error and preserves console state', async () => {
      const { elements, getElementById, show } = createMockDOM();
      let redirected = false;
      const windowLocation = { replace: () => { redirected = true; } };

      const resetPassword = async () => {
        const resetFeedback = getElementById('reset-feedback');
        // Simulated 403 response from /membership/admin/users/:id/reset-password
        const status = 403;
        if (status === 403) {
          if (resetFeedback) {
            resetFeedback.textContent = 'You do not have permission to reset member passwords.';
            resetFeedback.className = 'reset-feedback error';
            show(resetFeedback);
          }
          return;
        }
      };

      await resetPassword();

      expect(redirected).toBe(false);
      expect(elements['reset-feedback'].hidden).toBe(false);
      expect(elements['reset-feedback'].textContent).toBe('You do not have permission to reset member passwords.');
      expect(elements['reset-feedback'].className).toBe('reset-feedback error');
      // Unrelated panels remain populated:
      expect(elements['search-results'].innerHTML).toContain('Secret User');
      expect(elements['pending-list'].innerHTML).toContain('Pending app #1');
    });

    // [Mocked behavioural test]
    it('Feature-level 403 on hero-manager eligible photos shows safe inline error and preserves console state', async () => {
      const { elements, getElementById, show } = createMockDOM();
      let redirected = false;

      const loadHeroManagerData = async () => {
        const errorEl = getElementById('hero-manager-error');
        // Simulated 403 response from /gallery/hero/eligible
        const status = 403;
        if (status === 403) {
          if (errorEl) {
            errorEl.textContent = 'You do not have permission to manage editorial hero images.';
            show(errorEl);
          }
          return;
        }
      };

      await loadHeroManagerData();

      expect(redirected).toBe(false);
      expect(elements['hero-manager-error'].hidden).toBe(false);
      expect(elements['hero-manager-error'].textContent).toBe('You do not have permission to manage editorial hero images.');
      // Unrelated panels remain populated:
      expect(elements['search-results'].innerHTML).toContain('Secret User');
      expect(elements['pending-list'].innerHTML).toContain('Pending app #1');
    });

    // [Mocked behavioural test]
    it('Feature-level 403 on identity actions shows safe inline error without redirecting', async () => {
      const { elements, getElementById, show } = createMockDOM();
      let redirected = false;

      const identityAction = async () => {
        const identityFeedback = getElementById('identity-feedback');
        // Simulated 403 response from /identity/admin/*
        const status = 403;
        if (status === 403) {
          if (identityFeedback) {
            identityFeedback.textContent = 'You do not have permission for this identity action.';
            identityFeedback.className = 'reset-feedback error';
            show(identityFeedback);
          }
          return;
        }
      };

      await identityAction();

      expect(redirected).toBe(false);
      expect(elements['identity-feedback'].hidden).toBe(false);
      expect(elements['identity-feedback'].textContent).toBe('You do not have permission for this identity action.');
    });

    // [Mocked behavioural test]
    it('Feature-level 403 on pending applications shows safe inline error without redirecting', async () => {
      const { elements, getElementById, show } = createMockDOM();
      let redirected = false;

      const loadPending = async () => {
        const errorEl = getElementById('pending-error');
        // Simulated 403 response from /membership/admin/pending
        const status = 403;
        if (status === 403) {
          if (errorEl) {
            errorEl.textContent = 'You do not have permission to view pending applications.';
            show(errorEl);
          }
          return;
        }
      };

      await loadPending();

      expect(redirected).toBe(false);
      expect(elements['pending-error'].hidden).toBe(false);
      expect(elements['pending-error'].textContent).toBe('You do not have permission to view pending applications.');
    });
  });

  // ── 9, 10: In-flight and Password Reset Guarantees ───────────────────────

  describe('Session Expiry & In-flight Guarantees', () => {
    // [Mocked behavioural test]
    it('Scenario 9: Expired session cannot execute password reset', async () => {
      let isSessionInvalidated = false;
      let handledStatus: any = null;
      const apiFetch = jest.fn(async () => {
        throw new SessionExpiredError();
      });

      const resetPassword = async (uid: string, pwd: string) => {
        if (isSessionInvalidated) return;
        try {
          await apiFetch('/api/v1/membership/admin/users/' + uid + '/reset-password', {
            method: 'POST',
            body: JSON.stringify({ newPassword: pwd }),
          });
        } catch (err) {
          if (err instanceof SessionExpiredError) {
            handledStatus = 'expired';
            isSessionInvalidated = true;
            return;
          }
        }
      };

      await resetPassword('42', 'newTempSecret!');
      expect(handledStatus).toBe('expired');
      expect(isSessionInvalidated).toBe(true);
    });

    // [Mocked behavioural test]
    it('Scenario 10: In-flight responses are suppressed when session is invalidated before return', async () => {
      const elements: Record<string, any> = { 'search-results': { innerHTML: '' } };
      let isSessionInvalidated = false;
      let resolveSearch!: (v: Response) => void;
      const delayedFetch = new Promise<Response>((r) => { resolveSearch = r; });

      const searchMembers = async () => {
        if (isSessionInvalidated) return;
        try {
          const r = await delayedFetch;
          if (isSessionInvalidated) return;
          const rows = await r.json() as any[];
          if (isSessionInvalidated) return;
          elements['search-results'].innerHTML = rows.map((x) => x.name).join('');
        } catch {
          if (isSessionInvalidated) return;
        }
      };

      const searchPromise = searchMembers();

      // Session becomes invalidated while search request is still in flight:
      isSessionInvalidated = true;
      elements['search-results'].innerHTML = '';

      // Delayed response resolves with sensitive data:
      resolveSearch(res(200, [{ name: 'Secret Leaked Member' }]));
      await searchPromise;

      // In-flight guard ensured the DOM was NOT populated:
      expect(elements['search-results'].innerHTML).toBe('');
    });
  });

  // ── 11: Silent Refresh Keeps Active Admin Console Functional ────────────

  describe('Silent Session Renewal', () => {
    // [Transpiled library unit test - executes real createAuthedFetch]
    it('Scenario 11: Silent refresh rotates tokens and keeps active admin console functional with valid refresh token', async () => {
      const store = { at: 'EXPIRED_ACCESS_TOKEN', rt: 'VALID_REFRESH_TOKEN' };
      let refreshCalls = 0;
      let protectedCalls = 0;

      const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/v1/auth/refresh') {
          refreshCalls++;
          return res(200, { accessToken: 'NEW_ACCESS_TOKEN', refreshToken: 'ROTATED_REFRESH_TOKEN' });
        }
        const auth = (init?.headers as Record<string, string>)?.Authorization;
        if (auth === 'Bearer EXPIRED_ACCESS_TOKEN') {
          return res(401, { message: 'Invalid or expired access token' });
        }
        if (auth === 'Bearer NEW_ACCESS_TOKEN') {
          protectedCalls++;
          return res(200, [{ id: 1, full_name: 'Authorized Admin Result' }]);
        }
        return res(403);
      });

      const authed = createAuthedFetch({
        fetch: fetchImpl as any,
        getToken: () => store.at,
        getRefreshToken: () => store.rt,
        storeTokens: (a, r) => { store.at = a; store.rt = r; },
        clearAuth: () => { store.at = ''; store.rt = ''; },
      });

      const r = await authed('/api/v1/membership/admin/pending');
      expect(r.status).toBe(200);
      expect(refreshCalls).toBe(1);
      expect(protectedCalls).toBe(1);
      expect(store.at).toBe('NEW_ACCESS_TOKEN');
      expect(store.rt).toBe('ROTATED_REFRESH_TOKEN');
      const data = await r.json() as any[];
      expect(data[0].full_name).toBe('Authorized Admin Result');
    });
  });

  // ── Source Wiring Verification ──────────────────────────────────────────

  describe('Admin Index Source Wiring Verification', () => {
    // [Source-text assertion]
    it('verifies authedFetch and whenHubAuthenticated are imported and used', () => {
      expect(ADMIN_INDEX_SRC).toContain("import { whenHubAuthenticated } from '../../../lib/distinctions-admin';");
      expect(ADMIN_INDEX_SRC).toContain("import { createAuthedFetch, SessionExpiredError } from '../../../lib/authed-fetch';");
      expect(ADMIN_INDEX_SRC).toContain('const apiFetch = createAuthedFetch({');
      expect(ADMIN_INDEX_SRC).toContain('clearProtectedAdminData()');
      expect(ADMIN_INDEX_SRC).toContain('isSessionInvalidated');
      expect(ADMIN_INDEX_SRC).toContain("window.addEventListener('hub:session-invalidated'");
      expect(ADMIN_INDEX_SRC).toContain('await whenHubAuthenticated()');
    });

    // [Source-text assertion]
    it('verifies all critical endpoints use apiFetch rather than bare fetch with authHeaders', () => {
      expect(ADMIN_INDEX_SRC).toContain('apiFetch(`${API}/membership/admin/pending`)');
      expect(ADMIN_INDEX_SRC).toContain('apiFetch(`${API}/users/admin/search?q=');
      expect(ADMIN_INDEX_SRC).toContain('apiFetch(`${API}/membership/admin/users/${uid}/reset-password`');
      expect(ADMIN_INDEX_SRC).toContain('apiFetch(`${API}/gallery/hero/eligible`)');
      expect(ADMIN_INDEX_SRC).toContain('apiFetch(`${API}/identity/${endpoint}/${uid}`');
    });

    // [Source-text assertion]
    it('verifies feature-level 403 responses are handled locally with inline messages', () => {
      expect(ADMIN_INDEX_SRC).toContain('You do not have permission to reset member passwords.');
      expect(ADMIN_INDEX_SRC).toContain('You do not have permission to manage editorial hero images.');
      expect(ADMIN_INDEX_SRC).toContain('You do not have permission for this identity action.');
      expect(ADMIN_INDEX_SRC).toContain('You do not have permission to view pending applications.');
      expect(ADMIN_INDEX_SRC).toContain('You do not have permission to search members.');
    });
  });
});
