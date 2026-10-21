/**
 * Offline state — implicit, never a switch.
 *
 * WHAT CHANGED (Spotify/YouTube framing)
 *
 * This used to be the user-facing "Offline mode": a switch on /downloads the
 * listener used to force downloads-only playback (persisted in a cookie +
 * localStorage, surviving cold starts). Listeners had to understand and
 * remember it — exactly the kind of switch nobody actually wants; YouTube and
 * Spotify get along without one, and our users did not ask for one either.
 *
 * So there is no user-facing mode any more. The behaviour the switch used to
 * produce — only downloaded songs play, browsing degrades to cached data — is
 * now simply what happens when the NETWORK is down, automatically:
 *
 *   hydrate() mirrors navigator.onLine into `enabled` on boot.
 *   OfflineLifecycle mirrors the online/offline events into the store, so a
 *   mid-session signal loss (train, then tunnel) behaves like a cold start:
 *   downloaded music keeps playing and nothing tries to stream.
 *   When connectivity returns the store flips back — no stale leftovers.
 *
 * Consumers (player.ts, use-offline-availability) keep treating `enabled` as
 * "downloads only" — `mustFilterQueue` is `(modeOn || !online) && vaultReady`,
 * so decision-making is unchanged; only the source of truth moved.
 *
 * setEnabled() stays in the public surface: OfflineLifecycle drives it on
 * connectivity edges, and tests own it directly. Legacy persisted values from
 * the switch era are ignored on read rather than migrated: an online phone
 * with a stale "1" in storage streams again, because that is what being
 * ONLINE should mean.
 *
 * The vault index is still primed on every hydrate and every transition into
 * offline. The player consults that index synchronously and refuses to queue
 * anything missing from it — and it deliberately ignores an index that has
 * not been read yet (so a cold start does not silence playback). Reading the
 * index here closes the "first tap after the signal drops" window.
 *
 * Imported lazily: the vault touches IndexedDB and cannot be evaluated during
 * SSR, and this store is imported by the player, which runs on the server too.
 */
import { create } from "zustand";

function primeVaultIndex(): void {
  void import("@/lib/offline-vault")
    .then((m) => m.refreshVaultIdCache())
    .catch(() => {
      /* no vault here — the mode simply has nothing to allow */
    });
}

/** Connectivity from the browser's own signal. SSR-safe: online is the default. */
export function isCurrentlyOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export interface OfflineModeState {
  /** True —ONLY— while the network is down: downloads-only playback. */
  enabled: boolean;
  /** Internal + lifecycle-driven: mirror `enabled` to a connectivity change. */
  setEnabled: (next: boolean) => void;
  /**
   * Re-read from connectivity. Called once on mount (the module is evaluated
   * during SSR where navigator does not exist — the first render must not
   * assume the browser's reachability).
   */
  hydrate: () => void;
}

export const useOfflineMode = create<OfflineModeState>((set) => ({
  // Server render: never claim offline, or the HTML and the first client
  // render disagree and React warns.
  enabled: false,

  setEnabled: (next) => {
    set({ enabled: next });
    // Going offline must arm the vault index NOW. Waiting for the first
    // failed stream to lazily read it means the first tap after a signal
    // loss flows unfiltered into a doomed resolution path.
    if (next) primeVaultIndex();
  },

  hydrate: () => {
    const offline = !isCurrentlyOnline();
    set({ enabled: offline });
    // The index is read on EVERY boot, not only when offline.
    //
    // It also marks the index AS READ, which is the input the no-connection
    // path in the player and the dimmed rows both gate on. Leaving it
    // conditional made "vault not read yet" a permanent state for a listener
    // who never opens the downloads page: a dropped connection would dim
    // nothing and filter nothing — the old silent-failure bug, back again.
    //
    // The cold-start guard lives in the READERS (isVaultIndexReady / the
    // planOfflineQueue guard), not here: a boot read that costs one IndexedDB
    // metadata sweep is safe, while treating an unread marker as empty is what
    // this store existed to prevent.
    primeVaultIndex();
  },
}));

/**
 * Read offline state from outside React.
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
