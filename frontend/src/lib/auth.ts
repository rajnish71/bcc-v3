/**
 * Shared authentication helpers for BCC V3
 */

export function clearAuth(): void {
  ['bcc_token', 'bcc_refresh', 'bcc_user'].forEach(k => localStorage.removeItem(k));
  if (typeof document !== 'undefined') {
    document.body.classList.remove('bcc-is-authenticated');
  }
}

export function isSessionValid(): boolean {
  try {
    const token = localStorage.getItem('bcc_token');
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()) {
      return true;
    }
    // If access token is expired, session is potentially valid if refresh token exists
    const refresh = localStorage.getItem('bcc_refresh');
    return Boolean(refresh);
  } catch {
    return false;
  }
}

export type RefreshResult =
  | { status: 'valid'; token: string }
  | { status: 'rejected' }
  | { status: 'network_error' };

export async function getValidToken(apiBase = '/api/v1'): Promise<string | null> {
  const res = await resolveValidToken(apiBase);
  return res.status === 'valid' ? res.token : null;
}

let inFlightRefresh: Promise<RefreshResult> | null = null;

export async function resolveValidToken(apiBase = '/api/v1'): Promise<RefreshResult> {
  const token = localStorage.getItem('bcc_token');
  const refresh = localStorage.getItem('bcc_refresh');

  if (!token && !refresh) {
    clearAuth();
    return { status: 'rejected' };
  }

  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        // Token still valid for > 60 seconds
        if (typeof payload.exp === 'number' && Date.now() < (payload.exp * 1000) - 60_000) {
          return { status: 'valid', token };
        }
      }
    } catch {
      // Invalid format, try refresh
    }
  }

  if (!refresh) {
    clearAuth();
    return { status: 'rejected' };
  }

  // Deduplicate concurrent refresh attempts: share one single in-flight operation
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async (): Promise<RefreshResult> => {
    try {
      let res: Response;
      try {
        res = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
      } catch {
        // Transport/network failure: network failure does not prove session is invalid
        return { status: 'network_error' };
      }

      if (!res.ok) {
        clearAuth();
        return { status: 'rejected' };
      }

      // Successful HTTP response: validate JSON format and non-empty string tokens
      let data: any;
      try {
        data = await res.json();
      } catch {
        // Malformed JSON on 200 response: server returned unusable data
        clearAuth();
        return { status: 'rejected' };
      }

      if (
        !data ||
        typeof data.accessToken !== 'string' ||
        data.accessToken.trim() === '' ||
        typeof data.refreshToken !== 'string' ||
        data.refreshToken.trim() === ''
      ) {
        // Missing or non-string tokens: never write "undefined" to localStorage
        clearAuth();
        return { status: 'rejected' };
      }

      localStorage.setItem('bcc_token', data.accessToken);
      localStorage.setItem('bcc_refresh', data.refreshToken);
      return { status: 'valid', token: data.accessToken };
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export async function logout(): Promise<void> {
  const refresh = localStorage.getItem('bcc_refresh');
  if (refresh) {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
    } catch (err) {
      // Non-blocking catch
      console.error('Logout request failed', err);
    }
  }
  clearAuth();
  window.location.replace('/');
}
