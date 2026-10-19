import { useCallback, useSyncExternalStore } from "react";

import { useOfflineMode } from "@/stores/offline-mode";
import {
  getCachedVaultIds,
  isVaultIndexReady,
  subscribeVaultIndex,
} from "@/lib/vault-index";
import {
  isUnavailableOffline,
  mustFilterQueue,
  readOnline,
  type OfflineInputs,
} from "@/lib/offline-availability";

/**
 * "Can this play right now?" — the question Spotify's offline UI is built on.
 *
 * This is the React wrapper around `@/lib/offline-availability`. The RULES live
 * there, not here, because the player store needs the same two of them and
 * cannot call a hook. Everything here is reactivity and nothing else.
 *
 * THE THREE INPUTS
 *
 *   connection  — navigator.onLine, edge-triggered
 *   Offline mode — the listener's own switch, persisted across cold starts
 *   vault       — what is actually on this device
 *
 * THE COLD-START PROBLEM
 *
 * The vault index is empty until its first read completes, and empty would
 * otherwise mean "nothing downloaded". Taken literally, that greys out the whole
 * catalogue on every cold start — a flash of a dead interface. So while the index
 * is not ready, everything is treated as available and nothing is filtered. The
 * first read lands within a frame or two and the truth replaces the guess.
 */

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export interface OfflineAvailability {
  /** No connection, or Offline mode is on. */
  offline: boolean;
  /** No connection at all, as opposed to a deliberate Offline mode session. */
  noConnection: boolean;
  /** The listener chose downloads-only. */
  modeOn: boolean;
  /** False until the vault has been read once. */
  vaultReady: boolean;
  /** Must a queue be filtered to downloads right now? */
  filterQueue: boolean;
  /** May this song play right now? */
  available: (songId?: string | null) => boolean;
  /** Downloaded, and therefore always available. */
  downloaded: (songId?: string | null) => boolean;
}

export function useOfflineAvailability(): OfflineAvailability {
  const online = useSyncExternalStore(subscribeOnline, readOnline, () => true);

  // `.size` is the snapshot key: it changes when the vault does, and is a
  // primitive, so React compares it cheaply. Subscribing to the Set itself would
  // re-render forever because its identity never changes.
  const vaultSize = useSyncExternalStore(
    subscribeVaultIndex,
    () => getCachedVaultIds().size,
    () => 0,
  );
  const vaultReady = useSyncExternalStore(
    subscribeVaultIndex,
    isVaultIndexReady,
    () => false,
  );
  const modeOn = useOfflineMode((s) => s.enabled);

  const downloaded = useCallback(
    (songId?: string | null) => (songId ? getCachedVaultIds().has(songId) : false),
    // vaultSize is in the list so the identity changes when the vault does,
    // which is what makes consumers recompute.
    [vaultSize],
  );

  const base = { online, modeOn, vaultReady };
  const filterQueue = mustFilterQueue(base);

  const available = useCallback(
    (songId?: string | null) =>
      !isUnavailableOffline({
        ...base,
        downloaded: songId ? getCachedVaultIds().has(songId) : false,
      }),
    [online, modeOn, vaultReady, vaultSize],
  );

  return {
    offline: !online || modeOn,
    noConnection: !online,
    modeOn,
    vaultReady,
    filterQueue,
    available,
    downloaded,
  };
}

/**
 * Props to spread on a song element so it dims and refuses playback offline.
 *
 * `data-offline-unavailable` is the part that matters, not the class. The class
 * alone would be satisfied by any element carrying an opacity modifier, which is
 * how a "dimmed" check ends up passing against something that was never dimmed
 * by this code.
 */
export function useOfflineItem(songId?: string | null) {
  const { offline, available } = useOfflineAvailability();
  const dim = offline && !available(songId);

  return {
    dim,
    className: dim
      ? "opacity-45 saturate-50 transition-opacity duration-150"
      : "transition-opacity duration-150",
    props: {
      "data-offline-unavailable": dim ? true : undefined,
      "aria-disabled": dim ? true : undefined,
    } as Record<string, unknown>,
  };
}

export { isUnavailableOffline, mustFilterQueue, type OfflineInputs };