/**
 * Optimistic state rules for Liked Songs.
 *
 * Pure so they can be tested directly. They exist because the like/unlike
 * button inverted: tapping "add" removed the track.
 *
 * The cause was ordering. React Query runs `onMutate` BEFORE `mutationFn`, so
 * the hook could not read the cache inside `mutationFn` to work out what the
 * user wanted — by then `onMutate` had already flipped the cache. The hook saw
 * the id it had just optimistically added, concluded "this is saved, so
 * unsave", and told the server to unsave. The server did exactly that and
 * truthfully reported `action: "unsaved"`, so the toast said "Removed from
 * Liked Songs" immediately after the listener pressed like.
 *
 * The fix is to decide intent ONCE, at tap time, before any optimistic write,
 * and carry that decision through as the mutation variable. These two functions
 * are that decision, kept separate from React so a regression is a test failure
 * rather than a user report.
 */

/**
 * What does this tap mean, given the cache as it stands right now?
 *
 * Read the live cache rather than a render closure so a second tap in the same
 * tick still computes the opposite of the first.
 */
export function shouldSaveTrack(current: readonly string[], songId: string): boolean {
  return !current.includes(songId);
}

/**
 * The cache after the tap, applied optimistically.
 *
 * Guarded against duplicates: a stale render that thinks a track is unliked
 * would otherwise push a second copy of the id into the array, and `includes`
 * would still say "saved" while the list showed it twice.
 */
export function nextSavedIds(
  previous: readonly string[],
  songId: string,
  shouldSave: boolean,
): string[] {
  const without = previous.filter((id) => id !== songId);
  return shouldSave ? [...without, songId] : without;
}
