/**
 * Tests for the canonical genre list (src/lib/genres.ts).
 *
 * Free-text genres produced duplicate categories ("Gospel" vs "gospel" vs
 * "Gospel Music"). Every write and every shelf grouping now folds through
 * normalizeGenre() so each category appears exactly once.
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { MUSIC_GENRES, normalizeGenre, isCanonicalGenre } from "../genres";

describe("canonical genre list", () => {
  it("contains no duplicates (case-insensitive)", () => {
    const keys = MUSIC_GENRES.map((g) => g.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes Gospel exactly once", () => {
    expect(MUSIC_GENRES.filter((g) => g.toLowerCase() === "gospel")).toEqual(["Gospel"]);
  });
});

describe("normalizeGenre", () => {
  it("folds case/whitespace variants into canonical values", () => {
    for (const [raw, expected] of [
      ["gospel", "Gospel"],
      ["GOSPEL", "Gospel"],
      ["  Gospel  ", "Gospel"],
      ["Gospel  Music", "Gospel"],
      ["hiphop", "Hip Hop"],
      ["Hip-Hop", "Hip Hop"],
      ["rnb", "R&B"],
      ["R N B", "R&B"],
      ["kwasa-kwasa", "Kwasa Kwasa"],
      ["  afro   beats  ", "Afrobeat"],
    ] as const) {
      expect(normalizeGenre(raw)).toBe(expected);
    }
  });

  it("keeps canonical values stable (idempotent)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...MUSIC_GENRES), (g) => {
        expect(normalizeGenre(g)).toBe(g);
        expect(normalizeGenre(g.toUpperCase())).toBe(g);
      }),
      { numRuns: 100 },
    );
  });

  it("never destroys unknown input, blanks stay blank", () => {
    expect(normalizeGenre("  Kwaito  ")).toBe("Kwaito");
    expect(normalizeGenre("")).toBe("");
    expect(normalizeGenre(null)).toBe("");
    expect(normalizeGenre(undefined)).toBe("");
  });

  it("isCanonicalGenre matches the list only", () => {
    expect(isCanonicalGenre("Gospel")).toBe(true);
    expect(isCanonicalGenre("gospel")).toBe(true);
    expect(isCanonicalGenre("Kwaito")).toBe(false);
    expect(isCanonicalGenre("")).toBe(false);
  });
});
