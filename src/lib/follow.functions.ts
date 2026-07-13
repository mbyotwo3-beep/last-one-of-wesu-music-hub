import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";

export const getFollowState = createServerFn({ method: "GET" })
  .validator((d: { artist_id: string; user_id?: string | null }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const [countRes, mineRes] = await Promise.all([
      // Aggregate-only via SECURITY DEFINER RPC — raw follower rows are no longer public.
      supabase.rpc("get_artist_follower_count" as any, { _artist_id: data.artist_id }),
      data.user_id
        ? supabase
            .from("artist_followers")
            .select("id")
            .eq("artist_id", data.artist_id)
            .eq("user_id", data.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      count: Number((countRes as { data: unknown }).data ?? 0),
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
      return { following: false };
    }
    const { error } = await context.supabase
      .from("artist_followers")
      .insert({ user_id: context.userId, artist_id: data.artist_id });
    if (error) throw new Error(error.message);
    return { following: true };
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
    if (src?.genre) q = q.eq("genre", src.genre);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
