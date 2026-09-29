import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { normalizeGenre } from "./genres";

// Follower COUNT is public (maintained counter on `artists`), but "am I
// following this?" reads the caller's OWN row, which RLS scopes to the
// authenticated user. It used to run unauthenticated through the anon client
// and take a caller-supplied user_id, so the read always errored (discarded)
// and returned following:false for everyone — the Follow button could never
// stick. The user identity now comes from the verified token only.
export const getFollowState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { artist_id: string }) => d)
  .handler(async ({ context, data }) => {
    const [countRes, mineRes] = await Promise.all([
      // Aggregate only: the maintained counter on `artists`. Raw follower rows stay private.
      getPublicSupabase()
        .from("artists")
        .select("follower_count")
        .eq("id", data.artist_id)
        .maybeSingle(),
      // RLS: "Users read own follow rows" — only ever returns the caller's row.
      context.supabase
        .from("artist_followers")
        .select("id")
        .eq("artist_id", data.artist_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    return {
      count: Number(
        (countRes as { data: { follower_count?: number } | null }).data?.follower_count ?? 0,
      ),
      following: !!(mineRes as { data: unknown }).data,
    };
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { artist_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("artist_followers")
      .select("id")
      .eq("artist_id", data.artist_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("artist_followers")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (error) throw new Error(error.message);
      return { following: false, action: "unfollowed" };
    }
    const { error } = await context.supabase
      .from("artist_followers")
      .insert({ user_id: context.userId, artist_id: data.artist_id });
    if (error) throw new Error(error.message);
    return { following: true, action: "followed" };
  });

/**
 * Similar artists — same genre, ordered by monthly_listeners, excluding self.
 * Falls back to top artists if the source artist has no genre.
 */
export const getSimilarArtists = createServerFn({ method: "GET" })
  .validator((d: { artist_id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: src } = await supabase
      .from("artists")
      .select("id,genre")
      .eq("id", data.artist_id)
      .maybeSingle();
    let q = supabase
      .from("artists")
      .select("id,name,avatar_url,genre,verified,monthly_listeners")
      .eq("status", "approved")
      .neq("id", data.artist_id)
      .order("monthly_listeners", { ascending: false })
      .limit(8);
    if (src?.genre) q = q.eq("genre", normalizeGenre(src.genre) || src.genre);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
