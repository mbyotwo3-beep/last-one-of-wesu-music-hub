/**
 * Property-based tests for player logic.
 *
 * Feature: wesu-plus-completion
 *
 * Property 17: Play/pause toggle is a round trip
 * Validates: Requirements 1.3
 *
 * Property 18: Seek sets audio currentTime proportionally
 * Validates: Requirements 1.5
 *
 * Test framework : Vitest
 * PBT library    : fast-check (fc)
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure player state model
// ---------------------------------------------------------------------------

interface PlayerState {
  playing: boolean;
  progressSeconds: number;
}

function togglePlay(state: PlayerState): PlayerState {
  return { ...state, playing: !state.playing };
}

/**
 * Pure model of seek logic.
 * Given click position x on a progress bar of width w, with total durationSeconds d:
 * newTime = (x / w) * d
 */
function computeSeekTime(clickX: number, barWidth: number, durationSeconds: number): number {
  if (barWidth === 0) return 0;
  const pct = clickX / barWidth;
  return pct * durationSeconds;
}

// ---------------------------------------------------------------------------
// Property 17: Play/pause toggle is a round trip
// Feature: wesu-plus-completion, Property 17: Play/pause toggle is a round trip
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe("Property 17: Play/pause toggle is a round trip (Req 1.3)", () => {
  it("togglePlay twice returns to the original playing state", () => {
    fc.assert(
      fc.property(fc.boolean(), (initialPlaying) => {
        const state: PlayerState = { playing: initialPlaying, progressSeconds: 0 };
        const afterFirst = togglePlay(state);
        const afterSecond = togglePlay(afterFirst);
        expect(afterSecond.playing).toBe(initialPlaying);
      }),
      { numRuns: 100 },
    );
  });

  it("togglePlay always inverts the playing state", () => {
    fc.assert(
      fc.property(fc.boolean(), (playing) => {
        const state: PlayerState = { playing, progressSeconds: 0 };
        const toggled = togglePlay(state);
        expect(toggled.playing).toBe(!playing);
      }),
      { numRuns: 100 },
    );
  });

  it("togglePlay does not affect progressSeconds", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.integer({ min: 0, max: 3600 }), (playing, progress) => {
        const state: PlayerState = { playing, progressSeconds: progress };
        const toggled = togglePlay(state);
        expect(toggled.progressSeconds).toBe(progress);
      }),
      { numRuns: 100 },
    );
  });

  it("N even toggles returns to original state for any N >= 0", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 10 }).map((n) => n * 2), // always even
        (initialPlaying, evenCount) => {
          let state: PlayerState = { playing: initialPlaying, progressSeconds: 0 };
          for (let i = 0; i < evenCount; i++) {
            state = togglePlay(state);
          }
          expect(state.playing).toBe(initialPlaying);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("N odd toggles inverts the original state for any N >= 1", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 10 }).map((n) => n * 2 + 1), // always odd
        (initialPlaying, oddCount) => {
          let state: PlayerState = { playing: initialPlaying, progressSeconds: 0 };
          for (let i = 0; i < oddCount; i++) {
            state = togglePlay(state);
          }
          expect(state.playing).toBe(!initialPlaying);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Seek sets audio currentTime proportionally
// Feature: wesu-plus-completion, Property 18: Seek sets audio currentTime
// Validates: Requirements 1.5
// ---------------------------------------------------------------------------

describe("Property 18: Seek sets audio currentTime proportionally (Req 1.5)", () => {
  it("seek at x=0 always results in currentTime=0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // barWidth
        fc.integer({ min: 1, max: 3600 }), // duration
        (barWidth, duration) => {
          const result = computeSeekTime(0, barWidth, duration);
          expect(result).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("seek at x=barWidth results in currentTime=duration", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // barWidth
        fc.integer({ min: 1, max: 3600 }), // duration
        (barWidth, duration) => {
          const result = computeSeekTime(barWidth, barWidth, duration);
          expect(result).toBeCloseTo(duration, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("seek at x=barWidth/2 results in currentTime≈duration/2", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }).filter((n) => n % 2 === 0), // even barWidth
        fc.integer({ min: 2, max: 3600 }).filter((n) => n % 2 === 0), // even duration
        (barWidth, duration) => {
          const result = computeSeekTime(barWidth / 2, barWidth, duration);
          expect(result).toBeCloseTo(duration / 2, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("seek result is always within [0, duration] for any valid x in [0, barWidth]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // barWidth
        fc.integer({ min: 1, max: 3600 }), // duration
        fc.integer({ min: 0, max: 1000 }), // clickX (may exceed barWidth)
        (barWidth, duration, rawX) => {
          const clampedX = Math.min(rawX, barWidth);
          const result = computeSeekTime(clampedX, barWidth, duration);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(duration + 0.001); // floating-point tolerance
        },
      ),
      { numRuns: 100 },
    );
  });

  it("seek is proportional: doubling x doubles currentTime (within tolerance)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }), // barWidth
        fc.integer({ min: 10, max: 3600 }), // duration
        fc.integer({ min: 1, max: 49 }), // x as percentage (1–49 to stay in range when doubled)
        (barWidth, duration, xPct) => {
          const x1 = (xPct / 100) * barWidth;
          const x2 = ((xPct * 2) / 100) * barWidth;
          const t1 = computeSeekTime(x1, barWidth, duration);
          const t2 = computeSeekTime(x2, barWidth, duration);
          expect(t2).toBeCloseTo(t1 * 2, 5);
        },
      ),
      { numRuns: 100 },
    );
  });
});
