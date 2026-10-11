/**
 * Tests for the rotating hero pool.
 *
 * The property that matters most is the first one: buildHeroPool MUST be a pure
 * function of its input. It runs during SSR and again during hydration, and if
 * the two disagree React discards the server's markup and rebuilds it — a visible
 * jump on every single page load. Everything else here is detail; that is the
 * thing that would ship as a bug nobody could reproduce on demand.
 */
import { describe, it, expect } from "vitest";
import { buildHeroPool, shuffleHeroPool, type PoolAlbum, type PoolSong } from "../hero-pool";

const album = (id: string, over: Partial<PoolAlbum> = {}): PoolAlbum => ({
  id,
  title: `Album ${id}`,
  cover_url: `cover-${id}.jpg`,
  price: 150,
  artist: { name: `Artist ${id}` },
  ...over,
});

const song = (id: string, over: Partial<PoolSong> = {}): PoolSong => ({
  id,
  title: `Song ${id}`,
  cover_url: `cover-${id}.jpg`,
  price: 10,
  artist: { name: `Artist ${id}` },
  ...over,
});

describe("buildHeroPool determinism (hydration safety)", () => {
  const albums = [album("a1"), album("a2"), album("a3")];
  const songs = [song("s1"), song("s2"), song("s3")];

  it("returns byte-identical output for identical input", () => {
    const first = buildHeroPool(albums, songs);
    const second = buildHeroPool(albums, songs);
    expect(first).toEqual(second);
  });

  it("does not depend on anything but its arguments", () => {
    // Mutating the caller's arrays afterwards must not change an earlier result,
    // or the pool would differ between render and effect.
    const copy = [album("a1"), album("a2")];
    const before = buildHeroPool(copy, [song("s1")]);
    copy.push(album("a3"));
    expect(buildHeroPool(copy, [song("s1")]).length).toBeGreaterThan(before.length);
    expect(before.length).toBe(2 + 1);
  });

  it("does not mutate the arrays it is given", () => {
    const albums = [album("a2"), album("a1")];
    const songs = [song("s2"), song("s1")];
    const albumIds = albums.map((a) => a.id);
    const songIds = songs.map((s) => s.id);
    buildHeroPool(albums, songs);
    expect(albums.map((a) => a.id)).toEqual(albumIds);
    expect(songs.map((s) => s.id)).toEqual(songIds);
  });
});

describe("buildHeroPool content", () => {
  it("includes songs as well as albums", () => {
    const pool = buildHeroPool([album("a1")], [song("s1")]);
    expect(pool.map((s) => s.kind)).toEqual(["album", "song"]);
  });

  it("interleaves so songs are never stranded behind every album", () => {
    // The exact case that started this: 18 songs, 1 album. Albums-first would
    // put song 18 at position 19, most of a minute of rotation away.
    const songs = Array.from({ length: 18 }, (_, i) => song(`s${i}`));
    const pool = buildHeroPool([album("a1")], songs);
    expect(pool[0].kind).toBe("album");
    expect(pool[1].kind).toBe("song");
    expect(pool[2].kind).toBe("song");
    expect(pool.length).toBe(19);
  });

  it("still works when there are only songs", () => {
    const pool = buildHeroPool([], [song("s1"), song("s2")]);
    expect(pool).toHaveLength(2);
    expect(pool.every((s) => s.kind === "song")).toBe(true);
  });

  it("still works when there are only albums", () => {
    const pool = buildHeroPool([album("a1")], []);
    expect(pool).toHaveLength(1);
  });

  it("deduplicates albums that appear in more than one shelf", () => {
    // featured and recentAlbums overlap in practice; the same album must not
    // occupy two slides of the hero.
    const pool = buildHeroPool([album("a1"), album("a1", { title: "Same" })], []);
    expect(pool).toHaveLength(1);
  });

  it("keeps a song and an album that share an id", () => {
    const pool = buildHeroPool([album("same")], [song("same")]);
    expect(pool).toHaveLength(2);
  });

  it("drops entries with no id instead of rendering a broken slide", () => {
    const pool = buildHeroPool([album("")], [song("s1")]);
    expect(pool.map((s) => s.id)).toEqual(["s1"]);
  });

  it("returns an empty pool for empty input, never throws", () => {
    expect(buildHeroPool([], [])).toEqual([]);
    expect(buildHeroPool(undefined as any, undefined as any)).toEqual([]);
  });
});

describe("slide copy", () => {
  it("sends an album to its own page with an album CTA", () => {
    const [slide] = buildHeroPool([album("a1")], []);
    expect(slide.ctaLink).toBe("/albums/a1");
    expect(slide.ctaText).toBe("Open Album");
    expect(slide.title).toBe("Album a1");
    expect(slide.description).toBe("Artist a1");
  });

  it("sends a song to its own page and names the price", () => {
    const [slide] = buildHeroPool([], [song("s1", { price: 10 })]);
    expect(slide.ctaLink).toBe("/songs/s1");
    expect(slide.ctaText).toBe("Buy K10.00");
  });

  it("does not ask someone to buy a free song", () => {
    const [slide] = buildHeroPool([], [song("s1", { price: 0 })]);
    expect(slide.ctaText).toBe("Play Preview");
  });

  it("treats a null price as free rather than as K0.00 to buy", () => {
    const [slide] = buildHeroPool([], [song("s1", { price: null })]);
    expect(slide.ctaText).toBe("Play Preview");
  });

  it("falls back sensibly when metadata is missing", () => {
    const pool = buildHeroPool(
      [{ id: "a1", title: null, cover_url: null, artist: null }],
      [{ id: "s1", title: "  ", cover_url: undefined, artist: { name: null } }],
    );
    expect(pool[0].title).toBe("Untitled album");
    expect(pool[0].description).toBe("Wesu+");
    expect(pool[0].imageUrl).toBe("");
    expect(pool[1].title).toBe("Untitled song");
  });

  it("survives PostgREST returning the artist as an array", () => {
    const pool = buildHeroPool([{ id: "a1", title: "T", artist: [{ name: "Zed" }] as any }], []);
    expect(pool[0].description).toBe("Zed");
  });
});

describe("shuffleHeroPool", () => {
  const pool = Array.from({ length: 8 }, (_, i) => ({ n: i }));

  it("is deterministic for a given seed", () => {
    expect(shuffleHeroPool(pool, 42)).toEqual(shuffleHeroPool(pool, 42));
  });

  it("changes the order for a different seed", () => {
    expect(shuffleHeroPool(pool, 42)).not.toEqual(shuffleHeroPool(pool, 99));
  });

  it("keeps every slide exactly once", () => {
    const out = shuffleHeroPool(pool, 7);
    expect(out).toHaveLength(pool.length);
    expect([...out].map((x) => x.n).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("does not mutate the input", () => {
    const original = pool.map((x) => x.n);
    shuffleHeroPool(pool, 3);
    expect(pool.map((x) => x.n)).toEqual(original);
  });

  it("handles pools too small to shuffle", () => {
    expect(shuffleHeroPool([], 1)).toEqual([]);
    expect(shuffleHeroPool([{ n: 1 }], 1)).toEqual([{ n: 1 }]);
  });

  it("survives a zero seed, which an LCG would otherwise collapse", () => {
    expect(shuffleHeroPool(pool, 0)).toHaveLength(8);
  });

  it("actually moves things, rather than only swapping neighbours", () => {
    const out = shuffleHeroPool(pool, 11).map((x) => x.n);
    const samePositions = out.filter((n, i) => n === i).length;
    expect(samePositions).toBeLessThan(7);
  });
});
