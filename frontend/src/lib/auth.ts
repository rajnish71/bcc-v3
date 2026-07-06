/**
 * Shared authentication helpers for BCC V3
 */

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
  ['bcc_token', 'bcc_refresh', 'bcc_user'].forEach(k => localStorage.removeItem(k));
  window.location.replace('/');
}
