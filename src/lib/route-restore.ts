/**
 * Reopening the app lands where the listener was — the Spotify behaviour.
 *
 * WHY THIS EXISTS
 *
 * Android kills a backgrounded app's process and relaunches it at the shell's
 * start URL ("/"). The WebView comes back with ALL state: IndexedDB, the
 * vault, the auth session — everything except WHERE THE LISTENER WAS. The
 * user was in /library or /downloads; reopening the app dropped them at the
 * top of home every time, which is exactly the feel of an app that "never
 * quite resumes". This records the last route on every navigation (native
 * only; the open web may keep browser-driven deep-linking semantics) and
 * restores it once on boot.
 *
 * THE DECISION IS PURE. Recording is one localStorage write; restoring one
 * history.push. What can go wrong is in the RULE, and the rule is tested:
 *
 *   - never on the open web (the browser owns deep-linking there);
 *   - never when nothing was stored (first launch boots home, correctly);
 *   - never when the stored route IS the current one (no loops);
 *   - never anything that does not look like an internal path — a
 *     protocol-relative "stored" string is an injection, not a route.
 */

export const LAST_ROUTE_KEY = "wesu:last-route";

export interface RestoreDecision {
  action: "restore" | "stay";
  to?: string;
}

export function routeRestoreDecision(i: {
  isNative: boolean;
  currentPath: string;
  stored: string | null;
}): RestoreDecision {
  if (!i.isNative) return { action: "stay" };
  if (!i.stored) return { action: "stay" };
  if (!i.stored.startsWith("/") || i.stored.startsWith("//")) return { action: "stay" };
  if (i.stored === i.currentPath) return { action: "stay" };
  return { action: "restore", to: i.stored };
}
