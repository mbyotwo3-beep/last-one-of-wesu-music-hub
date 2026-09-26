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
