/**
 * Wesu+ offline shell cache.
 *
 * WHY THIS FILE EXISTS — the single biggest defect in the app until now
 *
 * The APK is a WebView pointed at https://www.wesuplus.com/. It is an SSR app:
 * there is NO static index.html anywhere in the project, because every page is
 * rendered by the server on request.
 *
 * That means with the data off, the WebView cannot fetch a document at all. It
 * shows Android's "Webpage not available" screen, and then the app does not
 * exist: no React, no IndexedDB, no encrypted vault, no offline-mode switch, no
 * cached lists. Everything built for offline was unreachable, because the thing
 * that would have rendered it could not start.
 *
 * The listener saw a dead app while offline and reasonably concluded downloads
 * were not being kept. They probably were — nothing could read them.
 *
 * Spotify does not have this problem because it is a native app with its own
 * local database and its own local UI. It never needs a network to draw a
 * screen. To match that from a WebView, the app shell itself has to be
 * available locally.
 *
 * WHAT THIS DOES
 *
 * Once a page has loaded successfully, its HTML and the hashed assets it needs
 * are cached. When the network then fails:
 *
 *   navigation  -> network first, fall back to the last good copy of that route
 *   /assets/*   -> cache first (filenames contain a content hash, so they are
 *                  immutable and a cached one is always correct)
 *   everything else (API, Supabase, Lenco, signed audio URLs)
 *               -> NEVER cached. Music bytes must not be served stale, and
 *                  purchase state must never come from a cache.
 *
 * Network-first for documents is deliberate: a listener online always gets the
 * live site, so a web fix reaches installed apps with no rebuild. The cache is
 * only ever the fallback.
 *
 * Signed audio URLs are single-use and expire, so they are excluded explicitly.
 */

const VERSION = "v3";
const SHELL_CACHE = `wesu-shell-${VERSION}`;
const ASSET_CACHE = `wesu-assets-${VERSION}`;
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE]);

/** Routes worth keeping a fallback copy of. */
const SHELL_PATHS = ["/", "/browse", "/downloads", "/library", "/search", "/albums", "/artists"];

/** Never cached, whatever they look like. */
const NEVER_CACHE = [
  /\/api\//,
  /supabase\.co/,
  /lenco/i,
  /\/storage\/v1\//,
  /\/signed-url/,
  /\.(mp3|m4a|aac|ogg|wav|opus)$/i,
];

function shouldNeverCache(url) {
  return NEVER_CACHE.some((re) => re.test(url.pathname) || re.test(url.href));
}

/** Hashed build output: safe to serve from cache forever. */
function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      /\.(js|css|woff2?|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname))
  );
}

async function putShell(request, response) {
  // Only a real 200 HTML response is a usable shell. Caching a redirect, an
  // error page or a 404 would make the offline fallback worse than nothing.
  if (!response || response.status !== 200) return;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return;
  try {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  } catch {
    /* quota or private mode — offline fallback simply will not be available */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Warm the shell. Any single failure is tolerated: the real value is the
      // copy taken from normal navigation, which covers routes not listed here.
      await Promise.allSettled(
        SHELL_PATHS.map(async (path) => {
          const res = await fetch(new Request(path, { cache: "reload" }));
          await putShell(new Request(path), res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept music, purchases, or the API.
  if (shouldNeverCache(url)) return;

  // --- navigation: the app shell. Network first, cached copy as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          await putShell(request, res);
          return res;
        } catch (err) {
          const cache = await caches.open(SHELL_CACHE);
          const exact = await cache.match(request, { ignoreSearch: true });
          if (exact) return exact;
          // Fall back to "/" so a deep link still opens the app rather than a
          // dead end. The client-side router restores the intended route.
          const root = await cache.match("/", { ignoreSearch: true });
          if (root) return root;
          throw err;
        }
      })(),
    );
    return;
  }

  // --- hashed assets: cache first. A content-hashed file cannot go stale.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res && res.status === 200) void cache.put(request, res.clone());
          return res;
        } catch (err) {
          // The shell may reference an asset that was never cached, because it
          // was pruned or the first load happened before this worker existed.
          // Falling through to the network here would throw again, so serve the
          // shell's own HTML rather than a browser error.
          const shell = await caches.open(SHELL_CACHE);
          const root = await shell.match("/", { ignoreSearch: true });
          if (root) return root;
          throw err;
        }
      })(),
    );
  }
});

/** Let the page ask whether it is being served from cache. */
self.addEventListener("message", (event) => {
  if (event.data === "wesu:sw-version") {
    event.source?.postMessage({ version: VERSION });
  }
});
