import { describe, expect, it } from "vitest";
import {
  buildShuffleDeck,
  insertIndexForPlayNext,
  pickNextIndex,
  type ShuffleDeck,
} from "@/stores/play-order";

/**
 * The old shuffle drew `Math.floor(Math.random() * queue.length)` on every
 * skip. These tests pin the behaviour that actually matters to a listener:
 * never replay the current track, never repeat until everything has played.
 */
describe("play order", () => {
  describe("shuffle", () => {
    it("never returns the track that is currently playing", () => {
      // Run many trials: a random pick would eventually collide.
      for (let trial = 0; trial < 500; trial++) {
        const len = 5;
        const current = 2;
        const deck = buildShuffleDeck(len, current);
        const first = pickNextIndex({
          queueLength: len,
          queueIndex: current,
          shuffle: true,
          repeat: "off",
          deck,
        });
        expect(first.index).not.toBe(current);
        expect(first.index).not.toBeNull();
      }
    });

    it("plays every other track exactly once before repeating any", () => {
      const len = 6;
      const current = 0;
      let deck: ShuffleDeck | null = buildShuffleDeck(len, current);
      const played = [current];
      for (let i = 0; i < len - 1; i++) {
        const r = pickNextIndex({
          queueLength: len,
          queueIndex: played[played.length - 1],
          shuffle: true,
          repeat: "off",
          deck,
        });
        expect(r.index).not.toBeNull();
        played.push(r.index as number);
        deck = r.deck;
      }
      // Full pass, no duplicates, nothing missed.
      expect(new Set(played).size).toBe(len);
      // The deck is now exhausted and repeat is off → stop.
      const end = pickNextIndex({
        queueLength: len,
        queueIndex: played[played.length - 1],
        shuffle: true,
        repeat: "off",
        deck,
      });
      expect(end.index).toBeNull();
    });

    it("makes progress: consecutive picks are never the same track", () => {
      let deck: ShuffleDeck | null = buildShuffleDeck(8, 3);
      let at = 3;
      const seen: number[] = [at];
      for (let i = 0; i < 7; i++) {
        const r = pickNextIndex({
          queueLength: 8,
          queueIndex: at,
          shuffle: true,
          repeat: "off",
          deck,
        });
        if (r.index === null) break;
        expect(r.index).not.toBe(at);
        at = r.index;
        seen.push(at);
        deck = r.deck;
      }
      expect(new Set(seen).size).toBe(seen.length);
    });

    it("starts a fresh pass when repeat is on, instead of stopping", () => {
      const len = 3;
      let deck: ShuffleDeck | null = buildShuffleDeck(len, 0);
      let at = 0;
      // Burn the whole deck.
      for (let i = 0; i < len - 1; i++) {
        const r = pickNextIndex({
          queueLength: len,
          queueIndex: at,
          shuffle: true,
          repeat: "all",
          deck,
        });
        at = r.index as number;
        deck = r.deck;
      }
      // Deck exhausted but repeat "all" → keep going.
      const r = pickNextIndex({
        queueLength: len,
        queueIndex: at,
        shuffle: true,
        repeat: "all",
        deck,
      });
      expect(r.index).not.toBeNull();
      expect(r.index).not.toBe(at);
    });

    it("stops at the end when repeat is off", () => {
      const r = pickNextIndex({
        queueLength: 3,
        queueIndex: 2,
        shuffle: false,
        repeat: "off",
        deck: null,
      });
      expect(r.index).toBeNull();
    });

    it("handles a single-track queue without looping forever", () => {
      const r = pickNextIndex({
        queueLength: 1,
        queueIndex: 0,
        shuffle: true,
        repeat: "all",
        deck: null,
      });
      // Nothing else to play, so there is no next track.
      expect(r.index).toBeNull();
    });
  });

  describe("in order", () => {
    it("advances one at a time", () => {
      expect(
        pickNextIndex({ queueLength: 5, queueIndex: 0, shuffle: false, repeat: "off", deck: null })
          .index,
      ).toBe(1);
      expect(
        pickNextIndex({ queueLength: 5, queueIndex: 3, shuffle: false, repeat: "off", deck: null })
          .index,
      ).toBe(4);
    });

    it("wraps to the start only when repeat is on", () => {
      expect(
        pickNextIndex({ queueLength: 5, queueIndex: 4, shuffle: false, repeat: "all", deck: null })
          .index,
      ).toBe(0);
      expect(
        pickNextIndex({ queueLength: 5, queueIndex: 4, shuffle: false, repeat: "off", deck: null })
          .index,
      ).toBeNull();
    });
  });

  it("'play next' inserts directly after the current track", () => {
    expect(insertIndexForPlayNext(10, 0)).toBe(1);
    expect(insertIndexForPlayNext(10, 4)).toBe(5);
    // Cannot insert past the end.
    expect(insertIndexForPlayNext(3, 2)).toBe(3);
  });
});
