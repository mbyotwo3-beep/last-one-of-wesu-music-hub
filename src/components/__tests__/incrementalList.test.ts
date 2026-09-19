import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  extendVisibleCount,
  clampVisibleCount,
  hasMoreItems,
} from "../IncrementalList";

describe("incremental list windowing", () => {
  it("extends by exactly one page and stops at the total", () => {
    expect(extendVisibleCount(30, 100, 30)).toBe(60);
    expect(extendVisibleCount(90, 100, 30)).toBe(100);
    expect(extendVisibleCount(100, 100, 30)).toBe(100);
    expect(extendVisibleCount(0, 0, 30)).toBe(0);
  });

  it("clamps without resetting the user's scroll depth", () => {
    // List grew: keep depth.
    expect(clampVisibleCount(60, 120, 30)).toBe(60);
    // List shrank below window: clamp to total, not back to page one.
    expect(clampVisibleCount(60, 45, 30)).toBe(45);
    // Tiny list: show all of it.
    expect(clampVisibleCount(30, 5, 30)).toBe(5);
    // Empty list: empty window.
    expect(clampVisibleCount(30, 0, 30)).toBe(0);
  });

  it("reports more-items correctly at the boundary", () => {
    expect(hasMoreItems(30, 100)).toBe(true);
    expect(hasMoreItems(100, 100)).toBe(false);
    expect(hasMoreItems(0, 0)).toBe(false);
  });

  it("never exceeds the total or drops below one page for any inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (visible, total, pageSize) => {
          const extended = extendVisibleCount(visible, total, pageSize);
          expect(extended).toBeLessThanOrEqual(total);
          expect(extended).toBeGreaterThanOrEqual(0);
          const clamped = clampVisibleCount(visible, total, pageSize);
          expect(clamped).toBeLessThanOrEqual(total);
          expect(clamped).toBeGreaterThanOrEqual(0);
          if (total > 0) expect(clamped).toBeGreaterThanOrEqual(1);
          expect(hasMoreItems(extended, total)).toBe(extended < total);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("converges to the full list within ceil(total/page) extensions", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (total, pageSize) => {
          let visible = clampVisibleCount(pageSize, total, pageSize);
          let steps = 0;
          while (hasMoreItems(visible, total) && steps <= total + 1) {
            visible = extendVisibleCount(visible, total, pageSize);
            steps++;
          }
          expect(visible).toBe(total);
          expect(steps).toBeLessThanOrEqual(Math.ceil(total / pageSize));
        },
      ),
      { numRuns: 200 },
    );
  });
});
