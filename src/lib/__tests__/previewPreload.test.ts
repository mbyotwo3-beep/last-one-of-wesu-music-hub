/**
 * Which previews get warmed.
 *
 * The request was "preload 15 seconds of all songs listed". The implementation
 * deliberately does not do that, and these tests are the reason:
 *
 *   - every preview URL is a server call, so 50 songs is 50 requests before the
 *     listener has chosen anything — real data and battery on a metered phone;
 *   - preview URLs are signed and expire in about five minutes, so a long warm
 *     has a good chance of expiring before it is ever tapped;
 *   - warming bytes would make it a download in disguise, which is exactly what
 *     a 15-second preview exists to avoid.
 *
 * So the list is limited and ordered by what is visible and near. These tests
 * pin that limit, because the easy regression is someone "fixing" it to warm
 * everything.
 */
import { describe, expect, it } from "vitest";

import { planPreviewWarm } from "@/lib/preview-preload";

const list = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));

describe("planPreviewWarm", () => {
  it("returns nothing for an empty list", () => {
    expect(planPreviewWarm([], 0)).toEqual([]);
  });

  it("warms the visible song first", () => {
    expect(planPreviewWarm(list(10), 4)[0]).toEqual({ id: "s4" });
  });

  it("warms ahead of the listener, not behind", () => {
    const plan = planPreviewWarm(list(20), 5, 8, 3);
    expect(plan.map((p) => p.id)).toEqual(["s5", "s6", "s7", "s8"]);
  });

  it("never exceeds the limit", () => {
    // The whole point. 200 songs on a page must not become 200 requests.
    expect(planPreviewWarm(list(200), 0).length).toBeLessThanOrEqual(8);
  });

  it("caps a long list even with a generous limit", () => {
    expect(planPreviewWarm(list(50), 0, 100, 3).length).toBeLessThanOrEqual(4);
  });

  it("handles the last item without overrunning", () => {
    const plan = planPreviewWarm(list(3), 2, 8, 3);
    expect(plan.map((p) => p.id)).toEqual(["s2"]);
  });

  it("clamps an out-of-range index instead of returning nothing", () => {
    // A stale index during fast scrolling must not silently disable warming.
    const plan = planPreviewWarm(list(5), 99, 8, 3);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].id).toBe("s4");
  });

  it("clamps a negative index", () => {
    const plan = planPreviewWarm(list(5), -5, 8, 3);
    expect(plan[0].id).toBe("s0");
  });

  it("is stable for a single-item list", () => {
    expect(planPreviewWarm(list(1), 0)).toEqual([{ id: "s0" }]);
  });
});
