/**
 * Offline mode — the user-facing switch, mirroring Spotify's.
 *
 * Spotify separates two stores: DOWNLOADS (things the listener explicitly kept,
 * encrypted, app-only, on a 30-day licence) and CACHE (evicted automatically
 * under storage pressure). We already have that split — an AES-GCM vault for
 * downloads and a small snapshot cache for browsing.
 *
 * What we did NOT have was Offline mode itself: a switch that says "no network
 * from here on, show me only what I have". Without it, turning on airplane mode
 * leaves the UI offering tracks that cannot possibly play, because nothing
 * consults the vault when building lists or queues.
 *
 * This store is the single source of truth for that switch. It is deliberately
 * tiny and synchronous so anything can read it without awaiting:
 *
 *   - persisted, so it survives a cold start (the WebView is killed constantly
 *     on mobile, and a mode that resets itself would be useless);
 *   - readable outside React, so the player store can consult it while building
 *     a queue rather than through a hook.
 */
import { create } from "zustand";

const STORAGE_KEY = "wesu:offline-mode";

function readPersisted(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode / quota. Default to off rather than trapping the listener in
    // a mode they cannot leave.
    return false;
  }
}

function persist(enabled: boolean): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* best effort */
  }
}

export interface OfflineModeState {
  enabled: boolean;
  /** Turn it on or off, and remember. */
  setEnabled: (next: boolean) => void;
  toggle: () => void;
  /**
   * Re-read from storage. Called once on mount, because the module is evaluated
   * during SSR where localStorage does not exist — so the first render must not
   * assume the browser's value.
   */
  hydrate: () => void;
}

export const useOfflineMode = create<OfflineModeState>((set, get) => ({
  // Server render: never claim offline mode, or the HTML and the first client
  // render disagree and React warns.
  enabled: false,
  setEnabled: (next) => {
    persist(next);
    set({ enabled: next });
  },
  toggle: () => {
    const next = !get().enabled;
    persist(next);
    set({ enabled: next });
  },
  hydrate: () => {
    const stored = readPersisted();
    if (stored !== get().enabled) set({ enabled: stored });
  },
}));

/**
 * Read offline mode from outside React.
 *
 * `useOfflineMode.getState()` is the live store value, which is what the player
 * needs while building a queue — a hook cannot be called from a store method.
 */
export function offlineModeEnabled(): boolean {
  try {
    return useOfflineMode.getState().enabled;
  } catch {
    return false;
  }
}
