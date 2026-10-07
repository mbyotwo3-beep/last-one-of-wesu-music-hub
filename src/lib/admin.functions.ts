import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";

async function assertStaff(supabase: any, userId: string) {
  if (!(await isStaffUser(supabase, userId))) throw new Error("Forbidden");
}

async function audit(
  actorId: string,
  action: string,
  target_type?: string,
  target_id?: string,
  meta: any = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("audit_log")
    .insert({ actor_id: actorId, action, target_type, target_id, meta });
}

// Back-compat: admin functions previously used assertAdmin checking 'admin'. Now allow staff (admin OR superadmin).
async function assertAdmin(supabase: any, userId: string) {
  await assertStaff(supabase, userId);
}

export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [users, songs, purchases, revenue, artists] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("songs").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin
        .from("payment_transactions")
        .select("amount")
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin
        .from("artists")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
    ]);

    const monthlyRevenue = (revenue.data ?? []).reduce(
      (s, r: { amount: number }) => s + Number(r.amount ?? 0),
      0,
    );

    return {
      totalUsers: users.count ?? 0,
      totalSongs: songs.count ?? 0,
      completedPurchases30d: purchases.count ?? 0,
      monthlyRevenueZmw: monthlyRevenue,
      totalArtists: artists.count ?? 0,
    };
  });

export const getRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [songs, tx] = await Promise.all([
      supabaseAdmin
        .from("songs")
        .select("id,title,created_at,artist:artists(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("payment_transactions")
        .select("id,amount,method_code,status,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    return {
      recentSongs: songs.data ?? [],
      recentTransactions: tx.data ?? [],
    };
  });

// ---------- Moderation & Song Management ----------

export const listPendingSongs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("songs")
      .select(
        "id,title,created_at,status,price,genre,play_count,duration,cover_url,audio_url,artist:artists(id,name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const listAllSongsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d?: { status?: string; search?: string }) => d || {})
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("songs")
      .select(
        "id,title,created_at,status,price,genre,play_count,duration,cover_url,audio_url,artist:artists(id,name)",
      )
      .order("created_at", { ascending: false });

    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    if (data?.search && data.search.trim()) {
      query = query.ilike("title", `%${data.search.trim()}%`);
    }

    const { data: songs, error } = await query.limit(200);
    if (error) throw new Error(error.message);
    return songs ?? [];
  });

/**
 * Every album that is NOT approved, whatever state it is in.
 *
 * This used to filter status = 'pending', which was the single reason a
 * finished release could be invisible forever: an artist uploads, the songs
 * get approved individually, but the album row is still 'draft' — a state the
 * old query excluded, so the admin queue never showed it and there was no way
 * to approve it. Public album pages filter status='approved', so those tracks
 * existed, played, and showed a price, but no listener could ever open or buy
 * the album. Twelve paid tracks were sitting in exactly that state.
 *
 * Also returns per-album track counts so the queue can say "12 tracks, 12
 * approved" instead of making a moderator open each one.
 */
export const listPendingAlbums = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: albums } = await supabaseAdmin
      .from("albums")
      .select("id,title,created_at,status,price,genre,cover_url,artist:artists(id,name)")
      // Anything not live yet. 'draft' included deliberately — see the note.
      .neq("status", "approved")
      .order("created_at", { ascending: false });

    const rows = albums ?? [];
    if (!rows.length) return [];

    const { data: tracks } = await supabaseAdmin
      .from("songs")
      .select("id,album_id,status")
      .in(
        "album_id",
        rows.map((a) => a.id),
      );

    const counts = new Map<string, { total: number; approved: number; pending: number }>();
    for (const r of rows) counts.set(r.id, { total: 0, approved: 0, pending: 0 });
    for (const t of tracks ?? []) {
      const c = counts.get(t.album_id as string);
      if (!c) continue;
      c.total++;
      if (t.status === "approved") c.approved++;
      if (t.status === "pending") c.pending++;
    }

    return rows.map((a) => ({
      ...a,
      track_total: counts.get(a.id)?.total ?? 0,
      track_approved: counts.get(a.id)?.approved ?? 0,
      track_pending: counts.get(a.id)?.pending ?? 0,
      // An album whose tracks are all live but which is still not approved is
      // the exact shape of the bug above. Flag it so the queue leads with it.
      stranded: a.status !== "approved" && (counts.get(a.id)?.approved ?? 0) > 0,
    }));
  });

export { deleteSong } from "./artist.functions";

export const moderateAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected" | "taken_down" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("albums")
      .update({ status: data.status } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Approving a release publishes it as one unit, like Spotify — the
    // artist's tracks were submitted with the album and reviewed as it. Only
    // 'pending' tracks move: never touch already-approved ones (that would
    // silently re-publish something taken down) and never touch drafts the
    // artist is still editing.
    let songsApproved = 0;
    if (data.status === "approved") {
      const { error: songErr } = await supabaseAdmin
        .from("songs")
        .update({ status: "approved" } as any)
        .eq("album_id", data.id)
        .eq("status", "pending");
      if (songErr) throw new Error(songErr.message);
      const { count } = await supabaseAdmin
        .from("songs")
        .select("id", { count: "exact", head: true })
        .eq("album_id", data.id)
        .eq("status", "approved");
      songsApproved = count ?? 0;
    }

    await audit(context.userId, `album.${data.status}`, "album", data.id, {
      songs_approved: songsApproved,
    });
    return { ok: true, songsApproved };
  });

/**
 * Approve one track and, when it belongs to an album, keep the album in step.
 *
 * A moderator approving the 12th track of a release previously left the album
 * row unapproved, so the public album page 404'd while every track was live
 * and buyable on its own. Approving the album here means "one action makes the
 * release live", which is what a moderator means by clicking Approve.
 */
export const moderateSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected" | "taken_down" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: song, error: songReadErr } = await supabaseAdmin
      .from("songs")
      .select("id, album_id, title")
      .eq("id", data.id)
      .maybeSingle();
    if (songReadErr) throw new Error(songReadErr.message);
    if (!song) throw new Error("Song not found");

    const { error } = await supabaseAdmin
      .from("songs")
      .update({ status: data.status } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    let albumId: string | null = null;
    if (data.status === "approved" && song.album_id) {
      albumId = song.album_id as string;
      // Only promote the album when nothing on it is still awaiting review —
      // approving a release track-by-track should not publish a half-reviewed
      // album, and must not fight the album-level Approve button.
      const { count: stillPending } = await supabaseAdmin
        .from("songs")
        .select("id", { count: "exact", head: true })
        .eq("album_id", albumId)
        .eq("status", "pending");
      if (!stillPending) {
        await supabaseAdmin
          .from("albums")
          .update({ status: "approved" } as any)
          .eq("id", albumId)
          .neq("status", "approved");
      }
    }

    await audit(context.userId, `song.${data.status}`, "song", data.id, {
      album_auto_approved: !!albumId,
    });
    return { ok: true, albumApproved: !!albumId };
  });

/**
 * Editorial playlist curation (staff only).
 *
 * The platform had no way for staff to CREATE a public playlist, and RLS
 * deliberately stops listeners from doing it (migration 20260903: is_public
 * requires is_staff). Those two facts together mean the public playlist
 * surface could never contain anything: every "Public" tick in the app failed
 * with a row-level security error, and there was no admin route to create one.
 * So playlists showed nothing, permanently.
 *
 * These give staff the missing capability: create a playlist, published and
 * public, then fill it from the approved catalogue.
 */
/**
 * Every album on the platform, with its track count.
 *
 * The moderation queue only surfaced albums awaiting approval, so an admin had
 * no way to remove an album that was ALREADY published and then breached the
 * terms — the exact case that matters. This is that list.
 */
export const listAllAlbumsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d?: { status?: string; search?: string }) => d || {})
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("albums")
      .select("id,title,created_at,status,price,cover_url,release_date,artist:artists(id,name)")
      .order("created_at", { ascending: false });

    if (data?.status && data.status !== "all") query = query.eq("status", data.status);
    if (data?.search?.trim()) {
      // `%` and `_` are wildcards in ilike; a literal title must stay literal.
      const safe = data.search
        .trim()
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      query = query.ilike("title", `%${safe}%`);
    }

    const { data: albums, error } = await query.limit(500);
    if (error) throw new Error(error.message);
    const rows = albums ?? [];
    if (!rows.length) return [];

    const { data: tracks } = await supabaseAdmin
      .from("songs")
      .select("album_id")
      .in("album_id", rows.map((a) => a.id));
    const counts = new Map<string, number>();
    for (const t of tracks ?? []) {
      counts.set(t.album_id as string, (counts.get(t.album_id as string) ?? 0) + 1);
    }

    return rows.map((a) => ({ ...a, track_count: counts.get(a.id) ?? 0 }));
  });

export const listEditorialPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Staff-owned playlists: the public surface is exactly this set, per the
    // "Anyone can read editorial playlists" RLS policy.
    const { data: mine } = await supabaseAdmin
      .from("playlists")
      .select("id,name,description,cover_url,is_public,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    const rows = mine ?? [];
    if (!rows.length) return [];

    const { data: entries } = await supabaseAdmin
      .from("playlist_songs")
      .select("playlist_id,song_id")
      .in(
        "playlist_id",
        rows.map((r) => r.id),
      );

    const byPlaylist = new Map<string, string[]>();
    for (const e of entries ?? []) {
      const list = byPlaylist.get(e.playlist_id as string) ?? [];
      list.push(e.song_id as string);
      byPlaylist.set(e.playlist_id as string, list);
    }

    return rows.map((r) => ({
      ...r,
      song_ids: byPlaylist.get(r.id) ?? [],
      track_count: (byPlaylist.get(r.id) ?? []).length,
    }));
  });

/** Approved songs, for the "add to playlist" picker. Staff only. */
export const listApprovedSongsForCuration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("songs")
      .select("id,title,cover_url,price,genre,artist:artists(id,name)")
      .eq("status", "approved")
      .order("title", { ascending: true })
      .limit(300);
    return data ?? [];
  });

export const createEditorialPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { name: string; description?: string; song_ids?: string[]; publish?: boolean }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const name = data.name?.trim();
    if (!name) throw new Error("Playlist name is required");
    if (name.length > 120) throw new Error("Playlist name must be at most 120 characters");

    const { data: row, error } = await supabaseAdmin
      .from("playlists")
      .insert({
        user_id: context.userId,
        name,
        description: data.description?.trim() || null,
        // Default to published: a staff playlist nobody can see is the exact
        // failure this whole change exists to remove.
        is_public: data.publish !== false,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const songIds = [...new Set((data.song_ids ?? []).filter(Boolean))];
    if (songIds.length) {
      const { error: psErr } = await supabaseAdmin
        .from("playlist_songs")
        .insert(
          songIds.map((song_id, position) => ({ playlist_id: row!.id, song_id, position })) as any,
        );
      if (psErr) throw new Error(psErr.message);
    }

    await audit(context.userId, "playlist.create_editorial", "playlist", row!.id, {
      name,
      tracks: songIds.length,
    });
    return { ok: true, id: row!.id, track_count: songIds.length };
  });

/** Append songs to a staff playlist. Duplicates and blanks are ignored. */
export const addSongsToEditorialPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; song_ids: string[] }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pl } = await supabaseAdmin
      .from("playlists")
      .select("id,user_id")
      .eq("id", data.playlist_id)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    if (pl.user_id !== context.userId) {
      throw new Error("You can only edit playlists you created");
    }

    const { data: existing } = await supabaseAdmin
      .from("playlist_songs")
      .select("song_id")
      .eq("playlist_id", data.playlist_id);
    const have = new Set((existing ?? []).map((r) => r.song_id as string));
    const fresh = [...new Set((data.song_ids ?? []).filter((id) => id && !have.has(id)))];
    if (!fresh.length) return { ok: true, added: 0 };

    const { error } = await supabaseAdmin.from("playlist_songs").insert(
      fresh.map((song_id, i) => ({
        playlist_id: data.playlist_id,
        song_id,
        position: (existing?.length ?? 0) + i,
      })) as any,
    );
    if (error) throw new Error(error.message);
    return { ok: true, added: fresh.length };
  });

export const removeSongFromEditorialPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; song_id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pl } = await supabaseAdmin
      .from("playlists")
      .select("id,user_id")
      .eq("id", data.playlist_id)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    if (pl.user_id !== context.userId) {
      throw new Error("You can only edit playlists you created");
    }

    const { error } = await supabaseAdmin
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", data.song_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPlaylistPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; is_public: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin
      .from("playlists")
      .select("id,user_id")
      .eq("id", data.playlist_id)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    if (pl.user_id !== context.userId) {
      throw new Error("You can only change playlists you created");
    }

    // Publishing an empty playlist shows an empty tile to every visitor.
    if (data.is_public) {
      const { count } = await supabaseAdmin
        .from("playlist_songs")
        .select("song_id", { count: "exact", head: true })
        .eq("playlist_id", data.playlist_id);
      if (!count) throw new Error("Add at least one song before publishing");
    }

    const { error } = await supabaseAdmin
      .from("playlists")
      .update({ is_public: data.is_public } as any)
      .eq("id", data.playlist_id);
    if (error) throw new Error(error.message);
    await audit(
      context.userId,
      data.is_public ? "playlist.publish" : "playlist.unpublish",
      "playlist",
      data.playlist_id,
    );
    return { ok: true };
  });

export const deleteEditorialPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // `name`, not `title`: playlists have no title column.
    const { data: pl } = await supabaseAdmin
      .from("playlists")
      .select("id,user_id,name")
      .eq("id", data.playlist_id)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    if (pl.user_id !== context.userId) {
      throw new Error("You can only delete playlists you created");
    }

    // playlist_songs rows are removed explicitly: relying on ON DELETE CASCADE
    // works only if the FK was declared with it, and a stale join here is what
    // makes an "empty" playlist still look populated.
    await supabaseAdmin.from("playlist_songs").delete().eq("playlist_id", data.playlist_id);
    const { error } = await supabaseAdmin.from("playlists").delete().eq("id", data.playlist_id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "playlist.delete", "playlist", data.playlist_id, {
      name: pl.name,
    });
    return { ok: true };
  });

export const listPendingArtists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("artists")
      .select("id,name,bio,genre,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const listAllArtists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d?: { status?: string; search?: string }) => d || {})
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("artists")
      .select("id,name,bio,genre,status,verified,created_at,user_id")
      .order("created_at", { ascending: false });

    if (data?.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }
    if (data?.search && data.search.trim()) {
      query = query.ilike("name", `%${data.search.trim()}%`);
    }

    const { data: artists, error } = await query.limit(500);
    if (error) throw new Error(error.message);
    return artists ?? [];
  });

export const suspendArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Get artist's user_id
    const { data: artist, error: fetchErr } = await supabaseAdmin
      .from("artists")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (fetchErr || !artist) throw new Error("Artist not found");

    // Set status to suspended
    const { error } = await supabaseAdmin
      .from("artists")
      .update({ status: "suspended" } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Revoke the artist role so they lose artist access immediately
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", artist.user_id)
      .eq("role", "artist");

    await audit(context.userId, "artist.suspended", "artist", data.id, {
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

export const unsuspendArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: artist, error: fetchErr } = await supabaseAdmin
      .from("artists")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (fetchErr || !artist) throw new Error("Artist not found");

    // Restore to approved
    const { error } = await supabaseAdmin
      .from("artists")
      .update({ status: "approved" } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Re-grant the artist role
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: artist.user_id, role: "artist" } as any, {
        onConflict: "user_id,role",
      });

    await audit(context.userId, "artist.unsuspended", "artist", data.id);
    return { ok: true };
  });

export const moderateArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected"; verified?: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { status: data.status };
    if (data.verified !== undefined) patch.verified = data.verified;
    const { error } = await supabaseAdmin.from("artists").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    // If approved, also grant the user the 'artist' role
    if (data.status === "approved") {
      const { data: artist } = await supabaseAdmin
        .from("artists")
        .select("user_id")
        .eq("id", data.id)
        .single();
      if (artist?.user_id) {
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: artist.user_id, role: "artist" } as any, {
            onConflict: "user_id,role",
          });
      }
    }
    await audit(context.userId, `artist.${data.status}`, "artist", data.id, {
      verified: data.verified,
    });
    return { ok: true };
  });

// ---------- Verification Moderation ----------

export const listPendingVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("artists")
      .select("id, name, bio, genre, verified, verification_status, created_at, user_id")
      // Pending requests plus legacy rows that never got a status stamped.
      .or("verification_status.eq.pending,and(verified.eq.false,verification_status.is.null)")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const moderateArtistVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; decision: "approve" | "reject" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const isApprove = data.decision === "approve";
    const patch = {
      verified: isApprove,
      verification_status: isApprove ? "verified" : "rejected",
    };

    const { error } = await supabaseAdmin
      .from("artists")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context.userId, `artist.verification.${data.decision}`, "artist", data.id);
    return { ok: true };
  });

// ---------- Labels moderation ----------

export const listPendingLabels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("labels")
      .select("id, name, slug, bio, contact_email, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const moderateLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("labels")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.status === "approved") {
      const { data: owner } = await supabaseAdmin
        .from("labels")
        .select("owner_user_id")
        .eq("id", data.id)
        .maybeSingle();
      if (owner?.owner_user_id) {
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: owner.owner_user_id, role: "label" } as any, {
            onConflict: "user_id,role",
          });
        if (roleError)
          throw new Error(`Label was approved but role assignment failed: ${roleError.message}`);
      }
    }
    await audit(context.userId, `label.${data.status}`, "label", data.id);
    return { ok: true };
  });

// ---------- Payout review ----------

export const listPayoutsForStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("payouts")
      .select(
        "id,amount,method_code,destination,status,notes,requested_at,processed_at,artist:artists(name),label:labels(name)",
      )
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const reviewPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; decision: "approved" | "rejected"; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const notes = data.notes?.trim() || null;
    if (notes && notes.length > 1_000)
      throw new Error("Payout note must be at most 1,000 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payout, error } = await supabaseAdmin
      .from("payouts")
      .update({
        status: data.decision,
        notes,
        processed_by: context.userId,
      } as any)
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!payout) throw new Error("Payout is no longer pending review");
    await audit(context.userId, `payout.${data.decision}`, "payout", data.id, { notes });
    return { ok: true };
  });

export const listAllSplits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("revenue_splits")
      .select("id, amount, pct, payee_role, created_at, transaction_id")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

// ---------- Artist Status Diagnostics ----------

export const getArtistDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDiagnosticInfo, formatDiagnosticReport } = await import("./artist-status-utils");

    const info = await getDiagnosticInfo(supabaseAdmin);
    const report = formatDiagnosticReport(info);

    return {
      info,
      report,
    };
  });
