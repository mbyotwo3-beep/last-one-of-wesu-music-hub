import { signImageUrl } from "@/lib/media.functions";

/**
 * Media lives in a private Cloudflare R2 bucket. These helpers turn a raw
 * stored path (as kept in the DB) into a short-lived signed URL the browser
 * can render, and cache the result so we don't re-sign on every render.
 * Values that already look like an absolute URL are returned as-is.
 */

export type ImageBucket = "album-art" | "artist-images" | "user-avatars";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

const isAbsolute = (v: string) => /^(https?:|data:|blob:)/i.test(v);

export async function resolveImageUrl(
  bucket: ImageBucket,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  if (isAbsolute(path)) return path;
  const key = `${bucket}:${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    // 60-min signed URL — plenty for a page view; cached in-memory for the tab.
    const { url } = await signImageUrl({ data: { bucket, path } });
    if (!url) throw new Error("sign failed");
    cache.set(key, url);
    inflight.delete(key);
    return url;
  })();
  inflight.set(key, p);
  return p;
}

/** Synchronous best-effort: returns cached URL if we already have one. */
export function peekImageUrl(bucket: ImageBucket, path: string | null | undefined) {
  if (!path) return null;
  if (isAbsolute(path)) return path;
  return cache.get(`${bucket}:${path}`) ?? null;
}

/** Drop any cached signed URL so the next resolve re-signs from scratch. */
export function invalidateImageUrl(bucket: ImageBucket, path: string | null | undefined) {
  if (!path || isAbsolute(path)) return;
  const key = `${bucket}:${path}`;
  cache.delete(key);
  inflight.delete(key);
}

