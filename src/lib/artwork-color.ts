/**
 * Artwork colour — the Spotify treatment for covers and the surfaces behind
 * them: a two-stop gradient derived from the artwork itself, with a
 * deterministic fallback for every case where sampling is impossible.
 *
 * THE THREE CASES, IN ORDER
 *
 *   1. Sampled — the image loaded with a CORS-readable canvas, so the real
 *      dominant colour drives the gradient. Genuine Spotify behaviour.
 *   2. Hashed — sampling failed (signature blocked CORS, image removed, most
 *      of SSR). A hue is derived from the bucket path's hash, so the SAME
 *      cover always draws the SAME tint on server and client and on every
 *      revisit. Random per-render would be worse than uniform.
 *   3. None — callers get a neutral surface; nothing tinted is wrong.
 *
 * WHY SERVER- AND CLIENT-AGREEABLE MATTERS
 *
 * The fallback hue is a pure function, so the SSR HTML paints the same tint
 * that the client refines to. Sampling happens after hydration and may
 * CHANGE the tint — that is the accepted progressive step here, the same one
 * the rotating hero already takes with its post-mount shuffle.
 *
 * PERFORMANCE BOUND
 *
 * Sampling reads a 10x10 drawImage — a kilobyte of pixels per cover, once per
 * URL per session (module cache). ~40 covers on a busy shelf cost ~40 tiny
 * decodes that were already being fetched for display; nothing new is
 * downloaded because the Image reuses the same signed URL the visible <img>
 * holds.
 */

export interface DominantColor {
  r: number;
  g: number;
  b: number;
}

/** Stable string hash → hue. Two different covers almost never collide. */
export function hashHue(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

function hslCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/**
 * Fallback surface, and the one SSR renders: saturated enough to feel
 * designed, dead-set restrained so a red artwork book never burns the UI.
 */
export function gradientFromHue(h: number): string {
  return `linear-gradient(160deg, ${hslCss(h, 0.5, 0.4)} 0%, ${hslCss(h, 0.55, 0.16)} 100%)`;
}

/**
 * The sampled surface. The artwork's colour is nudged into Spotify's band —
 * the raw average of most covers sits muddy and dull, and using it straight
 * is the reason most attempts at this look worse than no gradient at all.
 */
export function gradientFromColor(c: DominantColor): string {
  const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  const sBoost = clamp(s + 0.25, 0.42, 0.78);
  const lMain = clamp(l, 0.3, 0.5);
  return `linear-gradient(160deg, ${hslCss(h, sBoost, lMain)} 0%, ${hslCss(h, sBoost, 0.14)} 100%)`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Tweaks a raw average into something a cover page can be built on. */
export function refineDominantColor(pixels: DominantColor[]): DominantColor | null {
  if (!pixels.length) return null;
  // Drop the two dead zones: near-black (usually the crop edge or padding)
  // and near-white (usually cover text background). Averaging them in is how
  // a vivid red cover ends up producing a beige gradient.
  const live = pixels.filter((p) => {
    const { s, l } = rgbToHsl(p.r, p.g, p.b);
    return s > 0.12 && l > 0.08 && l < 0.92;
  });
  const pool = live.length ? live : pixels;
  const sum = pool.reduce(
    (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
    { r: 0, g: 0, b: 0 },
  );
  return {
    r: Math.round(sum.r / pool.length),
    g: Math.round(sum.g / pool.length),
    b: Math.round(sum.b / pool.length),
  };
}

const SAMPLE = 10;

/**
 * Sample the artwork through a canvas. Returns null — never throws — for
 * every "cannot": cross-origin taint, decode failure, no canvas. The taint
 * case is the common one for a signed private bucket without permissive CORS,
 * which is why the hashed fallback is not an afterthought.
 */
export async function extractDominantColor(url: string): Promise<DominantColor | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    // decode() exists on the platform's Image and avoids onLoad races; on the
    // odd WebView without it, the promise simply never settles and the race
    // below resolves null in bounded time.
    const race = Promise.race([img.decode(), new Promise<never>((_, rej) => setTimeout(rej, 4000))]);
    await race;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    const pixels: DominantColor[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    return refineDominantColor(pixels);
  } catch {
    return null;
  }
}

/**
 * Session cache: one canvas sweep per unique artwork URL.
 *
 * Map preserves insertion order, so the cap is an LRU by insertion: when full,
 * the OLDEST entry is evicted first, which is the one least likely to be
 * needed again this session.
 */
const cache = new Map<string, string>();
const CACHE_CAP = 240;

export function checkoutCachedArtworkGradient(url: string | null | undefined): string | null {
  if (!url) return null;
  return cache.get(url) ?? null;
}

export function storeArtworkGradient(url: string, css: string): string {
  cache.set(url, css);
  if (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return css;
}