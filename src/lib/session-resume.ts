/**
 * Session recovery for a WebView that slept: refreshes an expired access
 * token ONCE, deliberately narrow.
 *
 * WHY THIS EXISTS
 *
 * The Supabase browser client has autoRefreshToken, but inside Android's
 * doze that timer freezes; the app resumes first and the resume burst calls
 * server functions with a token that expired hours ago. One failure class
 * fixes one action: refresh the session, let the caller re-run the route.
 *
 * Deliberately NOT a general "retry auth everywhere" lever — anonymous
 * browsing is legal on this app, so a session that cannot refresh is not a
 * fault for public pages; the caller decides what a failed refresh means
 * (the route error surface falls back to the honest fault screen).
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Refresh the local session if its token is inside the stale window.
 * Returns true when the app is in a state where re-running the route is
 * worth it: a live refreshed session, or no session at all (anon browsing
 * is legal — nothing to fix, nothing to wait for). Only a refresh that was
 * ATTEMPTED and failed returns false.
 */
export async function refreshSessionIfStale(maxRemainingMs = 90_000): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const expiresAtMs = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
    const remaining = expiresAtMs - Date.now();
    if (!expiresAtMs || remaining >= maxRemainingMs) return true;
    // A refresh attempt with no connection would just fail — leave it to the
    // caller's fallback instead of waiting out a doomed request.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    const { error } = await supabase.auth.refreshSession();
    return !error;
  } catch {
    // Thrown here means the auth machinery itself is unreachable — the
    // caller's fault screen is the honest answer.
    return false;
  }
}
