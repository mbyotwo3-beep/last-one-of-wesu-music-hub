/**
 * In-memory index of which tracks are on this device.
 *
 * Why this is a separate module rather than living in offline-vault.ts: the
 * player store must be able to ask "may this track play?" synchronously, with no
 * await, because `setQueue` runs at the moment of a tap. A hook or an IndexedDB
 * round trip there would make playback depend on a database read.
 *
 * Importing the whole vault into the store would drag encryption code and
 * IndexedDB wiring into the player, and the vault is not safe to evaluate during
 * SSR. So this holds the state, offline-vault writes it, and the player reads
 * it. Nothing here touches the DOM.
 *
 * Semantics:
 *   - an EMPTY set means "not read yet", NOT "nothing downloaded". `ready`
 *     distinguishes them. Treating unknown as empty would wipe the queue of
 *     every listener the first time they opened a page after a cold start.
 */

/** False until the first read from the vault completes. */
let ready = false;

/** Synchronous mirror of the vault's track ids. */
let ids: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();

/** Current id set. Empty before the first refresh; check `isVaultIndexReady`. */
export function getCachedVaultIds(): ReadonlySet<string> {
  return ids;
}

export function isVaultIndexReady(): boolean {
  return ready;
}

/** Replace the index. Called by the vault after reading or mutating storage. */
export function setCachedVaultIds(next: Iterable<string>): ReadonlySet<string> {
  ids = new Set(next);
  ready = true;
  for (const fn of listeners) fn();
  return ids;
}

/** Add or remove a single id without a full re-read. */
export function noteVaultChanged(songId: string, present: boolean): void {
  if (!songId) return;
  const next = new Set(ids);
  if (present) next.add(songId);
  else next.delete(songId);
  ids = next;
  ready = true;
  for (const fn of listeners) fn();
}

/** Test seam: forget everything. Only for tests. */
export function __resetVaultIndexForTests(): void {
  ids = new Set();
  ready = false;
  listeners.clear();
}

export function subscribeVaultIndex(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
