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
      const result = await context.supabase.from("profiles").insert(patch as any);
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

    // A listener CANNOT publish a public playlist: the RLS policy
    // "Users can manage own playlists" (migration 20260903) allows
    // is_public = true only when private.is_staff(auth.uid()). Ticking the
    // "Public" box therefore failed the whole INSERT with a raw row-level
    // security error — the playlist was never created and the user saw
    // database text. Detect it here and create a private list instead, telling
    // the caller what happened so the UI can say so.
    const staff = await isStaffUser(context.supabase, context.userId);
    const wantsPublic = data.make_public === true;
    const isPublic = wantsPublic && staff;

    const { data: row, error } = await context.supabase
      .from("playlists")
      .insert({
        user_id: context.userId,
        name,
        description,
        is_public: isPublic,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return {
      ok: true,
      id: row!.id,
      is_public: isPublic,
      // The caller uses this to explain "made private" instead of silently
      // ignoring what the user asked for.
      publish_requested_but_denied: wantsPublic && !staff,
    };
  });

export const deletePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: deleted, error } = await context.supabase
      .from("playlists")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id");
    if (error) throw new Error(error.message);
    // Report no-ops instead of a false success (e.g. already deleted,
    // or another user's playlist).
    if (!deleted || deleted.length === 0) throw new Error("Playlist not found");
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

    // Count what was actually removed. Returning ok:true unconditionally meant a
    // second tap on an already-removed track toasted "Removed from playlist"
    // again, telling the user something happened when nothing did.
    const { data: deleted, error } = await context.supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", data.song_id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      return { ok: true, removed: false };
    }
    return { ok: true, removed: true };
  });

async function requirePlaylistOwner(supabase: any, userId: string, playlistId: string) {
  const { data: pl } = await supabase
    .from("playlists")
    .select("user_id")
    .eq("id", playlistId)
    .maybeSingle();
  if (!pl) throw new Error("Playlist not found");
  const staff = await isStaffUser(supabase, userId);
  if ((pl as any).user_id !== userId && !staff) {
    throw new Error("You can only edit your own playlists");
  }
  return pl as { user_id: string };
}

export const updatePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { id: string; name?: string; description?: string | null; is_public?: boolean }) => d,
  )
  .handler(async ({ context, data }) => {
    await requirePlaylistOwner(context.supabase, context.userId, data.id);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new Error("Playlist name is required");
      if (name.length > 120) throw new Error("Playlist name must be at most 120 characters");
      patch.name = name;
    }
    if (data.description !== undefined) {
      const description = (data.description ?? "").trim() || null;
      if (description && description.length > 1_000) {
        throw new Error("Playlist description must be at most 1,000 characters");
      }
      patch.description = description;
    }
    // Same rule createPlaylist applies, and for the same reason. The RLS policy
    // "Users can manage own playlists" allows is_public = true only when
    // private.is_staff(auth.uid()). Without this downgrade, ticking "Public" put
    // is_public = true in the patch, Postgres rejected the whole UPDATE with a
    // row-level security error, and because name/description ride in the same
    // patch the listener lost the name and description they had just edited in
    // that same dialog. They had to untick the box and save a second time.
    let publishRequestedButDenied = false;
    if (data.is_public !== undefined) {
      const staff = await isStaffUser(context.supabase, context.userId);
      publishRequestedButDenied = !!data.is_public && !staff;
      patch.is_public = !!data.is_public && staff;
    }
    if (Object.keys(patch).length === 0) return { ok: true, publish_requested_but_denied: false };
    const { error } = await context.supabase
      .from("playlists")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, publish_requested_but_denied: publishRequestedButDenied };
  });

export const movePlaylistSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; song_id: string; direction: "up" | "down" }) => d)
  .handler(async ({ context, data }) => {
    await requirePlaylistOwner(context.supabase, context.userId, data.playlist_id);
    const { data: rows } = await context.supabase
      .from("playlist_songs")
      .select("song_id, position")
      .eq("playlist_id", data.playlist_id)
      .order("position", { ascending: true });
    const list = (rows ?? []) as { song_id: string; position: number }[];
    const idx = list.findIndex((r) => r.song_id === data.song_id);
    if (idx === -1) throw new Error("Song is not in this playlist");
    const swapWith = data.direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= list.length) return { ok: true, moved: false };

    const a = list[idx];
    const b = list[swapWith];

    // Two writes, swapping the positions directly.
    //
    // This used to write position = -1 to `a` first, to dodge a transient
    // unique violation. There is no unique index on (playlist_id, position), so
    // the sentinel guarded nothing — and if the second write failed, `a` was
    // left sitting at -1, which sorts FIRST in every ORDER BY position. One
    // failed network call permanently moved a track to the top of the playlist.
    //
    // If the two rows somehow already share a position (legacy data), swapping
    // would be a no-op, so fall back to writing their ordinals, which are
    // always distinct.
    const [aNext, bNext] = a.position === b.position ? [swapWith, idx] : [b.position, a.position];

    const { error: e2 } = await context.supabase
      .from("playlist_songs")
      .update({ position: aNext } as any)
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", a.song_id);
    if (e2) throw new Error(e2.message);

    const { error: e3 } = await context.supabase
      .from("playlist_songs")
      .update({ position: bNext } as any)
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", b.song_id);
    if (e3) throw new Error(e3.message);

    return { ok: true, moved: true };
  });

export const togglePlaylistFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: pl } = await context.supabase
      .from("playlists")
      .select("user_id, is_public")
      .eq("id", data.playlist_id)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    if ((pl as any).user_id === context.userId) {
      throw new Error("This playlist is already in your library");
    }
    if (!(pl as any).is_public) {
      throw new Error("Only public playlists can be followed");
    }
    const { data: existing } = await context.supabase
      .from("saved_playlists")
      .select("id")
      .eq("user_id", context.userId)
      .eq("playlist_id", data.playlist_id)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("saved_playlists")
        .delete()
        .eq("user_id", context.userId)
        .eq("playlist_id", data.playlist_id);
      if (error) throw new Error(error.message);
      return { ok: true, following: false };
    }
    const { error } = await context.supabase
      .from("saved_playlists")
      .insert({ user_id: context.userId, playlist_id: data.playlist_id } as any);
    if (error) throw new Error(error.message);
    return { ok: true, following: true };
  });

export const listFollowedPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Include each list's songs (id/title/cover only) so library cards can
    // count tracks, render mosaic covers, and play without extra roundtrips.
    const { data, error } = await context.supabase
      .from("saved_playlists")
      .select(
        "playlist_id, created_at, playlists(id,name,description,cover_url,is_public,user_id,playlist_songs(position,song:songs(id,title,duration,price,cover_url,artist:artists(id,name))))",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => r.playlists).filter(Boolean);
  });

export const getPlaylistFollowerCount = createServerFn({ method: "GET" })
  .validator((d: { playlist_id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { count } = await supabase
      .from("saved_playlists")
      .select("id", { count: "exact", head: true })
      .eq("playlist_id", data.playlist_id);
    return { count: count ?? 0 };
  });

export const isFollowingPlaylist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("saved_playlists")
      .select("id")
      .eq("user_id", context.userId)
      .eq("playlist_id", data.playlist_id)
      .maybeSingle();
    return { following: !!row };
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

    // 3. Fetch songs.
    //
    // Filtered to approved. It selected `status` but never used it, so a
    // playlist rendered tracks that are pending review or have been taken down
    // for a T&C breach — full artwork, duration and price — and pressing play
    // then failed inside the signed-URL check, because that path does enforce
    // status. The listener saw a track they were told they could play and it
    // would not play.
    const { data: songRows, error: sError } = await supabase
      .from("songs")
      .select("id,title,duration,price,cover_url,artist_id,status,audio_url")
      .in("id", songIds)
      .eq("status", "approved");

    if (sError) throw new Error(sError.message);

    // 4. Fetch artists for these songs
    const artistIds = [...new Set((songRows ?? []).map((s: any) => s.artist_id).filter(Boolean))];
    const { data: artists } =
      artistIds.length > 0
        ? await supabase.from("artists").select("id,name").in("id", artistIds)
        : { data: [] };

    const artistMap = new Map((artists ?? []).map((a: any) => [a.id, a]));

    const songsById = new Map(
      (songRows ?? []).map((s: any) => [
        s.id,
        {
          ...s,
          artist: s.artist_id ? (artistMap.get(s.artist_id) ?? null) : null,
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
              // An album purchase writes a receipt row AND one row per track,
              // all carrying album_id. maybeSingle() without limit(1) throws on
              // that second row, which would fail playback for everyone who
              // bought an album. This is an existence check, so one row is enough.
              .limit(1)
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
              // Same reason as the playback check: one row per track plus a
              // receipt all match this album, so cap it at one.
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!songPurchase && !albumPurchase)
        throw new Error("Purchase required before downloading this song");
    }

    const rawPath = String(song.audio_url ?? "");
    if (!rawPath || rawPath === "null") throw new Error("Song audio file not found");
    const extension = rawPath.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1]?.toLowerCase() ?? "mp3";
    const safeTitle =
      String(song.title ?? "song")
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
    // Preview links live ~5 minutes: long enough for slow networks to
    // resolve + buffer + play the 15s cap, short enough to stay a sample.
    // (A shorter window just breaks slow clients — anyone can already fetch
    // the whole file inside ANY window, so sub-minute expiries buy nothing.)
    const signed = { signedUrl: await signMediaUrl("song-audio", rawPath, { expiresIn: 300 }) };
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
