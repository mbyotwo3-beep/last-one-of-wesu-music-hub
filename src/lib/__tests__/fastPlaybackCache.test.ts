/**
 * Fast-play caches: resolved URLs must survive a reload.
 *
 * The APK is a WebView pointed at the live site — every cold app start was a
 * full page load that re-minted EVERY signed URL (one batched RPC for images,
 * one server fn per queued song on tap) and re-downloaded every cover. These
 * tests pin the two localStorage mirrors that fix that:
 *
 *   audio  — the last-queue songs play again with zero URL round trips while
 *            the server-side signature is still valid
 *   images — covers resolve synchronously on the next load (the SW serves
 *            the bytes from its own cache)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.resetModules();
});

describe("audio url cache", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("keeps full URLs for 55 min and previews for 280s (inside the server signatures)", async () => {
    const { audioUrlTtlMs } = await import("@/lib/audio");
    expect(audioUrlTtlMs(false)).toBe(3_300_000); // server mints 3600s
    expect(audioUrlTtlMs(true)).toBe(280_000); // server mints 300s
  });

  it("mirrors set/evict to localStorage so a cold start can re-hydrate", async () => {
    const audio = await import("@/lib/audio");
    audio.__resetAudioUrlCacheForTests();

    audio.setCachedAudioUrl("s1", "user-1", "https://signed/full1", false);
    audio.setCachedAudioUrl("s2", null, "https://signed/preview2", true);

    // visible in the mirror
    const mirror = JSON.parse(
      stubStoreGet("wesu:audio-url-cache") ?? "{}",
    ) as { entries: { k: string }[] };
    const keys = mirror.entries.map((e) => e.k);
    expect(keys).toContain("user-1:s1");
    expect(keys).toContain("anon:s2");

    // evict updates the mirror too
    audio.evictCachedAudioUrlForUser("s1", "user-1");
    const after = JSON.parse(
      stubStoreGet("wesu:audio-url-cache") ?? "{}",
    ) as { entries: { k: string }[] };
    expect(after.entries.map((e) => e.k)).not.toContain("user-1:s1");
  });

  it("re-hydrates persisted URLs on the next load — zero round trips", async () => {
    // First session caches a URL, then the "app restarts" (module re-import).
    const first = await import("@/lib/audio");
    first.__resetAudioUrlCacheForTests();
    first.setCachedAudioUrl("song-x", "user-1", "https://signed/x", false);

    // Fresh module instance = fresh in-memory map; localStorage survives.
    vi.resetModules();
    const second = await import("@/lib/audio");
    const cached = second.getCachedAudioUrl("song-x", "user-1");
    expect(cached?.url).toBe("https://signed/x");
    expect(cached?.previewMode).toBe(false);
  });

  it("drops expired entries on hydrate instead of serving dead signatures", async () => {
    const first = await import("@/lib/audio");
    first.__resetAudioUrlCacheForTests();
    first.setCachedAudioUrl("old-song", null, "https://signed/old", true);

    // Age the persisted entry past its TTL.
    const raw = stubStoreGet("wesu:audio-url-cache")!;
    const parsed = JSON.parse(raw) as { entries: { k: string; expiresAt: number }[] };
    for (const e of parsed.entries) e.expiresAt = Date.now() - 1000;
    stubStoreSet("wesu:audio-url-cache", JSON.stringify(parsed));

    vi.resetModules();
    const second = await import("@/lib/audio");
    expect(second.getCachedAudioUrl("old-song", null)).toBeNull();
  });

  it("caps the mirror at 40 entries (most recently used win)", async () => {
    const audio = await import("@/lib/audio");
    audio.__resetAudioUrlCacheForTests();
    for (let i = 0; i < 60; i++) {
      audio.setCachedAudioUrl(`bulk-${i}`, null, `https://signed/${i}`, false);
    }
    const mirror = JSON.parse(
      stubStoreGet("wesu:audio-url-cache") ?? "{}",
    ) as { entries: { k: string }[] };
    expect(mirror.entries.length).toBe(40);
    // Oldest dropped, newest kept.
    expect(mirror.entries.map((e) => e.k)).not.toContain("anon:bulk-0");
    expect(mirror.entries.map((e) => e.k)).toContain("anon:bulk-59");
  });
});

describe("image url cache", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("mirrors signed results to localStorage so the next load resolves synchronously", async () => {
    const { resolveImageUrl, __setBatchSigner } = await import("@/lib/storage-url");
    __setBatchSigner(
      async (items) => ({
        urls: Object.fromEntries(items.map((i) => [`${i.bucket}:${i.path}`, "https://signed/cover"])),
      }),
    );

    const url = await resolveImageUrl("album-art", "a/b/cover.jpg");
    expect(url).toBe("https://signed/cover");

    const mirror = JSON.parse(
      stubStoreGet("wesu:image-url-cache") ?? "{}",
    ) as { entries: { k: string; url: string }[] };
    expect(mirror.entries.map((e) => e.k)).toContain("album-art:a/b/cover.jpg");
    expect(mirror.entries.find((e) => e.k === "album-art:a/b/cover.jpg")?.url).toBe(
      "https://signed/cover",
    );
  });

  it("invalidateImageUrl removes the persisted entry (a re-sign must win)", async () => {
    const mod = await import("@/lib/storage-url");
    const { resolveImageUrl, invalidateImageUrl, __setBatchSigner } = mod;
    __setBatchSigner(
      async (items) => ({
        urls: Object.fromEntries(items.map((i) => [`${i.bucket}:${i.path}`, "https://signed/x"])),
      }),
    );
    await resolveImageUrl("album-art", "gone.jpg");

    invalidateImageUrl("album-art", "gone.jpg");
    const mirror = JSON.parse(
      stubStoreGet("wesu:image-url-cache") ?? "{}",
    ) as { entries: { k: string }[] };
    expect(mirror.entries.map((e) => e.k)).not.toContain("album-art:gone.jpg");
  });

  it("re-hydrates persisted URLs on the next load — peek works before any RPC", async () => {
    const first = await import("@/lib/storage-url");
    first.__setBatchSigner(
      async (items) => ({
        urls: Object.fromEntries(items.map((i) => [`${i.bucket}:${i.path}`, "https://signed/hero"])),
      }),
    );
    await first.resolveImageUrl("hero-images", "slides/banner.jpg");

    vi.resetModules();
    const second = await import("@/lib/storage-url");
    // Synchronous read — no signer, no await.
    expect(second.peekImageUrl("hero-images", "slides/banner.jpg")).toBe("https://signed/hero");
  });

  it("ignores expired persisted URLs (server signature is 60 min)", async () => {
    const first = await import("@/lib/storage-url");
    first.__setBatchSigner(async (items) => ({ urls: {} }));
    // Seed an aged entry directly.
    stubStoreSet(
      "wesu:image-url-cache",
      JSON.stringify({
        v: 1,
        entries: [{ k: "album-art:old.jpg", url: "https://signed/old", at: Date.now() - 55 * 60 * 1000 }],
      }),
    );

    vi.resetModules();
    const second = await import("@/lib/storage-url");
    expect(second.peekImageUrl("album-art", "old.jpg")).toBeNull();
  });
});

// --- local helpers ----------------------------------------------------------

function stubStoreGet(key: string): string | null {
  const store = (globalThis as any).window.localStorage;
  return store.getItem(key);
}

function stubStoreSet(key: string, value: string): void {
  (globalThis as any).window.localStorage.setItem(key, value);
}
