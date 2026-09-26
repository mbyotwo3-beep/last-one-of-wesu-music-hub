/**
 * Deep link auth handler for Capacitor Android.
 * Listens for appUrlOpen events and completes the Supabase auth flow
 * when a magic-link, OAuth, or password-recovery redirect URL is opened.
 *
 * URL scheme: com.wesu.music://login-callback?access_token=...&refresh_token=...
 * Recovery: com.wesu.music://login-callback?type=recovery&... — after the
 * session is set, a `wesu:recovery` window event fires so the app can route
 * to /reset-password (a `recovery_pending` sessionStorage flag backs it).
 *
 * Feature: wesu-plus-completion
 * Validates: Requirements 18.3, 18.4
 */
import { App } from "@capacitor/app";
import { supabase } from "./client";

export interface AuthCallbackParams {
  /** Not a login-callback URL at all — ignore. */
  isLoginCallback: boolean;
  access_token: string | null;
  refresh_token: string | null;
  /** PKCE / email-confirmation one-time code. */
  code: string | null;
  isRecovery: boolean;
  errorDescription?: string;
}

/**
 * Pure parse of a login-callback URL. Reads BOTH the query string and the
 * hash fragment: URLs like `...?x=1#access_token=..` previously discarded
 * the fragment entirely (only one side of the URL was ever read).
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  const empty: AuthCallbackParams = {
    isLoginCallback: false,
    access_token: null,
    refresh_token: null,
    code: null,
    isRecovery: false,
  };
  if (!url.includes("login-callback")) return empty;
  const queryPart = url.includes("?") ? (url.split("?")[1]?.split("#")[0] ?? "") : "";
  const hashPart = url.includes("#") ? (url.split("#")[1] ?? "") : "";
  const params = new URLSearchParams(`${queryPart}&${hashPart}`);
  return {
    isLoginCallback: true,
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    code: params.get("code"),
    isRecovery: params.get("type") === "recovery",
    errorDescription: params.get("error_description") ?? params.get("error") ?? undefined,
  };
}

/**
 * Register the deep link handler for Supabase auth callbacks.
 * Call this once at app startup inside a useEffect guarded by usePlatform() === 'native'.
 */
export function registerDeepLinkHandler(): () => void {
  let remove: (() => void) | undefined;
  App.addListener("appUrlOpen", async ({ url }) => {
    const parsed = parseAuthCallbackUrl(url);
    if (!parsed.isLoginCallback) return;

    if (parsed.errorDescription) {
      console.error("[auth-deep-link] Auth redirect error:", parsed.errorDescription);
      return;
    }

    const finishRecovery = () => {
      // Code-exchange links surface SIGNED_IN, not PASSWORD_RECOVERY, so the
      // reset page couldn't tell a recovery session apart. Flag + event it.
      try {
        sessionStorage.setItem("recovery_pending", "1");
        window.dispatchEvent(new CustomEvent("wesu:recovery"));
      } catch {
        /* ignore */
      }
    };

    // Non-recovery logins (signup confirmation, OAuth): tell the app a
    // session just landed so the foreground page can run post-auth actions
    // (invite accepts, like/follow replays) instead of sitting idle.
    const announceSignIn = () => {
      try {
        window.dispatchEvent(new CustomEvent("wesu:signed-in"));
      } catch {
        /* ignore */
      }
    };

    const { access_token, refresh_token, code, isRecovery } = parsed;
    if (access_token && refresh_token) {
      try {
        await supabase.auth.setSession({ access_token, refresh_token });
        if (isRecovery) finishRecovery();
        else announceSignIn();
      } catch (err) {
        console.error("[auth-deep-link] Failed to set session:", err);
      }
      return;
    }

    // PKCE / email-confirmation links carry a one-time `code` instead of
    // tokens — exchange it rather than silently doing nothing.
    if (code) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("[auth-deep-link] Code exchange failed:", error.message);
        else if (isRecovery) finishRecovery();
        else announceSignIn();
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
