import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Log that the signed-in user is playing this song. Fire-and-forget from the player. */
export const recordPlay = createServerFn({ method: "POST" })
  .validator((d: { song_id: string; progress_seconds?: number }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("play_history").insert({
      user_id: userId,
      song_id: data.song_id,
      progress_seconds: Math.max(0, Math.floor(data.progress_seconds ?? 0)),
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Recently played songs — most recent play per song, newest first.
 * Powers the "Continue Listening" / "Recently Played" home shelf.
 */
export const getRecentlyPlayed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("play_history")
      .select(
        "song_id, played_at, progress_seconds, songs:song_id(id,title,cover_url,duration,price,artist:artists(id,name))",
      )
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const rows: any[] = [];
    for (const r of data ?? []) {
      const id = (r as any).song_id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const s = (r as any).songs;
      if (!s) continue;
      rows.push({ ...s, played_at: (r as any).played_at, progress_seconds: (r as any).progress_seconds });
      if (rows.length >= 12) break;
    }
    return rows;
  });
