/**
 * authed-fetch.ts — bearer-authenticated fetch with one-shot session renewal,
 * for Hub pages that stay open longer than the 15-minute access-token life
 * (the profile editor).
 *
 * HubLayout refreshes the access token once, at page load. A page left open
 * past the token lifetime then sends an expired token and every request gets
 * the guard's 401. This helper reuses the existing flow (POST /auth/refresh
 * with the stored refresh token, which rotates) and adds only what is missing:
 *
 *   - 401 only: 403 (authorization) is returned untouched, never a renewal case.
 *   - Retry at most once per call; a second 401 is returned, never looped.
 *   - Single flight: concurrent calls share ONE refresh. This matters because
 *     the server rotates refresh tokens and treats reuse of a rotated token as
 *     theft (AuthService.refresh revokes every session of the user).
 *   - If another tab or HubLayout already stored a newer access token, that
 *     token is retried without calling /auth/refresh at all.
 *   - A refresh the server rejects throws SessionExpiredError (stored tokens
 *     cleared); a transport failure leaves the tokens alone and rethrows.
 *
 * Pure: storage, fetch and clearing are injected so behaviour is testable.
 */

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Sign in again to continue.');
    this.name = 'SessionExpiredError';
  }
}

export interface AuthedFetchDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  getToken: () => string;
  getRefreshToken: () => string | null;
  storeTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  refreshUrl?: string;
}

export function createAuthedFetch(deps: AuthedFetchDeps) {
  const refreshUrl = deps.refreshUrl ?? '/api/v1/auth/refresh';
  let inFlight: Promise<void> | null = null;

  function renew(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const refresh = deps.getRefreshToken();
        if (!refresh) { deps.clearAuth(); throw new SessionExpiredError(); }
        const res = await deps.fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        if (res.status === 401 || res.status === 403) { deps.clearAuth(); throw new SessionExpiredError(); }
        if (!res.ok) throw new Error(`Session renewal failed (${res.status})`);
        const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
        if (!data.accessToken || !data.refreshToken) throw new Error('Session renewal returned an unexpected response');
        deps.storeTokens(data.accessToken, data.refreshToken);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  const send = (url: string, opts: RequestInit, token: string) =>
    deps.fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });

  return async function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
    const sent = deps.getToken();
    const res = await send(url, opts, sent);
    if (res.status !== 401) return res;

    // Recoverable only if the token can be replaced. Skip /auth/refresh when a
    // newer token is already stored (another tab or an earlier shared renewal).
    if (deps.getToken() === sent) await renew();
    return send(url, opts, deps.getToken());
  };
}
