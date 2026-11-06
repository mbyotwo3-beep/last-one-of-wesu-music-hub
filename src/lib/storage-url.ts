import { signImageUrls } from "@/lib/media.functions";

/**
 * Media lives in a private Cloudflare R2 bucket. These helpers turn a raw
 * stored path (as kept in the DB) into a short-lived signed URL the browser
 * can render, and cache the result so we don't re-sign on every render.
 * Values that already look like an absolute URL are returned as-is.
 */

export type ImageBucket =
  "album-art" | "artist-images" | "user-avatars" | "hero-images" | "label-images";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// --- localStorage mirror (kept on the phone so the next load is fast) ------
// Without it every cold start re-mints every cover/hero URL (one batched
// RPC) and, worse, re-downloads every image, because a freshly minted
// signed URL busts any HTTP cache. Keeping the resolved URLs on the phone
// with a TTL safely below the server-side 60-minute signature means the
// next launch resolves covers synchronously — and the service worker's
// image cache serves the bytes without touching the network at all.
const IMAGE_URL_STORE_KEY = "wesu:image-url-cache";
const IMAGE_URL_TTL_MS = 50 * 60 * 1000;
const IMAGE_URL_PERSIST_MAX = 250;

const cachedAt = new Map<string, number>();

function persistImageUrlCache(): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const entries = [...cachedAt.entries()]
      .filter(([, at]) => now - at < IMAGE_URL_TTL_MS)
      .slice(-IMAGE_URL_PERSIST_MAX)
      .map(([k, at]) => ({ k, url: cache.get(k) ?? "", at }));
    window.localStorage.setItem(
      IMAGE_URL_STORE_KEY,
      JSON.stringify({ v: 1, entries: entries.filter((e) => e.url) }),
    );
  } catch {
    /* quota / private mode — the in-memory cache still works */
  }
}

/** Re-read the localStorage mirror into memory (init + tests). */
export function hydrateImageUrlCache(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(IMAGE_URL_STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { entries?: { k: string; url: string; at: number }[] };
    if (!Array.isArray(parsed?.entries)) return;
    const now = Date.now();
    for (const e of parsed.entries) {
      if (!e || typeof e.k !== "string" || typeof e.url !== "string" || e.url.length === 0) continue;
      if (typeof e.at !== "number" || now - e.at >= IMAGE_URL_TTL_MS) continue;
      cache.set(e.k, e.url);
      cachedAt.set(e.k, e.at);
    }
  } catch {
    /* corrupt mirror — ignore; the next flush rewrites it */
  }
}

if (typeof window !== "undefined") hydrateImageUrlCache();

// ---------------------------------------------------------------------------
// Request batcher: cover grids mount dozens of StorageImage instances in one
// render pass. Without batching each one fired its own signImageUrl RPC
// (~50 RPCs for a 50-cover page). Requests landing inside the same 16ms
// window are flushed as ONE signImageUrls call. Per-tab memory cache keeps
// repeat renders at zero RPCs. External behavior (cache key, error
// passthrough, inflight slot release) is unchanged for callers.
// ---------------------------------------------------------------------------

interface PendingItem {
  bucket: ImageBucket;
  path: string;
  key: string;
  resolve: (url: string) => void;
  reject: (err: unknown) => void;
}

let batchQueue: PendingItem[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

const BATCH_WINDOW_MS = 16;
const BATCH_MAX_ITEMS = 100;

type BatchSigner = (items: { bucket: ImageBucket; path: string }[]) => Promise<{
  urls: Record<string, string | null>;
}>;

let batchSigner: BatchSigner = async (items) => signImageUrls({ data: { items } });

/** Test-only override so unit tests can assert batching without network. */
export function __setBatchSigner(signer: BatchSigner | null) {
  batchSigner = signer ?? (async (items) => signImageUrls({ data: { items } }));
}

function scheduleBatchFlush() {
  if (batchTimer !== null) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    void flushBatch();
  }, BATCH_WINDOW_MS);
}

async function flushBatch(): Promise<void> {
  if (batchQueue.length === 0) return;
  const batch = batchQueue;
  batchQueue = [];
  // Group waiters per key so duplicate requests in one window all resolve.
  const waiters = new Map<string, PendingItem[]>();
  for (const item of batch) {
    const list = waiters.get(item.key);
    if (list) list.push(item);
    else waiters.set(item.key, [item]);
  }
  const keys = [...waiters.keys()];
  const current = keys.slice(0, BATCH_MAX_ITEMS);
  // Over-cap overflow goes back to the queue for the next flush.
  for (const key of keys.slice(BATCH_MAX_ITEMS)) {
    batchQueue.push(...waiters.get(key)!);
  }
  if (batchQueue.length > 0) scheduleBatchFlush();
  if (current.length === 0) return;
  try {
    // 60-min signed URLs — plenty for a page view; cached in-memory for the tab.
    const { urls } = await batchSigner(
      current.map((key) => {
        const first = waiters.get(key)![0];
        return { bucket: first.bucket, path: first.path };
      }),
    );
    for (const key of current) {
      const url = urls[key];
      if (typeof url === "string" && url.length > 0) {
        cache.set(key, url);
        cachedAt.set(key, Date.now());
        for (const item of waiters.get(key)!) item.resolve(url);
      } else {
        const err = new Error(`Failed to sign image: ${key}`);
        for (const item of waiters.get(key)!) item.reject(err);
      }
    }
    persistImageUrlCache();
  } catch (err) {
    for (const key of current) {
      for (const item of waiters.get(key)!) item.reject(err);
    }
  } finally {
    // Always release inflight slots — otherwise a single rejection caches a
    // rejected promise forever and the image never loads.
    for (const key of current) inflight.delete(key);
  }
}

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
  const p = new Promise<string>((resolve, reject) => {
    batchQueue.push({ bucket, path, key, resolve, reject });
  });
  inflight.set(key, p);
  scheduleBatchFlush();
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
  cachedAt.delete(key);
  persistImageUrlCache();
  inflight.delete(key);
  // Also drop any request still sitting in the batch window so a stale
  // entry can't re-populate the cache after invalidate. Rejected (not left
  // hanging) so awaiting callers can retry and re-sign from scratch.
  const dropped = batchQueue.filter((item) => item.key === key);
  batchQueue = batchQueue.filter((item) => item.key !== key);
  for (const item of dropped) {
    item.reject(new Error(`Image URL invalidated: ${key}`));
  }
}
