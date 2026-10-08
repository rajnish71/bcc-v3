/**
 * profile-load-gate.ts — initialization state for the Hub profile editor
 * (/hub/profile/).
 *
 * The editor's Save replaces social links, equipment and legacy title rows
 * (delete-then-insert) and writes every main field. Saving a form that never
 * loaded would therefore blank the member's profile. This gate is the single
 * source of truth for "the profile has been loaded, so Save is allowed":
 *
 *   loading  -> initial state, and during every (re)load attempt
 *   loaded   -> only after the profile GET succeeded AND hydration completed
 *   failed   -> any failure (401, other non-2xx, network, parse/hydration)
 *
 * A failed load is never treated as an empty profile. There is no automatic
 * retry; retry() is user-initiated. Pure: no DOM, no fetch -- dependencies are
 * injected so the behaviour is testable.
 */

export type ProfileLoadState = 'loading' | 'loaded' | 'failed';

export interface ProfileLoadGateDeps {
  /** Resolves once HubLayout has finished authentication. */
  waitForHub: () => Promise<void>;
  /** Fetches and hydrates the profile; must throw on any failure. */
  load: () => Promise<void>;
  /** Called on every state change (drives Save disabling, status, retry UI). */
  onStateChange: (state: ProfileLoadState) => void;
}

export interface ProfileLoadGate {
  readonly state: ProfileLoadState;
  canSave(): boolean;
  /** Starts a load attempt; concurrent calls share the in-flight attempt. */
  start(): Promise<void>;
}

export function createProfileLoadGate(deps: ProfileLoadGateDeps): ProfileLoadGate {
  let state: ProfileLoadState = 'loading';
  let inFlight: Promise<void> | null = null;

  const set = (next: ProfileLoadState) => {
    state = next;
    deps.onStateChange(next);
  };

  return {
    get state() {
      return state;
    },
    canSave() {
      return state === 'loaded';
    },
    start() {
      if (inFlight) return inFlight;
      set('loading');
      inFlight = (async () => {
        try {
          await deps.waitForHub();
          await deps.load();
          set('loaded');
        } catch {
          set('failed');
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
}

/**
 * Returns the parsed profile body, or throws for any non-2xx status or a
 * body that is not a JSON object -- so a 401 can never hydrate as "empty".
 */
export async function requireProfileBody(res: Response): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`Profile load failed (${res.status})`);
  const body = (await res.json()) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Profile load returned an unexpected response');
  }
  return body as Record<string, unknown>;
}
