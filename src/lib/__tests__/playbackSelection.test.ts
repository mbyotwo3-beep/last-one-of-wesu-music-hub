/**
 * Regression tests for the "wrong song / no song plays" playback bugs.
 *
 * The audio engine (PlayerBar) keys URL resolution off the store's
 * `selectionId` token — NOT the track id — and the play-state sync never
 * touches the <audio> element while a URL is still resolving.
 *
 * These are pure models mirroring stores/player.ts + PlayerBar.tsx so they
 * run in the node test env (no DOM audio element available).
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure models mirroring the implementation
// ---------------------------------------------------------------------------

interface SelState {
  trackId: string | null;
  selectionId: number;
}

/** Mirrors setTrack/setQueue/skip*: every explicit selection bumps the token. */
function selectTrack(state: SelState, trackId: string): SelState {
  return { trackId, selectionId: state.selectionId + 1 };
}

/** Engine key — what the load effect depends on. */
function engineKey(state: SelState): string {
  return `${state.trackId}:${state.selectionId}`;
}

type SyncAction = "noop" | "play" | "pause" | "retry";

/**
 * Mirrors the PlayerBar sync-play-state effect decision.
 * - resolving (audioUrl === undefined) → never touch the element, even when
 *   it still carries the previous song's src.
 * - failed (audioUrl === null) + error + user pressed play → retry resolution.
 */
function decideSyncAction(args: {
  playing: boolean;
  audioUrl: string | null | undefined;
  hasError: boolean;
  elementPaused: boolean;
  elementHasSrc: boolean;
}): SyncAction {
  const { playing, audioUrl, hasError, elementPaused, elementHasSrc } = args;
  if (audioUrl === undefined) return "noop";
  if (playing && audioUrl === null && hasError) return "retry";
  if (playing && elementPaused && elementHasSrc) return "play";
  if (!playing && !elementPaused) return "pause";
  return "noop";
}

// ---------------------------------------------------------------------------
// Selection token: same-song re-selection must produce a NEW engine key
// ---------------------------------------------------------------------------

describe("Selection token forces reload on every selection", () => {
  it("selecting a different song always changes the engine key", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), fc.integer({ min: 0, max: 1000 }), (a, b, start) => {
        fc.pre(a !== b);
        const s0: SelState = { trackId: a, selectionId: start };
        const s1 = selectTrack(s0, b);
        expect(engineKey(s1)).not.toBe(engineKey(s0));
      }),
      { numRuns: 100 },
    );
  });

  it("re-selecting the SAME song still changes the engine key (queue duplicates / retry)", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.integer({ min: 0, max: 1000 }), (id, start) => {
        const s0: SelState = { trackId: id, selectionId: start };
        const s1 = selectTrack(s0, id);
        expect(s1.selectionId).toBe(s0.selectionId + 1);
        expect(engineKey(s1)).not.toBe(engineKey(s0));
      }),
      { numRuns: 100 },
    );
  });

  it("N consecutive selections produce N distinct engine keys", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 100 }),
        (ids, start) => {
          let s: SelState = { trackId: null, selectionId: start };
          const keys = new Set<string>();
          for (const id of ids) {
            s = selectTrack(s, id);
            keys.add(engineKey(s));
          }
          expect(keys.size).toBe(ids.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Cover hydration model (mirrors hydrateTrackCovers in stores/player.ts):
// fills only missing covers, preserves existing ones, covers duplicates
// via shared song id, and never counts as a new selection.
// ---------------------------------------------------------------------------

interface HydTrack {
  id: string;
  coverUrl?: string | null;
}

function hydrateTrackCovers(
  track: HydTrack | null,
  queue: HydTrack[],
  covers: Record<string, string>,
): { track: HydTrack | null; queue: HydTrack[]; changed: boolean } {
  let changed = false;
  const fill = (t: HydTrack): HydTrack => {
    const url = covers[t.id];
    if (!t.coverUrl && url) {
      changed = true;
      return { ...t, coverUrl: url };
    }
    return t;
  };
  const nextTrack = track ? fill(track) : track;
  let nextQueue = queue;
  if (changed || queue.some((t) => !t.coverUrl && covers[t.id])) {
    nextQueue = queue.map(fill);
  }
  return { track: nextTrack, queue: nextQueue, changed: changed || nextQueue !== queue };
}

describe("Cover hydration fills only what is missing", () => {
  it("fills missing covers, preserves existing ones", () => {
    const track = { id: "a" };
    const queue = [{ id: "a" }, { id: "b", coverUrl: "keep" }, { id: "c" }];
    const { track: t, queue: q, changed } = hydrateTrackCovers(track, queue, {
      a: "url-a",
      b: "url-b",
      c: "url-c",
    });
    expect(changed).toBe(true);
    expect(t?.coverUrl).toBe("url-a");
    expect(q[0].coverUrl).toBe("url-a");
    expect(q[1].coverUrl).toBe("keep");
    expect(q[2].coverUrl).toBe("url-c");
  });

  it("no missing covers → no change", () => {
    const track = { id: "a", coverUrl: "x" };
    const queue = [{ id: "a", coverUrl: "x" }];
    const res = hydrateTrackCovers(track, queue, { a: "other" });
    expect(res.changed).toBe(false);
    expect(res.track).toBe(track);
    expect(res.queue).toBe(queue);
  });

  it("unknown ids stay empty (deleted songs keep the placeholder)", () => {
    const { queue, changed } = hydrateTrackCovers(null, [{ id: "gone" }], {});
    expect(changed).toBe(false);
    expect(queue[0].coverUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sync guard: never play stale audio while resolving
// ---------------------------------------------------------------------------

describe("Sync guard never touches the element while resolving", () => {
  it("resolving + playing + stale src attached → noop (old song must not resume)", () => {
    fc.assert(
      fc.property(fc.boolean(), (elementPaused) => {
        const action = decideSyncAction({
          playing: true,
          audioUrl: undefined, // URL still resolving
          hasError: false,
          elementPaused,
          elementHasSrc: true, // stale previous-song src
        });
        expect(action).toBe("noop");
      }),
      { numRuns: 100 },
    );
  });

  it("resolved + playing + paused + src → play", () => {
    const action = decideSyncAction({
      playing: true,
      audioUrl: "https://cdn.example/song.mp3",
      hasError: false,
      elementPaused: true,
      elementHasSrc: true,
    });
    expect(action).toBe("play");
  });

  it("failed + error + user pressed play → retry (never silent stuck)", () => {
    const action = decideSyncAction({
      playing: true,
      audioUrl: null, // resolution failed
      hasError: true,
      elementPaused: true,
      elementHasSrc: false,
    });
    expect(action).toBe("retry");
  });

  it("failed without pressing play → noop (no retry loop by itself)", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (paused, src) => {
        const action = decideSyncAction({
          playing: false,
          audioUrl: null,
          hasError: true,
          elementPaused: paused,
          elementHasSrc: src,
        });
        expect(action).not.toBe("retry");
      }),
      { numRuns: 100 },
    );
  });

  it("paused + element playing → pause", () => {
    const action = decideSyncAction({
      playing: false,
      audioUrl: "https://cdn.example/song.mp3",
      hasError: false,
      elementPaused: false,
      elementHasSrc: true,
    });
    expect(action).toBe("pause");
  });
});
