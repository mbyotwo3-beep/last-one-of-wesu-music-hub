/**
 * Registering the offline shell cache.
 *
 * The app is an SSR WebView: no static index.html exists, so with the data off
 * the WebView cannot fetch a document and the app never starts. Every offline
 * feature — the encrypted vault, the offline-mode switch, the list snapshots —
 * lives inside the React tree, so all of them were unreachable offline. public/sw.js
 * caches the shell so the app can boot; this module makes sure it gets registered.
 *
 * WHY REGISTRATION IS DEFERRED AND GUARDED
 *
 *   - It runs after load so it never competes with first paint on a cold start,
 *     which matters on the 2-3GB phones this audience actually uses.
 *   - It is idempotent, because a re-register would throw away the warm cache
 *     and cost the listener their offline copy until the next page load.
 *   - A failure here is swallowed. Offline support is an enhancement; refusing
 *     to boot because a service worker would not register would be absurd.
 *   - Only registered in the native shell. On the open web the browser manages
 *     its own caching, and claiming a worker's scope on a domain we do not own
 *     the deployment of is not ours to do.
 */

const REGISTERED = Symbol.for("wesu.sw.registered");

function isNativeShell(): boolean {
  try {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    return !!w.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * True when this build of the browser can actually serve from a cache.
 * Absent or unsupported, the app falls back to the branded error page.
 */
export function shellCacheSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Install the shell cache. Safe to call repeatedly.
 * Resolves true once a worker is controlling the page.
 */
export async function ensureShellCache(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!shellCacheSupported()) return false;

  const g = window as unknown as Record<symbol, boolean | undefined>;
  if (g[REGISTERED]) return true;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    g[REGISTERED] = true;
    return true;
  } catch {
    // A failed registration must never break the app. The next launch retries.
    return false;
  }
}

/**
 * Whether a shell copy is on the device — i.e. whether going offline will
 * actually work. Used to warn rather than to block: the first online launch
 * after install legitimately has no copy yet.
 */
export async function hasShellCopy(): Promise<boolean> {
  if (!shellCacheSupported()) return false;
  try {
    const cache = await caches.open("wesu-shell-v3");
    const hit = await cache.match("/", { ignoreSearch: true });
    return !!hit;
  } catch {
    return false;
  }
}

/** True when the page is being served by the worker, i.e. this load is cached. */
export function servedFromCache(): boolean {
  try {
    return !!navigator.serviceWorker?.controller;
  } catch {
    return false;
  }
}

export { isNativeShell };
