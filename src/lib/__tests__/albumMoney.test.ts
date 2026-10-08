/**
 * Album money: how a release price is derived, and how that one total is split
 * across its tracks.
 *
 * These import the real modules. The previous albumPricing.test.ts re-implemented
 * `summariseAlbum` inline, so it asserted that a copy of the function agreed with
 * itself — it could not fail when the shipped function broke, which is exactly
 * how the shelf and the checkout drifted apart in the first place.
 */
import { describe, expect, it } from "vitest";

import { allocateBundleTotal, bundleIsFulfillable, buildBundle } from "@/lib/money-invariants";
import { albumSellablePrice, summariseAlbum } from "@/lib/music.functions";

describe("albumSellablePrice", () => {
  it("sums track prices when the album has no price of its own", () => {
    expect(albumSellablePrice({ price: null, songs: [{ price: 150 }, { price: 150 }] })).toBe(300);
  });

  it("treats a zero album price as 'not set', not 'free'", () => {
    // The bug this replaces: a K0 tile on the shelf, no Buy button at all.
    expect(albumSellablePrice({ price: 0, songs: [{ price: 10 }] })).toBe(10);
  });

  it("honours an explicit album price — a bundle discount is legitimate", () => {
    expect(
      albumSellablePrice({ price: 1200, songs: [{ price: 150 }, { price: 150 }] }),
    ).toBe(1200);
  });

  it("accepts numeric strings, because Postgres numeric arrives as a string", () => {
    const out = albumSellablePrice({ price: "150.50", songs: [] });
    expect(out).toBe(150.5);
    expect(typeof out).toBe("number");
  });

  it("reports a genuinely free album as 0", () => {
    // All tracks free and no album price: this one really is free, and the
    // sellable price must be 0 so no Buy button appears.
    expect(albumSellablePrice({ price: null, songs: [{ price: 0 }, { price: 0 }] })).toBe(0);
  });

  it("never returns NaN for a null album with no tracks", () => {
    const out = albumSellablePrice({ price: null, songs: null });
    expect(out).toBe(0);
    expect(Number.isFinite(out)).toBe(true);
  });
});

describe("summariseAlbum agrees with albumSellablePrice", () => {
  it("uses the same price rule, so the tile and the till cannot disagree", () => {
    const album = { price: null, songs: [{ price: 150, duration: 200 }, { price: 90, duration: 100 }] };
    expect(summariseAlbum(album).effective_price).toBe(albumSellablePrice(album));
    expect(summariseAlbum(album).track_count).toBe(2);
    expect(summariseAlbum(album).total_duration).toBe(300);
  });
});

describe("allocateBundleTotal", () => {
  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);

  it("splits a discounted album exactly, never paying out more than was taken", () => {
    // A 12-track release sold at K200 where the tracks list at K150 each.
    // Paying each track its own price would hand out K1800.
    const items = Array.from({ length: 12 }, (_, i) => ({ song_id: `s${i}`, weight: 150 }));
    const rows = allocateBundleTotal(200, items);
    expect(rows).toHaveLength(12);
    expect(sum(rows)).toBe(200);
  });

  it("lands on whole cents with no floating point drift", () => {
    // 0.1 + 0.2 !== 0.3 is the classic. Three equal shares of 10 must be exact.
    const rows = allocateBundleTotal(10, [
      { song_id: "a", weight: 1 },
      { song_id: "b", weight: 1 },
      { song_id: "c", weight: 1 },
    ]);
    expect(sum(rows)).toBe(10);
    expect(rows.map((r) => r.amount)).toEqual([3.34, 3.33, 3.33]);
  });

  it("is exact for an amount that cannot divide evenly at all", () => {
    for (const total of [0.01, 0.07, 1, 7.77, 33.33, 250, 199.99]) {
      const rows = allocateBundleTotal(total, [
        { song_id: "a", weight: 3 },
        { song_id: "b", weight: 3 },
        { song_id: "c", weight: 2 },
      ]);
      expect(sum(rows)).toBe(total);
    }
  });

  it("splits in proportion to the weights", () => {
    const rows = allocateBundleTotal(100, [
      { song_id: "cheap", weight: 10 },
      { song_id: "dear", weight: 30 },
    ]);
    expect(rows.find((r) => r.song_id === "cheap")!.amount).toBe(25);
    expect(rows.find((r) => r.song_id === "dear")!.amount).toBe(75);
  });

  it("gives a free track nothing — it is already playable for free", () => {
    const rows = allocateBundleTotal(100, [
      { song_id: "paid", weight: 100 },
      { song_id: "free", weight: 0 },
    ]);
    expect(rows.find((r) => r.song_id === "paid")!.amount).toBe(100);
    expect(rows.find((r) => r.song_id === "free")!.amount).toBe(0);
  });

  it("splits evenly when every track is free but the album carries a price", () => {
    // No weight to split by. Paying one track everything would be arbitrary.
    const rows = allocateBundleTotal(90, [
      { song_id: "a", weight: 0 },
      { song_id: "b", weight: 0 },
      { song_id: "c", weight: 0 },
    ]);
    expect(sum(rows)).toBe(90);
    expect(rows.every((r) => r.amount === 30)).toBe(true);
  });

  it("is deterministic, so a retry pays the same artist the same amount", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ song_id: `s${i}`, weight: 33 }));
    const first = allocateBundleTotal(100, items);
    const second = allocateBundleTotal(100, items);
    expect(second).toEqual(first);
  });

  it("allocates nothing when there is nothing to allocate", () => {
    expect(allocateBundleTotal(0, [{ song_id: "a", weight: 5 }])).toEqual([]);
    expect(allocateBundleTotal(-5, [{ song_id: "a", weight: 5 }])).toEqual([]);
    expect(allocateBundleTotal(100, [])).toEqual([]);
  });

  it("ignores entries with no song id — they cannot be granted", () => {
    const rows = allocateBundleTotal(50, [
      { song_id: "", weight: 5 },
      { song_id: "real", weight: 5 },
    ] as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].song_id).toBe("real");
    expect(rows[0].amount).toBe(50);
  });

  it("survives a garbage weight without producing NaN", () => {
    const rows = allocateBundleTotal(60, [
      { song_id: "a", weight: Number.NaN },
      { song_id: "b", weight: 10 },
      { song_id: "c", weight: "abc" as any },
    ]);
    expect(rows.every((r) => Number.isFinite(r.amount))).toBe(true);
    expect(sum(rows)).toBe(60);
  });
});

describe("a bundle that would grant nothing must be refused", () => {
  it("rejects an empty bundle rather than settling a payment for nothing", () => {
    expect(bundleIsFulfillable([])).toBe(false);
    expect(bundleIsFulfillable(buildBundle([]))).toBe(false);
  });

  it("accepts a real bundle", () => {
    expect(bundleIsFulfillable(buildBundle([{ song_id: "a", amount: 10 }]))).toBe(true);
  });
});