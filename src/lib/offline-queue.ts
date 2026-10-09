/**
 * Offline-mode queue rules.
 *
 * Pure and free of IndexedDB so it can be tested directly, and so the player
 * store can call it synchronously — a hook or an await inside `setQueue` would
 * make playback depend on a database round trip.
 *
 * The problem: with Offline mode on, a listener taps a track on a shelf and the
 * player builds a queue full of tracks that cannot possibly play. Playback then
 * dies track by track, because each one needs a signed URL it cannot obtain.
 * Spotify avoids this by only ever offering what is on the device.
 *
 * `setQueue` is the single choke point. Every surface — a shelf, an album, a
 * playlist, the queue screen — funnels through it, and the shuffle deck is
 * derived from the resulting queue, so filtering here restricts shuffle and
 * Next/Prev as well.
 */

/** Track shape the rules need. Anything with an id works. */
export interface Identified {
  id: string;
}

export interface OfflineQueuePlan<T extends Identified> {
  /** The tracks that may actually be played. */
  tracks: T[];
  /** Index into `tracks` matching what the caller asked to start on. */
  startIndex: number;
  /** True when offline mode removed at least one track. */
  filtered: boolean;
  /** True when nothing survived, so the caller must not clear playback. */
  empty: boolean;
}

/**
 * Decide what a queue should become under offline mode.
 *
 * `downloadedIds` is empty when the vault index has not been read yet. That is
 * deliberately treated as "nothing is downloaded" only when offline mode is ON
 * — while it is off, an empty set must not silently empty anyone's queue.
 */
export function planOfflineQueue<T extends Identified>(
  requested: T[],
  requestedStartIndex: number,
  offlineMode: boolean,
  downloadedIds: ReadonlySet<string>,
): OfflineQueuePlan<T> {
  const clamp = Math.max(0, Math.min(requestedStartIndex, Math.max(requested.length - 1, 0)));
  const wanted = requested[clamp];

  if (!offlineMode) {
    return {
      tracks: requested,
      startIndex: requested.length ? clamp : 0,
      filtered: false,
      empty: requested.length === 0,
    };
  }

  const tracks = requested.filter((t) => downloadedIds.has(t.id));
  if (!tracks.length) {
    return { tracks: [], startIndex: 0, filtered: requested.length > 0, empty: true };
  }

  // Start on the track that was asked for, not blindly on the first survivor:
  // playing a different song from the one tapped is disorienting, and here it
  // could be one they cannot even see in Offline mode.
  let startIndex = wanted ? tracks.findIndex((t) => t.id === wanted.id) : -1;
  if (startIndex < 0) startIndex = 0;

  return { tracks, startIndex, filtered: tracks.length !== requested.length, empty: false };
}

/**
 * Whether a single track may be appended to a queue under offline mode.
 * Used by add-to-queue, where there is nothing to filter — just a refusal.
 */
export function mayQueueOffline(
  trackId: string,
  offlineMode: boolean,
  downloadedIds: ReadonlySet<string>,
): boolean {
  if (!offlineMode) return true;
  return downloadedIds.has(trackId);
}
