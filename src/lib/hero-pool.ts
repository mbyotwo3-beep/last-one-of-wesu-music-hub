/**
 * The hero pool: what the homepage shows when no admin has chosen a slide.
 *
 * WHY THIS EXISTS
 *
 * The homepage hero was never hardcoded, which is why it looked hardcoded. It
 * read hero_carousel_slides, found the table empty, and fell back to
 * `featured[0] ?? recentAlbums[0]` — a fixed pick. Every visitor saw the same
 * album forever, which is what a screenshot of "it only ever shows this one"
 * looks like.
 *
 * The admin path was always correct and always has been. This module only covers
 * the gap while that table is empty: the hero rotates through real songs and
 * albums, and the moment an admin adds a slide at /admin -> Hero Carousel, their
 * slides take over and this stops being used.
 *
 * DETERMINISM IS THE WHOLE GAME HERE
 *
 * This runs during SSR and again during hydration. If the server picks slide 3
 * and the client picks slide 7, React tears the markup down and rebuilds it,
 * which shows up as a visible flash on every page load and a hydration warning
 * in the console.
 *
 * So buildHeroPool is a pure function of its input: same albums and songs in,
 * same order out. Randomness is introduced only AFTER mount, by shuffling an
 * already-built pool (see useHeroPool), never by picking during render.
 *
 * Nothing here fetches, so it is unit-testable without a browser or a database.
 */

export interface PoolAlbum {
  id: string;
  title?: string | null;
  cover_url?: string | null;
  price?: number | null;
  artist?: { name?: string | null } | null;
}

export interface PoolSong {
  id: string;
  title?: string | null;
  cover_url?: string | null;
  price?: number | null;
  artist?: { name?: string | null } | null;
}

/** Matches HeroCarousel's HeroSlide, plus kind so tests and CTAs can tell them apart. */
export interface PoolSlide {
  id: string;
  kind: "album" | "song";
  title: string;
  description: string;
  imageUrl: string;
  /** Storage bucket the imageUrl path lives in. Defaults to "album-art" for catalogue items. */
  imageBucket: "album-art" | "hero-images";
  ctaText: string;
  ctaLink: string;
  gradient?: string;
}

/** Kwacha, matching the rest of the UI: K10.00 */
function kwacha(n: number | null | undefined): string {
  return `K${Number(n ?? 0).toFixed(2)}`;
}

/** PostgREST returns a to-one relation as an object, but be defensive. */
function artistName(artist: { name?: string | null } | null | undefined): string | null {
  if (!artist) return null;
  if (Array.isArray(artist)) return (artist[0] as { name?: string | null })?.name ?? null;
  return artist.name ?? null;
}

/**
 * Build the pool, albums and songs interleaved.
 *
 * Interleaving rather than "albums then songs" matters: with 18 songs and 1
 * album, albums-first would put every song out of view until the carousel had
 * run for a minute. Alternating means both kinds are always one swipe away.
 *
 * Within each kind the caller's order is preserved, so the caller decides what
 * "first" means — trending before newest, featured before recent.
 */
export function buildHeroPool(albums: PoolAlbum[], songs: PoolSong[]): PoolSlide[] {
  const seen = new Set<string>();
  const albumSlides: PoolSlide[] = [];
  const songSlides: PoolSlide[] = [];

  for (const a of albums ?? []) {
    if (!a?.id) continue;
    const key = `album:${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    albumSlides.push({
      id: a.id,
      kind: "album",
      title: a.title?.trim() || "Untitled album",
      description: artistName(a.artist) ?? "Wesu+",
      imageUrl: a.cover_url ?? "",
      imageBucket: "album-art",
      ctaText: "Open Album",
      ctaLink: `/albums/${a.id}`,
    });
  }

  for (const s of songs ?? []) {
    if (!s?.id) continue;
    const key = `song:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const price = Number(s.price ?? 0);
    songSlides.push({
      id: s.id,
      kind: "song",
      title: s.title?.trim() || "Untitled song",
      description: artistName(s.artist) ?? "Wesu+",
      imageUrl: s.cover_url ?? "",
      imageBucket: "album-art",
      // A free song must not invite a purchase that costs nothing, and a paid
      // one must say so before the tap, not after.
      ctaText: price > 0 ? `Buy ${kwacha(price)}` : "Play Preview",
      ctaLink: `/songs/${s.id}`,
    });
  }

  const out: PoolSlide[] = [];
  const longer = Math.max(albumSlides.length, songSlides.length);
  for (let i = 0; i < longer; i++) {
    if (i < albumSlides.length) out.push(albumSlides[i]);
    if (i < songSlides.length) out.push(songSlides[i]);
  }
  return out;
}

/**
 * A stable shuffle: the same seed always gives the same order.
 *
 * Takes the randomness as an argument rather than calling Math.random() itself,
 * so a test can pin it and so the caller can prove it only runs after mount.
 *
 * Fisher-Yates, from the END backwards. Iterating forwards while swapping with a
 * random index produces a visibly non-uniform result, which shows up as some
 * items clustering at the front of the hero.
 */
export function shuffleHeroPool<T>(pool: T[], seed: number): T[] {
  const out = pool.slice();
  if (out.length < 2) return out;
  // LCG so a single integer seed is enough.
  let s = seed | 0 || 1;
  const next = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
