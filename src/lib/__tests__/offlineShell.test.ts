/**
 * The offline shell cache, checked against what actually broke.
 *
 * The reported symptom: with the data off, the app shows Android's "Webpage not
 * available" screen. Nobody can see their downloads.
 *
 * The cause: the app is SSR, so there is no document to load offline. The
 * WebView fails, and every offline feature — vault, offline mode, snapshots —
 * lives inside a React tree that never starts.
 *
 * These tests parse the REAL public/sw.js that gets deployed. They are not a
 * mirror: an earlier test in this project re-implemented the logic it was
 * checking and stayed green while the shipped code broke.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sw = readFileSync("public/sw.js", "utf8");

/** Find the fetch listener body. */
function fetchHandler(): string {
  const start = sw.indexOf('self.addEventListener("fetch"');
  expect(start).toBeGreaterThan(-1);
  const end = sw.indexOf('self.addEventListener("message"', start);
  return sw.slice(start, end === -1 ? sw.length : end);
}

describe("the shell cache exists at all", () => {
  it("is served from public/ so it lands in the deployment", () => {
    // public/ is copied to .output/public by the build. A worker anywhere else
    // never reaches a device.
    expect(sw).toContain("SHELL_CACHE");
    expect(sw).toContain('self.addEventListener("fetch"');
    expect(sw).toContain('self.addEventListener("install"');
  });

  it("registers for the root scope so it controls every route", () => {
    const src = readFileSync("src/lib/offline-shell.ts", "utf8");
    expect(src).toContain('register("/sw.js", { scope: "/" })');
  });
});

describe("navigation falls back to a cached shell", () => {
  it("handles navigations", () => {
    expect(fetchHandler()).toContain('request.mode === "navigate"');
  });

  it("tries the network FIRST", () => {
    // Network-first is what keeps web fixes reaching installed apps with no
    // rebuild. Cache-first here would freeze every listener on whatever build
    // they first opened.
    const h = fetchHandler();
    const nav = h.slice(h.indexOf('request.mode === "navigate"'));
    expect(nav).toMatch(/await fetch\(request\)/);
    expect(nav.indexOf("await fetch(request)")).toBeLessThan(
      nav.indexOf("caches.open(SHELL_CACHE)"),
    );
  });

  it("serves the cached shell when the fetch throws", () => {
    const h = fetchHandler();
    expect(h).toMatch(/catch[\s\S]{0,400}cache\.match/);
  });

  it("falls back to the root shell for a deep link it never cached", () => {
    // /downloads opened directly offline must still boot rather than dead-end.
    const h = fetchHandler();
    expect(h).toContain('cache.match("/", { ignoreSearch: true })');
  });
});

describe("what must never be served from cache", () => {
  const h = fetchHandler();
  const block = sw.slice(sw.indexOf("NEVER_CACHE"), sw.indexOf("function shouldNeverCache"));

  it("excludes the API", () => {
    // Written as an escaped regex literal /\/api\//, so match the pattern
    // rather than a plain path — a plain "/api/" is absent by construction.
    expect(block).toContain("/\\/api\\//");
  });

  it("excludes Supabase, so purchase state is never stale", () => {
    expect(block).toContain("supabase");
  });

  it("excludes audio files", () => {
    // Signed audio URLs are single-use and expire. Serving one from cache would
    // be a dead stream, and caching the bytes would defeat the licence check.
    expect(block).toMatch(/mp3|m4a|aac|ogg|wav|opus/);
  });

  it("excludes Lenco, so a charge is never answered from cache", () => {
    expect(block).toMatch(/lenco/i);
  });

  it("returns early for those, before any cache is consulted", () => {
    expect(h).toMatch(/if \(shouldNeverCache\(url\)\) return;/);
  });
});

describe("assets", () => {
  it("are cache-first, because hashed filenames cannot go stale", () => {
    const h = fetchHandler();
    expect(h).toMatch(/isImmutableAsset[\s\S]{0,200}cache\.match/);
  });

  it("only cache a 200 response", () => {
    // Caching a 404 or an error page would make the offline fallback worse than
    // having none.
    expect(sw).toContain("response.status !== 200");
  });

  it("only cache HTML for the shell", () => {
    expect(sw).toContain("text/html");
  });
});

describe("housekeeping", () => {
  it("deletes caches from older versions", () => {
    // Without this a stale worker keeps serving an old app forever, and the
    // listener has no way to clear it.
    expect(sw).toMatch(/caches\.keys[\s\S]{0,300}caches\.delete/);
  });

  it("does not fail the install if one route cannot be warmed", () => {
    // Warming is best-effort. The copy taken from real navigation is what
    // matters, and an install that rejects leaves no worker at all.
    expect(sw).toContain("Promise.allSettled");
  });
});
