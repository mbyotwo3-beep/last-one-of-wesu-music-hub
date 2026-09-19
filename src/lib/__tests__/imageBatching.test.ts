import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveImageUrl,
  invalidateImageUrl,
  __setBatchSigner,
} from "../storage-url";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("image URL batching", () => {
  beforeEach(() => {
    __setBatchSigner(null);
    vi.clearAllMocks();
  });

  it("coalesces a render burst into ONE signer call", async () => {
    const signer = vi.fn(async (items: { bucket: string; path: string }[]) => ({
      urls: Object.fromEntries(items.map((it) => [`${it.bucket}:${it.path}`, `signed://${it.path}`])),
    }));
    __setBatchSigner(signer);

    const paths = Array.from({ length: 25 }, (_, i) => `cover-${i}.jpg`);
    const results = await Promise.all(
      paths.map((p) => resolveImageUrl("album-art", p)),
    );

    expect(signer).toHaveBeenCalledTimes(1);
    expect(signer.mock.calls[0][0]).toHaveLength(25);
    for (let i = 0; i < paths.length; i++) {
      expect(results[i]).toBe(`signed://${paths[i]}`);
    }
  });

  it("serves repeats from cache with zero signer calls", async () => {
    const signer = vi.fn(async (items: { bucket: string; path: string }[]) => ({
      urls: Object.fromEntries(items.map((it) => [`${it.bucket}:${it.path}`, `signed://${it.path}`])),
    }));
    __setBatchSigner(signer);

    const first = await resolveImageUrl("album-art", "cached.jpg");
    const second = await resolveImageUrl("album-art", "cached.jpg");
    expect(first).toBe(second);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("resolves duplicates in the same window for every waiter", async () => {
    const signer = vi.fn(async (items: { bucket: string; path: string }[]) => ({
      urls: Object.fromEntries(items.map((it) => [`${it.bucket}:${it.path}`, `signed://${it.path}`])),
    }));
    __setBatchSigner(signer);

    const [a, b] = await Promise.all([
      resolveImageUrl("album-art", "same.jpg"),
      resolveImageUrl("album-art", "same.jpg"),
    ]);
    expect(a).toBe("signed://same.jpg");
    expect(b).toBe("signed://same.jpg");
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("rejects only the failed key and releases its slot for retry", async () => {
    let attempt = 0;
    __setBatchSigner(async (items) => {
      attempt++;
      const urls: Record<string, string | null> = {};
      for (const it of items) {
        urls[`${it.bucket}:${it.path}`] =
          it.path === "bad.jpg" && attempt === 1 ? null : `signed://${it.path}`;
      }
      return { urls };
    });

    const good = resolveImageUrl("album-art", "good.jpg");
    const bad = resolveImageUrl("album-art", "bad.jpg");
    await expect(good).resolves.toBe("signed://good.jpg");
    await expect(bad).rejects.toThrow("Failed to sign image");

    // Slot released: retry re-signs instead of returning the rejection.
    const retry = await resolveImageUrl("album-art", "bad.jpg");
    expect(retry).toBe("signed://bad.jpg");
    expect(attempt).toBe(2);
  });

  it("bypasses the signer for absolute URLs and null paths", async () => {
    const signer = vi.fn(async () => ({ urls: {} }));
    __setBatchSigner(signer);

    await expect(resolveImageUrl("album-art", null)).resolves.toBeNull();
    await expect(
      resolveImageUrl("album-art", "https://cdn.example.com/x.jpg"),
    ).resolves.toBe("https://cdn.example.com/x.jpg");
    await sleep(40);
    expect(signer).not.toHaveBeenCalled();
  });

  it("invalidate drops a queued request and lets the next resolve re-sign", async () => {
    const signer = vi.fn(async (items: { bucket: string; path: string }[]) => ({
      urls: Object.fromEntries(items.map((it) => [`${it.bucket}:${it.path}`, `signed://${it.path}`])),
    }));
    __setBatchSigner(signer);

    const pending = resolveImageUrl("album-art", "drop.jpg");
    invalidateImageUrl("album-art", "drop.jpg");
    await expect(pending).rejects.toThrow("invalidated");
    const fresh = await resolveImageUrl("album-art", "drop.jpg");
    expect(fresh).toBe("signed://drop.jpg");
    expect(signer).toHaveBeenCalledTimes(1);
  });
});
