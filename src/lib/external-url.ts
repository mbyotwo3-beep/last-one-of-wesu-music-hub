/**
 * Opening links and copying text the same way on web and in the native
 * shell — the class of bugs where "web works, app breaks" (like previews
 * once did) almost always comes from unguarded browser APIs.
 *
 * - openExternalUrl: native → in-app browser sheet (Facebook-Lite style,
 *   close button returns to the app); web → same-tab redirect (checkout
 *   return URLs bring the user back; _blank variants use plain anchors).
 * - copyTextToClipboard: clipboard is unavailable/denied in some WebViews —
 *   never throws, reports success instead so callers show honest feedback.
 */

export function isNativeShell(): boolean {
  try {
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    return !!w.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** Open an external https URL. Never throws. */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeShell()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch {
      /* fall through to WebView navigation */
    }
  }
  if (typeof window === "undefined") return;
  window.location.href = url;
}

/** Origins the app itself is served from (canonical www + apex). */
const APP_SELF_HOSTS = ["www.wesuplus.com", "wesuplus.com"];

/**
 * If `url` points at the app's own site, return the internal path to
 * SPA-navigate to (`https://www.wesuplus.com/albums/1` -> `/albums/1`),
 * otherwise null.
 *
 * Why: admins paste hero/carousel/notification links as full URLs copied
 * from the browser. Those are INTERNAL — the app's own pages — but every
 * http(s) check downstream classified them "external", so the native app
 * opened its own pages in a browser. Matching the host keeps genuinely
 * foreign links on the browser path.
 */
export function sameOriginAppPath(url: unknown, currentOrigin?: string): string | null {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const origin = currentOrigin ?? (typeof window === "undefined" ? undefined : window.location.origin);
  const isSelf =
    APP_SELF_HOSTS.includes(parsed.hostname) || (origin ? parsed.origin === origin : false);
  if (!isSelf) return null;
  const path = parsed.pathname + parsed.search + parsed.hash;
  return path || "/";
}

/** Copy text. Resolves true on success, false when unavailable/denied. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
