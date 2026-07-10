/**
 * Deep link auth handler for Capacitor Android.
 * Listens for appUrlOpen events and completes the Supabase auth flow
 * when a magic-link or OAuth redirect URL is opened.
 *
 * URL scheme: com.wesu.music://login-callback?access_token=...&refresh_token=...
 *
 * Feature: wesu-plus-completion
 * Validates: Requirements 18.3, 18.4
 */
import { App } from "@capacitor/app";
import { supabase } from "./client";

/**
 * Register the deep link handler for Supabase auth callbacks.
 * Call this once at app startup inside a useEffect guarded by usePlatform() === 'native'.
 */
export function registerDeepLinkHandler(): void {
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.includes("login-callback")) return;

    // Support both query string (?access_token=...) and hash fragment (#access_token=...)
    const separator = url.includes("?") ? "?" : "#";
    const paramStr = url.split(separator)[1] ?? "";
    const params = new URLSearchParams(paramStr);

    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      try {
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch (err) {
        console.error("[auth-deep-link] Failed to set session:", err);
      }
    }
  });
}
