import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { normalizeGenre } from "./genres";

/**
 * Public follower COUNT. Kept separate from the "am I following?" read on
 * purpose: the count comes from the maintained `artists.follower_count`
 * counter and must render for signed-OUT visitors, while the personal flag
 * needs an authenticated caller. One function that required auth made the
 * count disappear for every logged-out visitor.
 */
export const getFollowerCount = createServerFn({ method: "GET" })
  .validator((d: { artist_id: string }) => d)
  .handler(async ({ data }) => {
    const res = await getPublicSupabase()
      .from("artists")
      .select("follower_count")
      .eq("id", data.artist_id)
      .maybeSingle();
    return Number((res as { data: { follower_count?: number } | null }).data?.follower_count ?? 0);
  });

/**
 * The caller's OWN follow state. This reads `artist_followers`, which RLS
 * scopes to the authenticated user — it used to run unauthenticated through
 * the anon client and take a caller-supplied user_id, so the read always
 * errored (and the error was discarded) and returned following:false for
 * everyone: the Follow button could never stick. Identity now comes from the
 * verified token only.
 */
export const getFollowState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { artist_id: string }) => d)
  .handler(async ({ context, data }) => {
    // RLS: "Users read own follow rows" — only ever returns the caller's row.
    const mine = await context.supabase
      .from("artist_followers")
      .select("id")
      .eq("artist_id", data.artist_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    return { following: !!(mine as { data: unknown }).data };
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
