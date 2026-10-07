/**
 * Shuffle-deck invalidation on queue mutation.
 *
 * The deck stores raw queue positions. Only toggleShuffle / removing the
 * playing row / clearQueue rebuilt it, so every other mutation left it
 * pointing at positions that no longer existed: skipNext then drew e.g. 37
 * from a 3-song queue, queue[37] was undefined, and the store kept
 * `track: undefined` with `playing: true` — no bar, no MiniPlayer, silence.
 *
 * These tests pin that no remap/rebuild can produce an out-of-range index for
 * the queue that actually exists afterwards.
 */

import { describe, expect, it } from "vitest";
import {
  addToShuffleDeck,
  buildShuffleDeck,
  insertIndexForPlayNext,
  pickNextIndex,
  rebuildShuffleDeck,
  remapShuffleDeck,
  type ShuffleDeck,
} from "@/stores/play-order";

/** Draw every remaining entry the way skipNext would, bounded by safety. */
function drain(queueLength: number, queueIndex: number, deck: ShuffleDeck | null) {
  const drawn: number[] = [];
  let current = queueIndex;
  let d = deck;
  for (let i = 0; i < queueLength * 3 + 5; i++) {
    const next = pickNextIndex({
      queueLength,
      queueIndex: current,
      shuffle: true,
      repeat: "off",
      deck: d,
    });
    if (next.index === null) break;
    drawn.push(next.index);
    d = next.deck;
    current = next.index;
  }
  return drawn;
}

function expectAllInRange(indices: number[], length: number) {
  for (const i of indices) {
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(length);
  }
}

describe("remapShuffleDeck", () => {
  it("returns null when there is no deck", () => {
    expect(remapShuffleDeck(null, () => 0)).toBeNull();
  });

  it("drops the entry for a removed row and renumbers the rest", () => {
    const deck: ShuffleDeck = { order: [0, 1, 2, 3], cursor: 0, current: 0 };
    // old 2 is gone; old 3 slides down to 2.
    const mapped = remapShuffleDeck(deck, (i) => (i === 2 ? null : i > 2 ? i - 1 : i));
    expect(mapped?.order).toEqual([0, 1, 2]);
    expect(mapped?.current).toBe(0);
  });

  it("shifts later positions down when a row is removed", () => {
    const deck: ShuffleDeck = { order: [0, 1, 2, 3], cursor: 0, current: 0 };
    const length = 3; // one row gone
    const mapped = remapShuffleDeck(deck, (i) => (i === 0 ? null : i - 1));
    expectAllInRange(mapped?.order ?? [], length);
  });

  it("clamps the cursor when entries disappear", () => {
    const deck: ShuffleDeck = { order: [1, 2], cursor: 2, current: 0 };
    const mapped = remapShuffleDeck(deck, () => null);
    expect(mapped?.order).toEqual([]);
    expect(mapped?.cursor).toBe(0);
  });

  it("keeps the cursor when nothing was removed", () => {
    const deck: ShuffleDeck = { order: [1, 2, 3], cursor: 2, current: 0 };
    const mapped = remapShuffleDeck(deck, (i) => i);
    expect(mapped?.cursor).toBe(2);
    expect(mapped?.order).toEqual([1, 2, 3]);
  });

  it("nulls `current` when the playing row disappears", () => {
    const deck: ShuffleDeck = { order: [1, 2], cursor: 0, current: 1 };
    const mapped = remapShuffleDeck(deck, (i) => (i === 1 ? null : i));
    expect(mapped?.current).toBeNull();
  });
});

describe("rebuildShuffleDeck", () => {
  it("returns null when shuffle is off", () => {
    expect(rebuildShuffleDeck(false, 5, 0)).toBeNull();
  });

  it("excludes the current position", () => {
    const deck = rebuildShuffleDeck(true, 5, 3);
    expect(deck?.order).toHaveLength(4);
    expect(deck?.order).not.toContain(3);
    expect(deck?.current).toBe(3);
  });
});

describe("addToShuffleDeck", () => {
  it("returns null when there is no deck", () => {
    expect(addToShuffleDeck(null, 7)).toBeNull();
  });

  it("inserts the new position after everything already consumed", () => {
    const deck: ShuffleDeck = { order: [1, 2, 3], cursor: 2, current: 0 };
    const next = addToShuffleDeck(deck, 4);
    expect(next?.order.slice(0, 2)).toEqual([1, 2]);
    expect(next?.order).toContain(4);
    expect(next?.order.length).toBe(4);
  });
});

describe("queue mutations cannot produce an out-of-range draw", () => {
  it("setQueue: the rebuilt deck never points past the new queue", () => {
    // The reported repro: shuffle on, 50-song queue, then a 3-song queue.
    // Replaying the stale deck is exactly the old failure, so assert both: the
    // hazard is real, and rebuildShuffleDeck is what removes it.
    const stale = drain(3, 0, buildShuffleDeck(50, 7));
    expect(stale.some((i) => i >= 3)).toBe(true);
    expectAllInRange(drain(3, 0, rebuildShuffleDeck(true, 3, 0)), 3);
  });

  it("removeFromQueue before the playing row", () => {
    const length = 6;
    const queueIndex = 4;
    const deck = remapShuffleDeck(buildShuffleDeck(length, queueIndex), (i) =>
      i === 1 ? null : i > 1 ? i - 1 : i,
    );
    expectAllInRange(drain(length - 1, queueIndex - 1, deck), length - 1);
  });

  it("removeFromQueue after the playing row", () => {
    const length = 6;
    const queueIndex = 1;
    const deck = remapShuffleDeck(buildShuffleDeck(length, queueIndex), (i) =>
      i === 5 ? null : i > 5 ? i - 1 : i,
    );
    expectAllInRange(drain(length - 1, queueIndex, deck), length - 1);
  });

  it("playNext shifts everything from the insertion point", () => {
    const length = 5;
    const queueIndex = 1;
    const at = insertIndexForPlayNext(length, queueIndex);
    const deck = addToShuffleDeck(
      remapShuffleDeck(buildShuffleDeck(length, queueIndex), (i) => (i >= at ? i + 1 : i)),
      at,
    );
    expectAllInRange(drain(length + 1, queueIndex, deck), length + 1);
  });

  it("addToQueue keeps existing positions and makes the new one reachable", () => {
    const length = 3;
    const queueIndex = 0;
    const deck = addToShuffleDeck(buildShuffleDeck(length, queueIndex), length);
    const drawn = drain(length + 1, queueIndex, deck);
    expectAllInRange(drawn, length + 1);
    expect(drawn).toContain(length);
  });

  it("moveInQueue (rebuild) never points past the reordered queue", () => {
    const length = 4;
    const deck = rebuildShuffleDeck(true, length, 2);
    expectAllInRange(drain(length, 2, deck), length);
  });
});
