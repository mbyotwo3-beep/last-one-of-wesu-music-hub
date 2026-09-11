import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { isStaffUser, isSuperadminUser } from "./roles";

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { full_name?: string; bio?: string; avatar_url?: string; location?: string }) => d)
  .handler(async ({ context, data }) => {
    const patch: any = { user_id: context.userId };
    for (const k of ["full_name", "bio", "avatar_url", "location"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    
    // Check if profile exists
    const { data: existing } = await context.supabase
      .from("profiles")
      .select("id, avatar_url")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Clean up old avatar image from storage if replaced
    if (existing?.avatar_url && data.avatar_url && data.avatar_url !== existing.avatar_url) {
      try {
        const { deleteStoredMedia } = await import("./media.server");
        await deleteStoredMedia("user-avatars", existing.avatar_url);
      } catch (err) {
        console.warn("[Profile Update] Could not delete old avatar photo:", err);
      }
    }
    
    let error;
    if (existing) {
      // Update existing profile
      const result = await context.supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", context.userId);
      error = result.error;
    } else {
      // Insert new profile
      const result = await context.supabase
        .from("profiles")
        .insert(patch as any);
      error = result.error;
    }
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string; description?: string; make_public?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const name = data.name?.trim();
    if (!name) throw new Error("Playlist name is required");
    if (name.length > 120) throw new Error("Playlist name must be at most 120 characters");
    const description = data.description?.trim() || null;
    if (description && description.length > 1_000) {
      throw new Error("Playlist description must be at most 1,000 characters");
    }
    const isStaff = await isStaffUser(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("playlists")
      .insert({
        user_id: context.userId,
        name,
        description,
        // Listener and artist playlists are private. Only platform staff can
        // intentionally publish an editorial playlist to Browse.
        is_public: isStaff && data.make_public === true,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row!.id };
  });

export const deletePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("playlists")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addToPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; song_id: string }) => d)
  .handler(async ({ context, data }) => {
    // Check if user is owner of the playlist or staff
    const { data: pl } = await context.supabase
      .from("playlists")
      .select("user_id")
      .eq("id", data.playlist_id)
      .maybeSingle();

    if (!pl) throw new Error("Playlist not found");
    const isStaff = await isStaffUser(context.supabase, context.userId);
    if (pl.user_id !== context.userId && !isStaff) {
      throw new Error("You can only add songs to your own playlists");
    }

    // Check if song is already in playlist
    const { data: existing } = await context.supabase
      .from("playlist_songs")
      .select("id")
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", data.song_id)
      .maybeSingle();
    
    if (existing) {
      return { ok: true, alreadyInPlaylist: true };
    }
    
    // Get the current max position for this playlist
    const { data: maxPos } = await context.supabase
      .from("playlist_songs")
      .select("position")
      .eq("playlist_id", data.playlist_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const nextPosition = (maxPos?.position ?? -1) + 1;
    
    const { error } = await context.supabase.from("playlist_songs").insert({
      playlist_id: data.playlist_id,
      song_id: data.song_id,
      position: nextPosition,
    } as any);
    
    if (error) throw new Error(error.message);
    return { ok: true, alreadyInPlaylist: false };
  });

export const removeFromPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; song_id: string }) => d)
  .handler(async ({ context, data }) => {
    // Check if user is owner of the playlist or staff
    const { data: pl } = await context.supabase
      .from("playlists")
      .select("user_id")
      .eq("id", data.playlist_id)
      .maybeSingle();

    if (!pl) throw new Error("Playlist not found");
    const isStaff = await isStaffUser(context.supabase, context.userId);
    if (pl.user_id !== context.userId && !isStaff) {
      throw new Error("You can only remove songs from your own playlists");
    }

    const { error } = await context.supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", data.song_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPlaylistWithSongs = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    // Dynamically load supabaseAdmin if available to allow link-shared playlists to be viewed by friends
    let supabase: any;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        supabase = supabaseAdmin;
      } catch {
        supabase = getPublicSupabase();
      }
    } else {
      supabase = getPublicSupabase();
    }

    // 1. Fetch playlist
    const { data: playlist, error: plError } = await supabase
      .from("playlists")
      .select("id,user_id,name,description,cover_url,is_public,created_at")
      .eq("id", data.id)
      .maybeSingle();

    if (plError) throw new Error(plError.message);
    if (!playlist) return null;

    // 2. Fetch playlist_songs
    const { data: psRows, error: psError } = await supabase
      .from("playlist_songs")
      .select("song_id, position")
      .eq("playlist_id", data.id)
      .order("position", { ascending: true });

    if (psError) throw new Error(psError.message);

    const songIds = (psRows ?? []).map((r: any) => r.song_id).filter(Boolean);
    if (songIds.length === 0) {
      return { playlist, songs: [] };
    }

    // 3. Fetch songs
    const { data: songRows, error: sError } = await supabase
      .from("songs")
      .select("id,title,duration,price,cover_url,artist_id,status,audio_url")
      .in("id", songIds);

    if (sError) throw new Error(sError.message);

    // 4. Fetch artists for these songs
    const artistIds = [...new Set((songRows ?? []).map((s: any) => s.artist_id).filter(Boolean))];
    const { data: artists } = artistIds.length > 0
      ? await supabase.from("artists").select("id,name").in("id", artistIds)
      : { data: [] };

    const artistMap = new Map((artists ?? []).map((a: any) => [a.id, a]));

    const songsById = new Map(
      (songRows ?? []).map((s: any) => [
        s.id,
        {
          ...s,
          artist: s.artist_id ? artistMap.get(s.artist_id) ?? null : null,
        },
      ]),
    );

    // Preserve playlist position order
    const orderedSongs = songIds.map((id: string) => songsById.get(id)).filter(Boolean);

    return { playlist, songs: orderedSongs };
  });

export const getSignedAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: song } = await context.supabase
      .from("songs")
      .select("audio_url, price, album_id, artist_id")
      .eq("id", data.song_id)
      .single();
    if (!song) throw new Error("Song not found");

    // Staff bypass (admin and superadmin) — full playback for QA and moderation
    const isStaff = await isStaffUser(context.supabase, context.userId);

    // Check if the caller is the artist who uploaded this song
    let isOwnerArtist = false;
    if (!isStaff && (song as any).artist_id) {
      const { data: artist } = await context.supabase
        .from("artists")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (artist && (artist as any).id === (song as any).artist_id) {
        isOwnerArtist = true;
      }
    }

    // Free if priced 0, purchased individually, purchased with its album,
    // accessed by staff, or accessed by the song's artist owner.
    if (!isStaff && !isOwnerArtist && (song as any).price && Number((song as any).price) > 0) {
      const albumId = (song as any).album_id as string | null;
      const [{ data: songPurchase }, { data: albumPurchase }] = await Promise.all([
        context.supabase
          .from("purchases")
          .select("id")
          .eq("user_id", context.userId)
          .eq("song_id", data.song_id)
          .eq("status", "completed")
          .maybeSingle(),
        albumId
          ? context.supabase
              .from("purchases")
              .select("id")
              .eq("user_id", context.userId)
              .eq("album_id", albumId)
              .eq("status", "completed")
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!songPurchase && !albumPurchase) return { url: "", requiresPurchase: true as const };
    }

    const rawPath = String((song as any).audio_url ?? "");
    // Legacy rows may already contain a full https URL.
    if (/^https?:\/\//i.test(rawPath)) {
      return { url: rawPath };
    }

    // Validate that audio_url is not empty
    if (!rawPath || rawPath === "" || rawPath === "null") {
      throw new Error("Song audio file not found. Please contact support.");
    }

    // Entitlement was verified above; mint a short-lived signed read URL.
    const { signMediaUrl } = await import("./media.server");
    return { url: await signMediaUrl("song-audio", rawPath, { expiresIn: 3600 }) };
  });

/**
 * Create a short-lived download URL for an entitled song.
 * Paid audio is never made public: ownership is checked against completed
 * song/album purchases before Storage signs the private object.
 */
export const getDownloadAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: song, error: songError } = await context.supabase
      .from("songs")
      .select("id,title,audio_url,price,album_id,status,artist_id")
      .eq("id", data.song_id)
      .maybeSingle();
    if (songError) throw new Error(songError.message);
    if (!song || song.status !== "approved") throw new Error("Song is not available for download");

    const isStaff = await isStaffUser(context.supabase, context.userId);
    let isOwnerArtist = false;
    if (!isStaff && (song as any).artist_id) {
      const { data: artist } = await context.supabase
        .from("artists")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (artist && (artist as any).id === (song as any).artist_id) {
        isOwnerArtist = true;
      }
    }

    if (!isStaff && !isOwnerArtist && Number(song.price ?? 0) > 0) {
      const [{ data: songPurchase }, { data: albumPurchase }] = await Promise.all([
        context.supabase
          .from("purchases")
          .select("id")
          .eq("user_id", context.userId)
          .eq("song_id", song.id)
          .eq("status", "completed")
          .maybeSingle(),
        song.album_id
          ? context.supabase
              .from("purchases")
              .select("id")
              .eq("user_id", context.userId)
              .eq("album_id", song.album_id)
              .eq("status", "completed")
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!songPurchase && !albumPurchase) throw new Error("Purchase required before downloading this song");
    }

    const rawPath = String(song.audio_url ?? "");
    if (!rawPath || rawPath === "null") throw new Error("Song audio file not found");
    const extension = rawPath.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1]?.toLowerCase() ?? "mp3";
    const safeTitle = String(song.title ?? "song")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "song";
    const filename = `${safeTitle}.${extension}`;

    if (/^https?:\/\//i.test(rawPath)) {
      const url = new URL(rawPath);
      url.searchParams.set("download", filename);
      return { url: url.toString(), filename };
    }

    const { signMediaUrl } = await import("./media.server");
    const url = await signMediaUrl("song-audio", rawPath, { expiresIn: 3600, download: filename });
    return { url, filename };
  });

/**
 * Get a signed audio URL for a free song without requiring authentication.
 * If the song has a price > 0, throws an error — use getSignedAudioUrl instead.
 * Anonymous listeners hear the song with ads (enforced client-side).
 */
export const getPublicAudioUrl = createServerFn({ method: "POST" })
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: song } = await supabase
      .from("songs")
      .select("audio_url, price")
      .eq("id", data.song_id)
      .eq("status", "approved")
      .single();
    if (!song) throw new Error("Song not found");
    if ((song as any).price && Number((song as any).price) > 0) {
      throw new Error("This song requires a purchase");
    }
    const rawPath = String((song as any).audio_url ?? "");
    if (/^https?:\/\//i.test(rawPath)) {
      return { url: rawPath };
    }

    // Validate that audio_url is not empty
    if (!rawPath || rawPath === "" || rawPath === "null") {
      throw new Error("Song audio file not found. Please contact support.");
    }

    const { signMediaUrl } = await import("./media.server");
    return { url: await signMediaUrl("song-audio", rawPath, { expiresIn: 3600 }) };
  });

/**
 * Get a signed audio URL for a short 15-second preview (client-capped).
 *
 * Previews are intentionally public for ALL approved tracks (free and paid)
 * so anonymous listeners can sample songs before buying. The
 * server returns a short-lived (45s) signed URL and the client stops
 * playback at 15s. A determined user could theoretically grab more of the
 * file within the 45s window — this is an accepted trade-off to keep the
 * "sample before buy" funnel frictionless.
 *
 * Full-length playback still requires entitlement — see getSignedAudioUrl.
 */
export const getPreviewAudioUrl = createServerFn({ method: "POST" })
  .validator((d: { song_id: string; access_token?: string | null }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: song } = await supabase
      .from("songs")
      .select("audio_url, id")
      .eq("id", data.song_id)
      .eq("status", "approved")
      .single();
    if (!song) throw new Error("Song not found");

    const rawPath = String((song as any).audio_url ?? "");
    if (/^https?:\/\//i.test(rawPath)) {
      return { url: rawPath };
    }

    // Validate that audio_url is not empty
    if (!rawPath || rawPath === "" || rawPath === "null") {
      throw new Error("Song audio file not found. Please contact support.");
    }

    const { signMediaUrl } = await import("./media.server");
    // Preview links are deliberately short-lived (45s) so an unauthenticated
    // sampler cannot reuse the URL to download the full paid track.
    const signed = { signedUrl: await signMediaUrl("song-audio", rawPath, { expiresIn: 45 }) };
    return { url: signed.signedUrl };
  });

/**
 * Increment the play_count for a song. Called when playback completes.
 * Requires auth to prevent anonymous abuse.
 */
export const incrementPlayCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("increment_play_count" as any, { _song_id: data.song_id });
    return { ok: true };
  });
