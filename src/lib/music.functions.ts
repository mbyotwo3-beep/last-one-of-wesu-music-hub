import { createServerFn } from "@tanstack/react-start";
import { getPublicSupabase } from "./supabase-public.server";

// ---------- Featured / Trending / New releases ----------

export const getFeaturedAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("albums")
    .select("id,title,cover_url,price,release_date,artist:artists(id,name)")
    .eq("featured", true)
    .order("release_date", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getNewReleases = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("songs")
    .select("id,title,duration,price,cover_url,artist:artists(id,name)")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getTrendingSongs = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("songs")
    .select("id,title,play_count,cover_url,artist:artists(id,name)")
    .order("play_count", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ---------- Browse / Search ----------

export const searchSongs = createServerFn({ method: "GET" })
  .validator((d: { q?: string; genre?: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    let q = supabase
      .from("songs")
      .select("id,title,duration,price,cover_url,genre,artist:artists(id,name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (data.genre) q = q.eq("genre", data.genre);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Spotify-style global search — hits songs, albums, and artists in parallel.
 * Ranks by exact/prefix match first, then substring match, then popularity.
 */
export const globalSearch = createServerFn({ method: "GET" })
  .validator((d: { q: string; limit?: number }) => d)
  .handler(async ({ data }) => {
    const q = (data.q ?? "").trim();
    if (!q) return { songs: [], albums: [], artists: [] };
    const limit = data.limit ?? 8;
    const supabase = getPublicSupabase();
    const like = `%${q}%`;

    const [songsRes, albumsRes, artistsRes] = await Promise.all([
      supabase
        .from("songs")
        .select("id,title,cover_url,price,duration,play_count,artist:artists(id,name)")
        .ilike("title", like)
        .order("play_count", { ascending: false })
        .limit(limit * 3),
      supabase
        .from("albums")
        .select("id,title,cover_url,price,release_date,artist:artists(id,name)")
        .ilike("title", like)
        .order("release_date", { ascending: false })
        .limit(limit * 3),
      supabase
        .from("artists")
        .select("id,name,avatar_url,genre,verified,monthly_listeners")
        .eq("status", "approved")
        .ilike("name", like)
        .order("monthly_listeners", { ascending: false })
        .limit(limit * 3),
    ]);

    if (songsRes.error) throw new Error(songsRes.error.message);
    if (albumsRes.error) throw new Error(albumsRes.error.message);
    if (artistsRes.error) throw new Error(artistsRes.error.message);

    const needle = q.toLowerCase();
    const score = (s: string | null | undefined) => {
      if (!s) return 0;
      const v = s.toLowerCase();
      if (v === needle) return 3;
      if (v.startsWith(needle)) return 2;
      if (v.includes(needle)) return 1;
      return 0;
    };
    const sortByScore = <T extends { title?: string; name?: string }>(rows: T[]) =>
      rows
        .map((r, i) => ({ r, s: score(r.title ?? r.name), i }))
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .map((x) => x.r)
        .slice(0, limit);

    return {
      songs: sortByScore(songsRes.data ?? []),
      albums: sortByScore(albumsRes.data ?? []),
      artists: sortByScore(artistsRes.data ?? []),
    };
  });

export const listAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("albums")
    .select("id,title,cover_url,price,release_date,genre,artist:artists(id,name)")
    .order("release_date", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listArtists = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("artists")
    .select("id,name,genre,avatar_url,verified,monthly_listeners")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
});

// ---------- Artist & Album detail ----------

export const getArtistById = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const [artist, albums, songs] = await Promise.all([
      supabase.from("artists").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("albums")
        .select("id,title,cover_url,release_date,price")
        .eq("artist_id", data.id)
        .order("release_date", { ascending: false }),
      supabase
        .from("songs")
        .select("id,title,duration,price,cover_url,play_count")
        .eq("artist_id", data.id)
        .order("play_count", { ascending: false })
        .limit(20),
    ]);
    if (artist.error) throw new Error(artist.error.message);
    return {
      artist: artist.data,
      albums: albums.data ?? [],
      topSongs: songs.data ?? [],
    };
  });

export const getAlbumWithSongs = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const [album, songs] = await Promise.all([
      supabase
        .from("albums")
        .select("*, artist:artists(id,name,avatar_url)")
        .eq("id", data.id)
        .maybeSingle(),
      supabase
        .from("songs")
        .select("id,title,duration,price")
        .eq("album_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (album.error) throw new Error(album.error.message);
    return { album: album.data, songs: songs.data ?? [] };
  });

// ---------- Purchasable item lookup (song or album) ----------

export const getPurchasableItem = createServerFn({ method: "GET" })
  .validator((d: { item_type: "song" | "album"; id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    if (data.item_type === "song") {
      const { data: row, error } = await supabase
        .from("songs")
        .select("id,title,price,cover_url,artist:artists(id,name)")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("albums")
      .select("id,title,price,cover_url,artist:artists(id,name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Subscription Plans & Payment Methods ----------

export const getSubscriptionPlans = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getPaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});
