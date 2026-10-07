/**
 * distinctions-admin.ts — client helpers for the Photographic Distinctions
 * administration workspace (/hub/admin/users/distinctions/).
 *
 * Every request goes to /api/v1/identity/distinctions/admin/*, where
 * RbacGuard is the authorization boundary (identity.distinction.view /
 * .remove / .catalogue.manage). UI flags only decide what is shown.
 */

export const DISTINCTIONS_ADMIN_API = '/api/v1/identity/distinctions/admin';

export class DistinctionsAccessError extends Error {}

export async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<T> {
  const token = localStorage.getItem('bcc_token') ?? '';
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${DISTINCTIONS_ADMIN_API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    let message = 'You do not have permission for this action.';
    try {
      const b = await res.json();
      if (res.status === 403 && b?.message && !String(b.message).startsWith('Missing required permission')) message = String(b.message);
    } catch { /* non-JSON */ }
    throw new DistinctionsAccessError(message);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const b = await res.json();
      if (b?.message) message = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
    } catch { /* non-JSON */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface DistinctionUiFlags {
  view: boolean;
  remove: boolean;
  catalogueManage: boolean;
}

// HubLayout writes this attribute on #hub-frame exactly once, after it has
// validated (or refreshed) the stored token and confirmed it with /users/me.
// It is absent from the initial markup -- unlike data-hub-role, which starts
// as "member" -- so its presence means authentication has resolved. Same
// signal HubSidebar observes for the Financial group (HUB-ARCH-001: workspace
// scripts execute after authentication resolves).
export const HUB_AUTH_READY_ATTR = 'data-hub-financial';

/**
 * Resolves once HubLayout has finished authentication, so the first
 * authenticated request never uses a stale token mid-refresh. Never refreshes
 * the token itself. Resolves immediately when the signal is already present
 * (or when there is no #hub-frame, i.e. not inside HubLayout).
 */
export function whenHubAuthenticated(
  frame: HTMLElement | null = document.getElementById('hub-frame'),
  Observer: typeof MutationObserver = MutationObserver,
): Promise<void> {
  return new Promise((resolve) => {
    if (!frame || frame.hasAttribute(HUB_AUTH_READY_ATTR)) {
      resolve();
      return;
    }
    const observer = new Observer(() => {
      if (!frame.hasAttribute(HUB_AUTH_READY_ATTR)) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(frame, { attributes: true, attributeFilter: [HUB_AUTH_READY_ATTR] });
  });
}

/**
 * Navigation/visibility hints from /users/me (never an authorization
 * decision). Call only after whenHubAuthenticated(). A failed request throws
 * rather than returning all-false, so a session problem is never shown as
 * "no access"; only a successful /users/me with the flags off is a denial.
 */
export async function loadUiFlags(): Promise<DistinctionUiFlags> {
  const token = localStorage.getItem('bcc_token') ?? '';
  const res = await fetch('/api/v1/users/me', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    throw new DistinctionsAccessError('Your session could not be verified. Reload the page or sign in again.');
  }
  if (!res.ok) throw new Error(`Could not load your permissions (${res.status}). Reload the page to try again.`);
  const me = (await res.json()) as { ui?: { distinctionView?: boolean; distinctionRemove?: boolean; distinctionCatalogueManage?: boolean } };
  return {
    view: me.ui?.distinctionView === true,
    remove: me.ui?.distinctionRemove === true,
    catalogueManage: me.ui?.distinctionCatalogueManage === true,
  };
}

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATE_TONE: Record<string, string> = { DECLARED: 'green', WITHDRAWN: '', REMOVED: 'red' };

export function statePill(state: string): string {
  const tone = STATE_TONE[state];
  return `<span class="tag-pill${tone ? ` tag-pill--${tone}` : ''}">${esc(state)}</span>`;
}
