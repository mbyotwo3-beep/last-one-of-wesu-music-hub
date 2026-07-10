import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [playlists, purchases, subscription, profile] = await Promise.all([
      supabase
        .from("playlists")
        .select("id,name,cover_url,is_public,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("purchases")
        .select("id,amount,created_at,song:songs(id,title),album:albums(id,title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    return {
      playlists: playlists.data ?? [],
      recentPurchases: purchases.data ?? [],
      subscription: subscription.data,
      profile: profile.data,
      stats: {
        playlists: playlists.data?.length ?? 0,
        purchases: purchases.data?.length ?? 0,
      },
    };
  });

export const getMyArtistOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: artist } = await supabase
      .from("artists")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!artist) {
      return { artist: null, topSongs: [], totalSongs: 0, totalPlays: 0, totalRevenueZmw: 0 };
    }

    const { data: songRowsAll } = await supabase
      .from("songs")
      .select("id,title,play_count,price,created_at")
      .eq("artist_id", artist.id)
      .order("play_count", { ascending: false });

    const { data: albumRows } = await supabase
      .from("albums")
      .select("id")
      .eq("artist_id", artist.id);

    const songIds = (songRowsAll ?? []).map((s) => s.id);
    const albumIds = (albumRows ?? []).map((a) => a.id);

    // Revenue requires admin client — purchases RLS scopes per-user.
    // We're authorized because the caller proved ownership of this artist row.
    let sales: { data: { amount: number }[] | null } = { data: [] };
    if (songIds.length || albumIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const filters: string[] = [];
      if (songIds.length) filters.push(`song_id.in.(${songIds.join(",")})`);
      if (albumIds.length) filters.push(`album_id.in.(${albumIds.join(",")})`);
      const r = await supabaseAdmin.from("purchases").select("amount").or(filters.join(","));
      sales = { data: r.data ?? [] };
    }

    const songs = { data: songRowsAll };

    const songRows = songs.data ?? [];
    const totalPlays = songRows.reduce((s, r) => s + (r.play_count ?? 0), 0);
    const totalRevenueZmw = (sales.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    return {
      artist,
      topSongs: songRows.slice(0, 10),
      totalSongs: songRows.length,
      totalPlays,
      totalRevenueZmw,
    };
  });

export const getMyArtistProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: artist } = await supabase
      .from("artists")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    return artist;
  });
