/**
 * The single definition of "offline", shared by the UI and the player.
 *
 * WHY THIS IS NOT IN THE HOOK
 *
 * `useOfflineAvailability` cannot be used from the player store: `setQueue` runs
 * at the instant of a tap, and a hook cannot be called outside a component. So
 * the rule has to live somewhere both can reach, or the two drift.
 *
 * They already had drifted, and it matters:
 *
 *   UI       — treated "no connection" as offline, so the interface said so
 *   player   — filtered the queue only under the listener's Offline MODE
 *
 * With the network genuinely down and the mode off, the player therefore built a
 * queue of tracks it could not play, and each one died at the moment it asked
 * for a signed URL. Nothing crashed, so nothing was logged — the shelf simply
 * did not play, which reads as "the app is broken" rather than "there is no
 * data". Spotify's rule is simpler than that and has no special case:
 *
 *     offline = no connection  OR  listener chose downloads-only
 *
 * The mode is the switch you can reach; the connection is the one you cannot.
 * Both mean the same thing to playback.
 */

/** Read connectivity without touching the DOM APIs that SSR lacks. */
export function readOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export interface OfflineState {
  /** `navigator.onLine !== false`. */
  online: boolean;
  /** The listener's Offline mode switch. */
  modeOn: boolean;
  /** False until the vault index has been read once. */
  vaultReady: boolean;
}

/** One song's state, for the per-item question. */
export interface OfflineInputs extends OfflineState {
  /** Is this song on this device? */
  downloaded: boolean;
}

/**
 * Must the queue be filtered to downloads right now?
 *
 * NOTE WHAT IS NOT A PARAMETER: whether a given song is downloaded. This is a
 * question about the DEVICE, not about a track. When the answer is yes, the
 * caller filters and the downloaded tracks survive — so passing `downloaded`
 * here invites reading this as "may this track play", which is
 * `isUnavailableOffline`'s job and gives the opposite answer.
 *
 * `vaultReady` matters more than it looks. The vault index is EMPTY until its
 * first read completes, and "empty" would otherwise mean "nothing downloaded" —
 * which would empty the queue of every listener the instant they opened the app
 * with no data. A wrong queue on the first tap is recoverable; a silent player
 * is not. So an unread index filters nothing and the next read corrects it.
 */
export function mustFilterQueue(state: OfflineState): boolean {
  return (state.modeOn || !state.online) && state.vaultReady;
}

/**
 * May this single song play right now?
 *
 * An item that is unread (vault not ready) counts as playable, for the same
 * reason: the optimistic reading produces a tap that fails loudly, whereas the
 * pessimistic one hides content the listener is entitled to see.
 */
export function isUnavailableOffline(inputs: OfflineInputs): boolean {
  const offline = inputs.modeOn || !inputs.online;
  return offline && inputs.vaultReady && !inputs.downloaded;
}

/** The chip's wording, so the two offline states cannot be conflated again. */
export function describeOfflineChip(
  online: boolean,
  modeOn: boolean,
): { label: string; action: "downloads" | "turn-off"; tone: "muted" | "amber" } | null {
  if (online && !modeOn) return null;
  if (!online) return { label: "No connection", action: "downloads", tone: "amber" };
  return { label: "Offline mode", action: "turn-off", tone: "muted" };
}