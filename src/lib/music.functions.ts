import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { normalizeGenre } from "./genres";

// ---------- Featured / Trending / New releases ----------

export const getFeaturedAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("albums")
    .select("id,title,cover_url,price,release_date,artist:artists(id,name)")
    .eq("featured", true)
    .eq("status", "approved")
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
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getTrendingSongs = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("songs")
    .select("id,title,play_count,price,cover_url,artist:artists(id,name)")
    .eq("status", "approved")
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
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    if (data.genre) q = q.eq("genre", normalizeGenre(data.genre) || data.genre);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Global search — hits songs, albums, and artists in parallel.
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
        .eq("status", "approved")
        .ilike("title", like)
        .order("play_count", { ascending: false })
        .limit(limit * 3),
      supabase
        .from("albums")
        .select("id,title,cover_url,price,release_date,artist:artists(id,name)")
        .eq("status", "approved")
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

/**
 * What an album costs, and how long it runs.
 *
 * The album row's own `price` is optional, so an artist who uploaded a release
 * without setting one produced a K0 "free" album tile that led nowhere — the
 * shelf quoted a price the checkout could not honour. An explicit album price
 * always wins (artists legitimately discount a bundle); otherwise the tracks
 * are summed, so the number on the tile is the number they will pay.
 */
export function summariseAlbum(a: {
  price?: number | string | null;
  songs?: { price?: number | string | null; duration?: number | null }[] | null;
}): { track_count: number; total_duration: number; effective_price: number } {
  const tracks = a.songs ?? [];
  const explicit = Number(a.price ?? 0) > 0;
  return {
    track_count: tracks.length,
    total_duration: tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0),
    effective_price: explicit
      ? Number(a.price)
      : tracks.reduce((s, t) => s + Number(t.price ?? 0), 0),
  };
}

export const listAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  // Only albums with at least one APPROVED track: `!inner` on the songs, so an
  // album whose tracks are all still in review cannot appear as an empty shell.
  const { data, error } = await supabase
    .from("albums")
    .select(
      "id,title,cover_url,price,release_date,genre,artist:artists(id,name)," +
        "songs!inner(id,price,status,duration)",
    )
    .eq("status", "approved")
    .eq("songs.status", "approved")
    .order("release_date", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  // The generated Database types predate this nested select, so the relation is
  // untyped here. Shape it once rather than casting at every call site.
  type AlbumRow = {
    id: string;
    title: string;
    cover_url: string | null;
    price?: number | string | null;
    release_date?: string | null;
    genre?: string | null;
    artist?: { id: string; name: string } | null;
    songs?: { id: string; price?: number | string | null; duration?: number | null }[] | null;
  };

  return ((data ?? []) as unknown as AlbumRow[]).map((a) => ({ ...a, ...summariseAlbum(a) }));
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
      supabase.from("artists").select("*").eq("id", data.id).eq("status", "approved").maybeSingle(),
      supabase
        .from("albums")
        .select("id,title,cover_url,release_date,price")
        .eq("artist_id", data.id)
        .eq("status", "approved")
        .order("release_date", { ascending: false }),
      supabase
        .from("songs")
        .select("id,title,duration,price,cover_url,play_count,album_id")
        .eq("artist_id", data.id)
        .eq("status", "approved")
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
        // user_id is the owner check for the album editor — without it the
        // editor's "is this my album?" test can never be true.
        .select("*, artist:artists(id,name,avatar_url,user_id)")
        .eq("id", data.id)
        .eq("status", "approved")
        .maybeSingle(),
      supabase
        .from("songs")
        .select("id,title,duration,price,explicit,track_number")
        .eq("album_id", data.id)
        .eq("status", "approved")
        .order("track_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);
    if (album.error) throw new Error(album.error.message);
    return { album: album.data, songs: songs.data ?? [] };
  });

/**
 * Album + tracks for the EDITOR, owner-only and status-agnostic.
 *
 * The public getAlbumWithSongs filters status='approved', so a draft (the
 * state an album is in exactly when it needs editing) 404s. This variant is
 * the authenticated owner's view: any status, and a hard 403 for anyone else
 * so the editor can never render for a non-owner.
 */
export const getAlbumWithSongsForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase: userClient, userId } = context;
    const { data: album, error: albumErr } = await userClient
      .from("albums")
      .select("*, artist:artists(id,name,avatar_url,user_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (albumErr) throw new Error(albumErr.message);
    if (!album) return { album: null, songs: [], forbidden: false };

    // Ownership lives on the album row (creator) or its artist profile
    // (user_id). Either counts as owner.
    const artistOwner = (album as { artist?: { user_id?: string | null } | null }).artist?.user_id;
    const albumOwner = (album as { user_id?: string | null }).user_id;
    const isOwner = artistOwner === userId || albumOwner === userId;
    if (!isOwner) return { album: null, songs: [], forbidden: true };

    // Songs via the public client: RLS hides drafts from a public read, so
    // the owner must read them with their own client to see every track.
    const { data: songs, error: songsErr } = await userClient
      .from("songs")
      .select("id,title,duration,price,explicit,track_number,status,album_id")
      .eq("album_id", data.id)
      .order("track_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (songsErr) throw new Error(songsErr.message);
    return { album, songs: songs ?? [], forbidden: false };
  });

export const getSongById = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: song, error } = await supabase
      .from("songs")
      .select(
        "id,title,duration,price,cover_url,genre,explicit,play_count,created_at,album_id,artist:artists(id,name)",
      )
      .eq("id", data.id)
      .eq("status", "approved")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return song;
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
        .eq("status", "approved")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("albums")
      .select("id,title,price,cover_url,artist:artists(id,name)")
      .eq("id", data.id)
      .eq("status", "approved")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Payment Methods ----------

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

// ---------- Rich home / browse discovery ----------

export const getTopArtists = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("artists")
    .select("id,name,genre,avatar_url,verified,monthly_listeners")
    .eq("status", "approved")
    .order("monthly_listeners", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getRecentAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("albums")
    .select("id,title,cover_url,price,release_date,genre,artist:artists(id,name)")
    .eq("status", "approved")
    .order("release_date", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getPublicPlaylists = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("playlists")
    .select("id,name,description,cover_url,created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
});

/**
 * Distinct non-null genres pulled from songs. Used to render browse category
 * chips + mood mixes.
 */
export const getGenres = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("songs")
    .select("genre")
    .eq("status", "approved")
    .not("genre", "is", null)
    .limit(500);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const g = normalizeGenre((row as { genre: string | null }).genre);
    if (!g) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([genre, count]) => ({ genre, count }));
});

/**
 * Cover-heavy shelf of songs filtered by a single genre.
 */
export const getSongsByGenre = createServerFn({ method: "GET" })
  .validator((d: { genre: string; limit?: number }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const genre = normalizeGenre(data.genre) || data.genre;
    const { data: rows, error } = await supabase
      .from("songs")
      .select("id,title,duration,price,cover_url,play_count,artist:artists(id,name)")
      .eq("genre", genre)
      .eq("status", "approved")
      .order("play_count", { ascending: false })
      .limit(data.limit ?? 12);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Get top 10 songs for each of the top genres (genre shelves).
 * Returns an array of { genre, songs } where songs are the top 10 by play_count.
 */
export const getTopSongsByGenres = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();

  // Get all genres and their counts (approved tracks only so chips never
  // point at empty shelves)
  const { data: genreRows, error: genreError } = await supabase
    .from("songs")
    .select("genre")
    .eq("status", "approved")
    .not("genre", "is", null)
    .limit(500);

  if (genreError) throw new Error(genreError.message);

  const counts = new Map<string, number>();
  for (const row of genreRows ?? []) {
    const g = normalizeGenre((row as { genre: string | null }).genre);
    if (!g) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  // Get top 8 genres by count
  const topGenres = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre]) => genre);

  // Get top 10 songs for each genre
  const genreSongs = await Promise.all(
    topGenres.map(async (genre) => {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,duration,price,cover_url,play_count,artist:artists(id,name)")
        .eq("genre", genre)
        .eq("status", "approved")
        .order("play_count", { ascending: false })
        .limit(10);

      if (error) throw new Error(error.message);
      return { genre, songs: data ?? [] };
    }),
  );

  return genreSongs;
});

/**
 * Everything the desktop home needs in ONE call: hero, new, trending, top artists,
 * recent albums, editorial playlists, and up to 3 mood shelves keyed by top genres.
 */
export const getHomeDiscover = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getPublicSupabase();
  const [featured, newest, trending, artists, albums, playlists, genreRows] = await Promise.all([
    supabase
      .from("albums")
      .select("id,title,cover_url,price,release_date,artist:artists(id,name)")
      .eq("featured", true)
      .eq("status", "approved")
      .order("release_date", { ascending: false })
      .limit(6),
    supabase
      .from("songs")
      .select("id,title,duration,price,cover_url,artist:artists(id,name)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("songs")
      .select("id,title,play_count,price,cover_url,duration,artist:artists(id,name)")
      .eq("status", "approved")
      .order("play_count", { ascending: false })
      .limit(10),
    supabase
      .from("artists")
      .select("id,name,genre,avatar_url,verified,monthly_listeners")
      .eq("status", "approved")
      .order("monthly_listeners", { ascending: false })
      .limit(10),
    supabase
      .from("albums")
      .select("id,title,cover_url,release_date,artist:artists(id,name)")
      .eq("status", "approved")
      .order("release_date", { ascending: false })
      .limit(12),
    supabase
      .from("playlists")
      .select("id,name,description,cover_url")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("songs").select("genre").not("genre", "is", null).limit(300),
  ]);

  const counts = new Map<string, number>();
  for (const row of genreRows.data ?? []) {
    const g = normalizeGenre((row as { genre: string | null }).genre);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const topGenres = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre]) => genre);

  const moods = await Promise.all(
    topGenres.map(async (genre) => {
      const { data } = await supabase
        .from("songs")
        .select("id,title,cover_url,duration,price,album_id,artist:artists(id,name)")
        .eq("genre", genre)
        .eq("status", "approved")
        .order("play_count", { ascending: false })
        .limit(8);
      return { genre, songs: data ?? [] };
    }),
  );

  return {
    featured: featured.data ?? [],
    newReleases: newest.data ?? [],
    trending: trending.data ?? [],
    topArtists: artists.data ?? [],
    recentAlbums: albums.data ?? [],
    editorialPlaylists: playlists.data ?? [],
    moods,
    genres: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g),
  };
});

/**
 * Personalized "For You" data for the signed-in listener.
 * Signals: saved_tracks → favorite artists + genres.
 * Returns forYou (mixed picks from favorite genres), byFavoriteArtists
 * (more from artists they've liked), and topArtists (their most-liked artists).
 */
export const getForYou = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const savedRes = await supabase
      .from("saved_tracks")
      .select("song_id")
      .eq("user_id", userId)
      .limit(200);

    const songIds = Array.from(
      new Set([...(savedRes.data ?? []).map((r: any) => r.song_id as string)]),
    );

    if (songIds.length === 0) {
      return { forYou: [], byFavoriteArtists: [], favoriteArtists: [] };
    }

    const { data: seedSongs } = await supabase
      .from("songs")
      .select("id,genre,artist_id,artist:artists(id,name,avatar_url)")
      .in("id", songIds);

    const genreCounts = new Map<string, number>();
    const artistCounts = new Map<string, { count: number; artist: any }>();
    for (const row of seedSongs ?? []) {
      const g = normalizeGenre((row as any).genre as string | null);
      if (g) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      const aid = (row as any).artist_id as string | null;
      const a = (row as any).artist;
      if (aid && a) {
        const cur = artistCounts.get(aid);
        artistCounts.set(aid, { count: (cur?.count ?? 0) + 1, artist: a });
      }
    }

    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
    const topArtistIds = [...artistCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([id]) => id);

    const [forYouRes, byArtistRes] = await Promise.all([
      topGenres.length > 0
        ? supabase
            .from("songs")
            .select("id,title,cover_url,duration,price,artist:artists(id,name)")
            .in("genre", topGenres)
            .eq("status", "approved")
            .not("id", "in", `(${songIds.join(",")})`)
            .order("play_count", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as any[] }),
      topArtistIds.length > 0
        ? supabase
            .from("songs")
            .select("id,title,cover_url,duration,price,artist:artists(id,name)")
            .in("artist_id", topArtistIds)
            .eq("status", "approved")
            .not("id", "in", `(${songIds.join(",")})`)
            .order("created_at", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    return {
      forYou: forYouRes.data ?? [],
      byFavoriteArtists: byArtistRes.data ?? [],
      favoriteArtists: [...artistCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([id, v]) => ({ id, ...v.artist })),
    };
  });

export const getSongArtists = createServerFn({ method: "GET" })
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: song } = await supabase
      .from("songs")
      .select("artist_id, album_id")
      .eq("id", data.song_id)
      .single();
    if (!song) throw new Error("Song not found");

    const { data: mainArtist } = await supabase
      .from("artists")
      .select("id, name")
      .eq("id", song.artist_id)
      .single();

    const { data: collaborators } = await supabase
      .from("song_collaborators")
      .select("artist:artists(id, name), role")
      .eq("song_id", data.song_id);

    const artists = [mainArtist].filter(Boolean);
    if (collaborators) {
      collaborators.forEach((c: any) => {
        if (c.artist && !artists.find((a: any) => a.id === c.artist.id)) {
          artists.push(c.artist);
        }
      });
    }

    return artists;
  });
