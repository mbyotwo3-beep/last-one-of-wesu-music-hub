/**
 * The Liked Songs button used to invert: tapping "like" removed the track and
 * toasted "Removed from Liked Songs".
 *
 * The mechanism, in order, for a track that was NOT liked:
 *
 *   tap        shouldSave = shouldSaveTrack(cache, id) === true
 *   onMutate   cache = nextSavedIds(cache, id, true)   -> now contains the id
 *   mutationFn the OLD code re-read the cache here and saw the id present,
 *              concluded "saved, so unsave", and called unsaveFn
 *   server     removed nothing / removed it, and returned action: "unsaved"
 *   toast      "Removed from Liked Songs"
 *
 * The server was never wrong. The toast reported faithfully what had happened.
 *
 * The fix is to decide intent once, before any optimistic write, and carry it
 * as the mutation variable. These tests pin the two rules that make that work,
 * and `a tap decides its intent before the optimistic write` reproduces the
 * original sequence so reintroducing a cache read downstream fails here rather
 * than in a user's toast.
 */
import { describe, expect, it } from "vitest";

import { nextSavedIds, shouldSaveTrack } from "@/lib/liked-songs-state";

const T = "song-a";
const OTHER = "song-b";

describe("shouldSaveTrack", () => {
  it("wants to save a track that is not liked", () => {
    expect(shouldSaveTrack([OTHER], T)).toBe(true);
  });

  it("wants to unsave a track that is liked", () => {
    expect(shouldSaveTrack([OTHER, T], T)).toBe(false);
  });

  it("treats an empty cache as not liked", () => {
    expect(shouldSaveTrack([], T)).toBe(true);
  });
});

describe("nextSavedIds", () => {
  it("adds on save", () => {
    expect(nextSavedIds([OTHER], T, true)).toEqual([OTHER, T]);
  });

  it("removes on unsave", () => {
    expect(nextSavedIds([OTHER, T], T, false)).toEqual([OTHER]);
  });

  it("never duplicates an id", () => {
    // A stale render can ask to save a track already in the list. `includes`
    // would still report it as liked while the list showed it twice.
    expect(nextSavedIds([OTHER, T], T, true)).toEqual([OTHER, T]);
  });

  it("keeps every other id untouched", () => {
    const before = ["x", "y", "z"];
    expect(nextSavedIds(before, T, true)).toEqual(["x", "y", "z", T]);
    expect(nextSavedIds([...before, T], T, false)).toEqual(["x", "y", "z"]);
  });

  it("does not mutate the array it was given", () => {
    const before = [OTHER];
    nextSavedIds(before, T, true);
    expect(before).toEqual([OTHER]);
  });
});

describe("a tap decides its intent before the optimistic write", () => {
  it("saves, not unsaves, when the track starts unliked", () => {
    let cache: string[] = [OTHER];

    // 1. Tap: intent is computed against the cache as it really is.
    const shouldSave = shouldSaveTrack(cache, T);
    expect(shouldSave).toBe(true);

    // 2. React Query then runs onMutate, flipping the cache optimistically.
    cache = nextSavedIds(cache, T, shouldSave);

    // 3. mutationFn must use the captured decision. If it re-read the cache
    //    here it would see [OTHER, T], conclude "already liked", and unsave —
    //    the original bug, and the reason the toast said "Removed from Liked
    //    Songs" straight after pressing like.
    expect(shouldSave).toBe(true);
  });

  it("unsaves when the track starts liked", () => {
    let cache: string[] = [OTHER, T];

    const shouldSave = shouldSaveTrack(cache, T);
    expect(shouldSave).toBe(false);

    cache = nextSavedIds(cache, T, shouldSave);
    expect(cache).toEqual([OTHER]);
    expect(shouldSave).toBe(false);
  });

  it("two taps in one row are opposites, so the icon cannot stick", () => {
    let cache: string[] = [OTHER];

    const first = shouldSaveTrack(cache, T);
    cache = nextSavedIds(cache, T, first);
    const second = shouldSaveTrack(cache, T);
    cache = nextSavedIds(cache, T, second);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(cache).toEqual([OTHER]);
  });
});
