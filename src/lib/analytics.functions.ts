import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";
import { aggregateAnalytics, type AnalyticsData } from "./analytics-utils";

const DAYS = 30;
const since = () => new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function readRows(supabase: any, query: (q: any) => any) {
  const result = await query(
    supabase
      .from("play_history")
      .select("song_id,user_id,played_at,progress_seconds,songs:song_id(id,title,artist_id,artists:artist_id(id,name))")
      .gte("played_at", since())
      .order("played_at", { ascending: false })
      .limit(20000),
  );
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

const empty = (scope: AnalyticsData["scope"]): AnalyticsData =>
  aggregateAnalytics([], scope, DAYS);

export const getMyListenerAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await readRows(context.supabase, (q) => q.eq("user_id", context.userId));
    return aggregateAnalytics(rows, "listener", DAYS);
  });

export const getMyArtistAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return empty("artist");

    const admin = await getAdmin();
    const { data: songs, error: songsError } = await admin
      .from("songs")
      .select("id,title,artist_id,artists:artist_id(id,name)")
      .eq("artist_id", artist.id);
    if (songsError) throw new Error(songsError.message);
    const songIds = (songs ?? []).map((song: any) => song.id);
    if (!songIds.length) return empty("artist");
    const songMeta = new Map((songs ?? []).map((song: any) => [song.id, song]));
    const rows = await readRows(admin, (q) => q.in("song_id", songIds));
    return aggregateAnalytics(rows, "artist", DAYS, songMeta);
  });

export const getMyLabelAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: label } = await admin
      .from("labels")
      .select("id")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!label) return empty("label");

    const { data: roster, error: rosterError } = await admin
      .from("artists")
      .select("id")
      .eq("label_id", label.id)
      .eq("status", "approved");
    if (rosterError) throw new Error(rosterError.message);
    const artistIds = (roster ?? []).map((artist: any) => artist.id);
    if (!artistIds.length) return empty("label");
    const { data: songs, error: songsError } = await admin
      .from("songs")
      .select("id,title,artist_id,artists:artist_id(id,name)")
      .in("artist_id", artistIds);
    if (songsError) throw new Error(songsError.message);
    const songIds = (songs ?? []).map((song: any) => song.id);
    if (!songIds.length) return empty("label");
    const songMeta = new Map((songs ?? []).map((song: any) => [song.id, song]));
    const rows = await readRows(admin, (q) => q.in("song_id", songIds));
    return aggregateAnalytics(rows, "label", DAYS, songMeta);
  });

export const getPlatformAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isStaffUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const admin = await getAdmin();
    const rows = await readRows(admin, (q) => q);
    return aggregateAnalytics(rows, "platform", DAYS);
  });

