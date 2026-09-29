import { describe, expect, it } from "vitest";
import { buildBundle, bundleIsFulfillable, playlistTotal } from "@/lib/money-invariants";

describe("playlist payment fulfilment", () => {
  it("rejects an empty or malformed bundle instead of settling with nothing granted", () => {
    // The original bug: an absent snapshot produced [], the loop never ran,
    // and the transaction was marked completed — money taken, no purchases.
    expect(bundleIsFulfillable(buildBundle(undefined))).toBe(false);
    expect(bundleIsFulfillable(buildBundle(null))).toBe(false);
    expect(bundleIsFulfillable(buildBundle([]))).toBe(false);
    expect(bundleIsFulfillable(buildBundle([{ amount: 10 }]))).toBe(false);
    expect(bundleIsFulfillable(buildBundle([null, {}]))).toBe(false);
  });

  it("accepts a well-formed bundle and drops rows without a song id", () => {
    const bundle = buildBundle([
      { song_id: "a", amount: 10 },
      { song_id: "b", amount: "20.5" },
      { song_id: 42, amount: 99 },
      { amount: 5 },
    ]);
    expect(bundle.map((b) => b.song_id)).toEqual(["a", "b"]);
    expect(bundle[1].amount).toBe(20.5);
    expect(bundleIsFulfillable(bundle)).toBe(true);
  });
});

describe("playlist total rounding", () => {
  it("never leaks a float tail into the amount charged or shown", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in float arithmetic.
    expect(playlistTotal([{ price: 0.1 }, { price: 0.2 }])).toBe(0.3);
    expect(playlistTotal([{ price: 12.3 }, { price: 4.4 }, { price: 5.5 }])).toBe(22.2);
  });

  it("treats missing/null prices as zero and an empty list as zero", () => {
    expect(playlistTotal([{ price: null }, { price: undefined }])).toBe(0);
    expect(playlistTotal([])).toBe(0);
  });

  it("matches Kwacha pricing granularity", () => {
    // Realistic catalogue: 10 Kwacha singles, 150 Kwacha albums.
    expect(playlistTotal([{ price: 10 }, { price: 10 }, { price: 150 }])).toBe(170);
  });
});
