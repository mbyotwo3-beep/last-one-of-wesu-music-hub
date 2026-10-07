/**
 * Album pricing/listing rules.
 *
 * The bug: an album's own `price` is optional, so a release uploaded without
 * one showed a K0 "free" tile on the shelf — a price the checkout could not
 * honour. The shelf now sums the tracks unless the artist set an album price
 * deliberately (a bundle discount).
 *
 * Mirrors summariseAlbum in src/lib/music.functions.ts.
 */

import { describe, expect, it } from "vitest";

function summariseAlbum(a: {
  price?: number | string | null;
  songs?: { price?: number | string | null; duration?: number | null }[] | null;
}) {
  const tracks = a.songs ?? [];
  const explicit = Number(a.price ?? 0) > 0;
  return {
    track_count: tracks.length,
    total_duration: tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0),
    effective_price: explicit
      ? Number(a.price)
      : tracks.reduce((s, t) => s + Number(t.price ?? 0), 0),
  };
}

describe("summariseAlbum", () => {
  it("sums track prices when the album has no price of its own", () => {
    const out = summariseAlbum({
      price: null,
      songs: [
        { price: 150, duration: 200 },
        { price: 150, duration: 180 },
      ],
    });
    expect(out.effective_price).toBe(300);
    expect(out.track_count).toBe(2);
    expect(out.total_duration).toBe(380);
  });

  it("treats a zero album price as 'not set', not 'free'", () => {
    // The bug this replaces: a K0 album tile that led nowhere.
    const out = summariseAlbum({ price: 0, songs: [{ price: 10, duration: 100 }] });
    expect(out.effective_price).toBe(10);
  });

  it("honours an explicit album price — a bundle discount is legitimate", () => {
    const out = summariseAlbum({
      price: 1200,
      songs: [
        { price: 150, duration: 100 },
        { price: 150, duration: 100 },
      ],
    });
    expect(out.effective_price).toBe(1200);
  });

  it("accepts numeric strings (Postgres numeric arrives as a string)", () => {
    const out = summariseAlbum({ price: "150.50", songs: [] });
    expect(out.effective_price).toBe(150.5);
    expect(typeof out.effective_price).toBe("number");
  });

  it("sums string track prices", () => {
    const out = summariseAlbum({ songs: [{ price: "10.50" }, { price: "4.50" }] });
    expect(out.effective_price).toBe(15);
  });

  it("counts free tracks as zero rather than NaN", () => {
    const out = summariseAlbum({ songs: [{ price: 0 }, { price: 10 }] });
    expect(out.effective_price).toBe(10);
  });

  it("survives a null price on a track", () => {
    const out = summariseAlbum({ songs: [{ price: null }, { price: 10 }] });
    expect(out.effective_price).toBe(10);
  });

  it("handles an album with no songs without producing NaN", () => {
    const out = summariseAlbum({ price: null, songs: null });
    expect(out).toEqual({ track_count: 0, total_duration: 0, effective_price: 0 });
  });

  it("tolerates a missing duration", () => {
    const out = summariseAlbum({ songs: [{ price: 10, duration: null }, { price: 10 }] });
    expect(out.total_duration).toBe(0);
    expect(out.effective_price).toBe(20);
  });
});
