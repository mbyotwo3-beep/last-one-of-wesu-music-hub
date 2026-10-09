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

/**
 * localStorage with a document.cookie fallback.
 *
 * The WebView can run with storage partitioned or blocked, and an
 * IndexedDB-only store would leave the mode silently resetting to off on every
 * cold start — a switch that forgets itself is worse than none. Cookies have
 * survived cases where localStorage has not, so try both.
 *
 * Last write wins, and reads tolerate anything unexpected.
 */
function readCookie(): boolean | null {
  try {
    if (typeof document === "undefined") return null;
    const hit = /(?:^|;\s*)wesu-offline-mode=([01])/.exec(document.cookie);
    if (!hit) return null;
    return hit[1] === "1";
  } catch {
    return null;
  }
}

function writeCookie(enabled: boolean): void {
  try {
    if (typeof document === "undefined") return;
    const maxAge = enabled ? 60 * 60 * 24 * 365 : 0;
    // SameSite=Lax so this never rides along on a cross-site request.
    document.cookie = `wesu-offline-mode=${enabled ? "1" : "0"}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    /* best effort */
  }
}

function readPersisted(): boolean {
  const cookie = readCookie();
  if (cookie !== null) return cookie;
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
  writeCookie(enabled);
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

/**
 * Load the vault id index once the mode is on.
 *
 * The player refuses to queue anything not in that index, and it deliberately
 * ignores an index that has not been read yet (so a cold start does not silence
 * playback). The consequence is that the FIRST tap after enabling the mode can
 * slip through unfiltered. Reading the index here closes that window.
 *
 * Imported lazily: the vault touches IndexedDB and cannot be evaluated during
 * SSR, and this store is imported by the player, which runs on the server too.
 */
function primeVaultIndex(): void {
  void import("@/lib/offline-vault")
    .then((m) => m.refreshVaultIdCache())
    .catch(() => {
      /* no vault here — the mode simply has nothing to allow */
    });
}

export const useOfflineMode = create<OfflineModeState>((set, get) => ({
  // Server render: never claim offline mode, or the HTML and the first client
  // render disagree and React warns.
  enabled: false,
  setEnabled: (next) => {
    persist(next);
    set({ enabled: next });
    if (next) primeVaultIndex();
  },
  toggle: () => {
    const next = !get().enabled;
    persist(next);
    set({ enabled: next });
    if (next) primeVaultIndex();
  },
  hydrate: () => {
    const stored = readPersisted();
    if (stored !== get().enabled) set({ enabled: stored });
    if (stored) primeVaultIndex();
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
