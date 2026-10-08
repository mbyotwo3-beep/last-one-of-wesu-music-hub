/**
 * Progress-bar seek behaviour, tested against the SHIPPED module.
 *
 * This file previously defined its own `computeSeekTime` and `togglePlay` and
 * asserted that those copies behaved. It could not fail when PlayerBar broke,
 * which is how a test becomes decoration: the count grew while the guarantee did
 * not.
 *
 * The maths now lives in @/lib/player-seek and PlayerBar imports it, so these
 * assertions bind to code that ships. If someone reintroduces the arithmetic
 * inline in the component, these tests stop covering it — which is exactly why
 * the extraction exists, and why check-play-order-style drift is worth watching.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { computeSeekTime, seekFraction } from "@/lib/player-seek";

describe("seekFraction", () => {
  it("maps the bar ends to 0 and 1", () => {
    expect(seekFraction(100, 100, 200)).toBe(0);
    expect(seekFraction(300, 100, 200)).toBe(1);
  });

  it("maps the middle to the middle", () => {
    expect(seekFraction(200, 100, 200)).toBe(0.5);
  });

  it("clamps a tap past either end instead of seeking past the track", () => {
    expect(seekFraction(50, 100, 200)).toBe(0);
    expect(seekFraction(400, 100, 200)).toBe(1);
  });

  it("returns 0 for a zero-width bar rather than NaN or Infinity", () => {
    // Dividing by zero here produced NaN, which flowed into seekTo() and on to
    // the audio element's currentTime.
    expect(seekFraction(150, 100, 0)).toBe(0);
  });

  it("never returns NaN for non-finite input", () => {
    expect(Number.isFinite(seekFraction(Number.NaN, 100, 200))).toBe(true);
    expect(seekFraction(Number.NaN, 100, 200)).toBe(0);
  });

  it("is always within 0..1 for any pointer position", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 2000, noNaN: true }),
        fc.double({ min: 1, max: 1000, noNaN: true }),
        (x, w) => {
          const f = seekFraction(x, 0, w);
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe("computeSeekTime", () => {
  it("seeks to the tapped fraction of a full track", () => {
    expect(computeSeekTime(200, 100, 200, 100)).toBe(50);
    expect(computeSeekTime(100, 100, 200, 100)).toBe(0);
    expect(computeSeekTime(300, 100, 200, 100)).toBe(100);
  });

  it("clamps a 15-second preview to its own ceiling, not the track's", () => {
    // Tapping the far right of the bar for a preview must land on 15s. Using
    // the full duration here let listeners seek past the end of what they can
    // actually hear.
    expect(computeSeekTime(300, 100, 200, 300, true)).toBe(15);
    expect(computeSeekTime(200, 100, 200, 300, true)).toBe(7.5);
  });

  it("returns 0 for a zero or invalid duration", () => {
    expect(computeSeekTime(200, 100, 200, 0)).toBe(0);
    expect(computeSeekTime(200, 100, 200, Number.NaN)).toBe(0);
    expect(computeSeekTime(200, 100, 200, -5)).toBe(0);
  });

  it("never seeks beyond the duration, whatever the pointer does", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.boolean(),
        (x, d, preview) => {
          const t = computeSeekTime(x, 0, 300, d, preview);
          expect(Number.isFinite(t)).toBe(true);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(preview ? 15 : d);
        },
      ),
    );
  });
});
