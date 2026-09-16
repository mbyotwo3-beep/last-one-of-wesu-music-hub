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
export function registerDeepLinkHandler(): () => void {
  let remove: (() => void) | undefined;
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.includes("login-callback")) return;

    // Parse BOTH the query string and the hash fragment: URLs like
    // `...?x=1#access_token=..` previously discarded the fragment entirely
    // (only one side of the URL was ever read).
    const queryPart = url.includes("?") ? (url.split("?")[1]?.split("#")[0] ?? "") : "";
    const hashPart = url.includes("#") ? (url.split("#")[1] ?? "") : "";
    const params = new URLSearchParams(`${queryPart}&${hashPart}`);

    const errorDescription =
      params.get("error_description") ?? params.get("error") ?? undefined;
    if (errorDescription) {
      console.error("[auth-deep-link] Auth redirect error:", errorDescription);
      return;
    }

    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      try {
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch (err) {
        console.error("[auth-deep-link] Failed to set session:", err);
      }
      return;
    }

    // PKCE / email-confirmation links carry a one-time `code` instead of
    // tokens — exchange it rather than silently doing nothing.
    const code = params.get("code");
    if (code) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("[auth-deep-link] Code exchange failed:", error.message);
      } catch (err) {
        console.error("[auth-deep-link] Code exchange failed:", err);
      }
    }
  }).then((handle) => {
    remove = () => handle.remove();
  });
  // Return a cleanup so re-registrations (StrictMode / platform flips)
  // don't stack duplicate listeners.
  return () => remove?.();
}
