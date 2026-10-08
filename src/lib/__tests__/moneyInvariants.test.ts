/**
 * Money invariants for album fulfilment.
 *
 * This file used to cover buildBundle and playlistTotal, both of which priced a
 * playlist as a single purchasable bundle. Playlists are not a product — paid
 * tracks in one are bought individually or through their album — so those
 * helpers and the checkout that used them were removed.
 *
 * What replaces them is the album equivalent, and the same failure it was
 * written to prevent is still live: a bundle that resolves to nothing must
 * refuse rather than let the transaction settle as "completed" with the money
 * taken and no entitlement granted.
 */
import { describe, expect, it } from "vitest";

import { allocateBundleTotal, bundleIsFulfillable } from "@/lib/money-invariants";

describe("an album grant must never be empty", () => {
  it("refuses an empty grant list", () => {
    // The original bug, in album form: the loop never ran and the transaction
    // was marked completed — money taken, no purchases.
    expect(bundleIsFulfillable([])).toBe(false);
    expect(bundleIsFulfillable(allocateBundleTotal(0, [{ song_id: "a", weight: 10 }]))).toBe(false);
  });

  it("refuses when there are no tracks to grant at all", () => {
    expect(bundleIsFulfillable(allocateBundleTotal(200, []))).toBe(false);
  });

  it("accepts a real grant list", () => {
    const allocation = allocateBundleTotal(200, [
      { song_id: "a", weight: 100 },
      { song_id: "b", weight: 100 },
    ]);
    expect(bundleIsFulfillable(allocation)).toBe(true);
    expect(allocation).toHaveLength(2);
  });

  it("accepts a grant list that contains a zero-value track", () => {
    // A free track inside a paid album is still granted an entitlement row; it
    // simply receives no share of the price. The bundle is not empty.
    const allocation = allocateBundleTotal(100, [
      { song_id: "paid", weight: 100 },
      { song_id: "free", weight: 0 },
    ]);
    expect(bundleIsFulfillable(allocation)).toBe(true);
  });
});
