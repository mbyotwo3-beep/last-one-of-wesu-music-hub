import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer } from "@/stores/player";

/**
 * Single shared sign-out path. Previously Navbar / BottomTabBar / profile
 * each had their own copy with different gaps: stale private React-Query
 * data surviving sign-out, playback continuing after logout, a leftover
 * post-auth redirect firing for the next account, and a failed signOut()
 * still navigating to "/" as if it succeeded.
 */
export async function signOutEverywhere(qc?: QueryClient | null): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (err) {
    console.error("[sign-out] signOut failed:", err);
    return false;
  }
  try {
    usePlayer.getState().exitSong();
  } catch {
    /* ignore */
  }
  try {
    qc?.clear();
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem("post_auth_redirect");
    sessionStorage.removeItem("pending_invite");
    // Pending intents belong to the signed-out account — never replay them
    // as the next user on a shared device.
    sessionStorage.removeItem("pending_post_auth_action");
    sessionStorage.removeItem("pending_add_playlist");
  } catch {
    /* ignore */
  }
  return true;
}
