/**
 * Detect an installed app running an older client bundle than the live deploy.
 *
 * The native shell is a WebView around the production site, and the service
 * worker keeps hashed assets forever. After a deploy, the old HTML shell can be
 * served from cache if the navigation fetch fails, so the WebView keeps running
 * yesterday's JavaScript. Those old server-fn ids no longer match the new
 * deployment, and pages render "No music yet" with no error — the failure that
 * looked like broken pages in the app but never in a fresh browser.
 *
 * The check is deliberately pure so it can be tested: compare the index bundle
 * the document actually loaded with the one the live HTML references.
 */

export function indexAssetFromScripts(srcs: string[]): string | null {
  for (const src of srcs) {
    const m = src.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    if (m) return m[0];
  }
  return null;
}

export function indexAssetFromHtml(html: string): string | null {
  const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? m[0] : null;
}

/** True only when both sides are known and point at a different build. */
export function isStaleClient(loaded: string | null, live: string | null): boolean {
  if (!loaded || !live) return false;
  return loaded !== live;
}

/**
 * Whether to reload now. Only native shells auto-heal (web tabs get the fresh
 * document on the next navigation), only online, and at most once per window so
 * a persistently failing shell cannot reload-loop.
 */
export function shouldAutoReload(opts: {
  isNative: boolean;
  online: boolean;
  loaded: string | null;
  live: string | null;
  lastCheckMs: number;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  if (!opts.isNative || !opts.online) return false;
  if (!isStaleClient(opts.loaded, opts.live)) return false;
  const cooldown = opts.cooldownMs ?? 5 * 60_000;
  return opts.nowMs - opts.lastCheckMs > cooldown;
}
