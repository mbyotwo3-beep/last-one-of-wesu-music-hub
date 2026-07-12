import { supabase } from "@/integrations/supabase/client";

/**
 * Storage buckets in this project are private, but album-art / artist-images
 * / user-avatars all have anon SELECT policies on storage.objects. That means
 * anyone can mint a signed URL for a stored path via the browser client.
 *
 * These helpers turn a raw storage path (as stored in the DB) into a URL the
 * browser can render, and cache the result so we don't re-sign on every
 * render. Values that already look like an absolute URL are returned as-is.
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
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) throw error ?? new Error("sign failed");
    cache.set(key, data.signedUrl);
    inflight.delete(key);
    return data.signedUrl;
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

