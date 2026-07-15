import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** List the signed-in user's saved (liked) tracks — newest first. */
export const listSavedTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("saved_tracks")
      .select(
        "id, created_at, song_id, songs:song_id(id,title,cover_url,artist_id,album_id,duration_seconds,artists:artist_id(id,name))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** IDs of songs the signed-in user has saved. Cheap for batch is-liked lookups. */
export const listSavedTrackIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("saved_tracks")
      .select("song_id")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => r.song_id as string);
  });

export const saveTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("saved_tracks")
      .insert({ user_id: userId, song_id: data.song_id } as any);
    // Ignore duplicate unique-violation (already saved).
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const unsaveTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("saved_tracks")
      .delete()
      .eq("user_id", userId)
      .eq("song_id", data.song_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
