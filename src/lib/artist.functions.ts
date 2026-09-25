import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";
import { normalizeGenre } from "./genres";

// Best-effort audit; RLS may block insert for regular users — never fail the
// user's action because of this. SUPABASE_SERVICE_ROLE_KEY is not available on
// Lovable Cloud, so we can't fall back to an admin client here.
export async function audit(
  client: SupabaseClient,
  actorId: string,
  action: string,
  target_type?: string,
  target_id?: string,
  meta: any = {},
) {
  try {
    await client
      .from("audit_log")
      .insert({ actor_id: actorId, action, target_type, target_id, meta } as any);
  } catch {
    /* ignore */
  }
}

/**
 * Artists may only move their own content between draft <-> pending.
 * approved/rejected are staff-only (moderation) — accepting them from an
 * artist request would let anyone self-approve via devtools.
 */
function clampArtistStatus(
  requested: "draft" | "pending" | "approved" | "rejected" | undefined,
  fallback: "draft" | "pending",
  isStaff: boolean,
): "draft" | "pending" | "approved" | "rejected" {
  const next = requested ?? fallback;
  if ((next === "approved" || next === "rejected") && !isStaff) {
    throw new Error("Only staff can approve or reject content");
  }
  if (next !== "draft" && next !== "pending" && next !== "approved" && next !== "rejected") {
    throw new Error("Invalid status");
  }
  return next;
}

/**
 * Storage rows must reference the caller's own folder (staff exempt).
 * Without this, an artist can point their row at another user's private
 * object and obtain signed URLs for it via the image/audio helpers.
 */
function assertOwnStoragePath(
  kind: "audio" | "cover",
  path: string | null | undefined,
  userId: string,
  isStaff: boolean,
) {
  if (!path || isStaff) return;
  if (!path.startsWith(`${userId}/`)) {
    throw new Error(`Invalid ${kind}_url: must be under your own storage folder`);
  }
}

// ---------- Artist application & profile ----------

export const applyAsArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      name: string;
      bio?: string;
      genre?: string;
      termsAccepted: boolean;
      termsVersion?: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!data.termsAccepted) {
      throw new Error("You must agree to the Artist Terms & Conditions before applying.");
    }
    const termsVersion = data.termsVersion ?? "2025-08-01";
    const termsAcceptedAt = new Date().toISOString();
    const { data: existing } = await supabase
      .from("artists")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing && existing.status !== "rejected") {
      return { ok: true, status: existing.status, id: existing.id };
    }

    if (existing && existing.status === "rejected") {
      const { data: row, error } = await supabase
        .from("artists")
        .update({
          name: data.name,
          bio: data.bio ?? null,
          genre: normalizeGenre(data.genre) || null,
          status: "pending",
        } as any)
        .eq("id", existing.id)
        .select("id, status")
        .single();
      if (error) throw new Error(error.message);
      await audit(supabase, userId, "artist.reapply", "artist", row!.id, {
        terms_version: termsVersion,
        terms_accepted_at: termsAcceptedAt,
      });
      return { ok: true, status: row!.status, id: row!.id };
    }

    const { data: row, error } = await supabase
      .from("artists")
      .insert({
        user_id: userId,
        name: data.name,
        bio: data.bio ?? null,
        genre: normalizeGenre(data.genre) || null,
        status: "pending",
      } as any)
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "artist.apply", "artist", row!.id, {
      terms_version: termsVersion,
      terms_accepted_at: termsAcceptedAt,
    });
    return { ok: true, status: row!.status, id: row!.id };
  });

export const updateArtistProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      name?: string;
      bio?: string;
      genre?: string;
      avatar_url?: string;
      cover_url?: string;
      social_links?: Record<string, string>;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    if (data.bio !== undefined && data.bio.length > 500) {
      throw new Error("Bio must be at most 500 characters");
    }
    if (data.name !== undefined) {
      const n = data.name.trim();
      if (!n) throw new Error("Artist name is required");
      if (n.length > 120) throw new Error("Artist name is too long");
    }

    // Fetch existing artist photos to delete old ones when replaced
    const { data: existing } = await supabase
      .from("artists")
      .select("avatar_url, cover_url")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.avatar_url && data.avatar_url && data.avatar_url !== existing.avatar_url) {
      try {
        const { deleteStoredMedia } = await import("./media.server");
        await deleteStoredMedia("artist-images", existing.avatar_url);
      } catch (err) {
        console.warn("[Artist Update] Could not delete old avatar photo:", err);
      }
    }

    if (existing?.cover_url && data.cover_url && data.cover_url !== existing.cover_url) {
      try {
        const { deleteStoredMedia } = await import("./media.server");
        await deleteStoredMedia("artist-images", existing.cover_url);
      } catch (err) {
        console.warn("[Artist Update] Could not delete old cover photo:", err);
      }
    }

    const patch: any = {};
    for (const k of ["name", "bio", "genre", "avatar_url", "cover_url"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    // Fold free-text genres into the canonical category list.
    if (patch.genre !== undefined) patch.genre = normalizeGenre(patch.genre) || null;
    if (data.social_links) patch.social_links = data.social_links;
    const { error } = await supabase.from("artists").update(patch).eq("user_id", userId);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "artist.profile.update", "artist", userId, patch);
    return { ok: true };
  });

// ---------- Upload & Delete song ----------

export const uploadSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      title: string;
      audio_url: string; // path inside song-audio bucket
      cover_url?: string; // path inside album-art bucket (optional)
      duration?: number;
      genre?: string;
      price?: number;
      album_id?: string | null;
      release_date?: string | null;
      has_feature?: boolean;
      has_label?: boolean;
      track_number?: number | null; // artist-chosen position within album
      fee_acknowledged?: boolean; // required for free (price 0) releases
      status?: "draft" | "pending" | "approved" | "rejected";
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: artist } = await supabase
      .from("artists")
      .select("id, status, verified, label_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!artist) throw new Error("You must be an approved artist to upload");
    if ((artist as any).status !== "approved")
      throw new Error("Your artist application must be approved before uploading");

    const staff = await isStaffUser(supabase, userId);

    // Validate title and price server-side against the live pricing config
    // (client checks are bypassable).
    const title = (data.title ?? "").trim();
    if (!title) throw new Error("Song title is required");
    if (title.length > 200) throw new Error("Song title is too long");
    const { getPricingConfig } = await import("@/lib/pricing.functions");
    const pricing = await getPricingConfig();
    const price = Number(data.price ?? 0);
    if (!Number.isFinite(price) || price < 0 || price > pricing.song_max) {
      throw new Error(`Song price must be between 0 and ${pricing.song_max}`);
    }
    if (price > 0 && price < pricing.song_min) {
      throw new Error(`Paid songs must cost at least K${pricing.song_min}`);
    }
    // Free releases require acknowledging the maintenance fee (the client
    // checkbox alone is bypassable).
    if (price === 0 && !(data as any).fee_acknowledged && !staff) {
      throw new Error("Free releases require acknowledging the maintenance fee");
    }

    // Security: storage paths must be scoped to the caller's own folder.
    // Prevents referencing another user's private object and later obtaining
    // a signed download URL for it via admin-signed URL helpers.
    if (!data.audio_url) throw new Error("Audio file is required");
    assertOwnStoragePath("audio", data.audio_url, userId, staff);
    assertOwnStoragePath("cover", data.cover_url, userId, staff);

    // If has_label is true, ensure artist is signed to a label
    if (data.has_label && !(artist as any).label_id) {
      throw new Error("You must be signed to a label to upload a label release");
    }

    // Songs require admin approval before showing on the platform.
    const songStatus = clampArtistStatus(data.status, data.album_id ? "draft" : "pending", staff);
    const { data: song, error } = await supabase
      .from("songs")
      .insert({
        title,
        audio_url: data.audio_url,
        cover_url: data.cover_url ?? null,
        duration: data.duration ?? null,
        genre: normalizeGenre(data.genre) || null,
        price,
        album_id: data.album_id ?? null,
        artist_id: (artist as any).id,
        status: songStatus,
        release_date: data.release_date ?? null,
        label_id: data.has_label ? (artist as any).label_id : null,
        track_number: data.track_number ?? null,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "song.upload", "song", song!.id, {
      title: data.title,
      status: songStatus,
      release_date: data.release_date,
      has_feature: data.has_feature,
      has_label: data.has_label,
    });
    return { ok: true, id: song!.id, status: songStatus };
  });

export const deleteSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; reason?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch the song details
    const { data: song, error: songErr } = await supabaseAdmin
      .from("songs")
      .select("id, title, artist_id, audio_url, cover_url")
      .eq("id", data.id)
      .maybeSingle();

    if (songErr || !song) {
      throw new Error("Song not found");
    }

    // 2. Permission check:
    // Either the caller is staff (admin/superadmin)
    // OR the caller is the artist who owns this song
    const isStaff = await isStaffUser(supabase, userId);
    let isOwner = false;

    if (!isStaff) {
      const { data: artist } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (artist && (artist as any).id === song.artist_id) {
        isOwner = true;
      }
    }

    if (!isStaff && !isOwner) {
      throw new Error("Forbidden: You do not have permission to delete this song");
    }

    // 3. Remove from featured slots if any
    try {
      await supabaseAdmin
        .from("featured_slots")
        .delete()
        .eq("target_type", "song")
        .eq("target_id", song.id);
    } catch {
      /* ignore */
    }

    // 4. Clean up audio and cover art files from storage (best-effort)
    try {
      if (song.audio_url) {
        const { r2Delete, isR2Configured } = await import("./r2.server");
        if (isR2Configured()) await r2Delete("song-audio", song.audio_url);
        await supabaseAdmin.storage.from("song-audio").remove([song.audio_url]);
      }
      if (song.cover_url) {
        // Only delete cover art if no other song or album is using it
        const { data: sharedSong } = await supabaseAdmin
          .from("songs")
          .select("id")
          .eq("cover_url", song.cover_url)
          .neq("id", song.id)
          .limit(1)
          .maybeSingle();

        const { data: sharedAlbum } = await supabaseAdmin
          .from("albums")
          .select("id")
          .eq("cover_url", song.cover_url)
          .limit(1)
          .maybeSingle();

        if (!sharedSong && !sharedAlbum) {
          const { deleteStoredMedia } = await import("./media.server");
          await deleteStoredMedia("album-art", song.cover_url);
        }
      }
    } catch {
      /* ignore */
    }

    // 5. Delete the song row (cascades to likes, playlist_songs, saved_tracks, play_history, song_collaborators)
    const { error: delError } = await supabaseAdmin.from("songs").delete().eq("id", song.id);

    if (delError) {
      throw new Error(delError.message);
    }

    // 6. Audit log
    await audit(supabaseAdmin, userId, "song.delete", "song", song.id, {
      title: song.title,
      artist_id: song.artist_id,
      deleted_by_role: isStaff ? "staff" : "artist",
      reason: data.reason ?? null,
    });

    return { ok: true, id: song.id, title: song.title };
  });

// ---------- Albums ----------

export const createAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      title: string;
      cover_url?: string;
      release_date?: string;
      genre?: string;
      description?: string;
      price?: number;
      status?: "draft" | "pending" | "approved" | "rejected";
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: artist } = await supabase
      .from("artists")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!artist) throw new Error("Artist profile required");
    const staff = await isStaffUser(supabase, userId);
    const title = (data.title ?? "").trim();
    if (!title) throw new Error("Album title is required");
    if (title.length > 200) throw new Error("Album title is too long");
    const { getPricingConfig } = await import("@/lib/pricing.functions");
    const pricing = await getPricingConfig();
    const price = Number(data.price ?? 0);
    if (!Number.isFinite(price) || price < 0 || price > pricing.album_max) {
      throw new Error(`Album price must be between 0 and ${pricing.album_max}`);
    }
    if (price > 0 && price < pricing.album_min) {
      throw new Error(`Paid albums must cost at least K${pricing.album_min}`);
    }
    assertOwnStoragePath("cover", data.cover_url, userId, staff);
    const { data: album, error } = await supabase
      .from("albums")
      .insert({
        title,
        cover_url: data.cover_url ?? null,
        release_date: data.release_date ?? null,
        genre: normalizeGenre(data.genre) || null,
        description: data.description ?? null,
        price,
        artist_id: (artist as any).id,
        status: clampArtistStatus(data.status, "draft", staff),
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "album.create", "album", album!.id, {
      title: data.title,
      release_date: data.release_date,
      status: data.status ?? "draft",
    });
    return { ok: true, id: album!.id };
  });

export const listMyAlbums = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return [];
    const { data } = await context.supabase
      .from("albums")
      .select("id, title, cover_url, release_date")
      .eq("artist_id", (artist as any).id)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

// ---------- Payouts ----------

/**
 * Calculate available balance for artist payout
 */
async function getArtistAvailableBalance(
  supabase: SupabaseClient,
  artistId: string,
): Promise<number> {
  // Get total earned from revenue splits
  const { data: splits } = await supabase
    .from("revenue_splits")
    .select("amount")
    .eq("artist_id", artistId)
    .eq("payee_role", "artist");

  const totalEarned = (splits ?? []).reduce((sum, s: any) => sum + Number(s.amount || 0), 0);

  // Get total already committed. Every non-terminal status counts:
  // "approved" rows were previously ignored, so approving a payout never
  // reduced the available balance and the same earnings could be requested
  // and spent twice. (Mirrors the label balance in labels.functions.ts.)
  const { data: payouts } = await supabase
    .from("payouts")
    .select("amount")
    .eq("artist_id", artistId)
    .in("status", ["pending", "approved", "processing", "paid", "completed"]);

  const totalPaid = (payouts ?? []).reduce((sum, p: any) => sum + Number(p.amount || 0), 0);

  return Math.max(0, totalEarned - totalPaid);
}

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { amount: number; method_code: string; destination: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Get dynamic withdrawal settings
    const { readWithdrawalConfig } = await import("@/lib/pricing.functions");
    const withdrawalConfig = await readWithdrawalConfig();
    const minWithdrawal = withdrawalConfig.min_amount;

    // Strict validation: NaN/negative/zero amounts and blank destination
    // details must never create a payout row (NaN passes every < / >
    // comparison, and Postgres numeric even stores NaN).
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Payout amount must be a positive number");
    }
    if (!data.method_code?.trim()) throw new Error("A payout method is required");
    if (!data.destination?.trim()) throw new Error("A payout destination is required");

    // REQUIREMENT: Payout only allowed if money is over minimum
    if (amount < minWithdrawal) {
      throw new Error(`Minimum withdrawal amount is K${minWithdrawal} (ZMW ${minWithdrawal})`);
    }

    const { data: artist } = await supabase
      .from("artists")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!artist) throw new Error("Artist profile required");

    // SECURITY: Check available balance
    const available = await getArtistAvailableBalance(supabase, (artist as any).id);
    if (available <= minWithdrawal) {
      throw new Error(
        `You can only apply for withdrawal if your available balance is over K${minWithdrawal} (Current: K${available.toFixed(2)})`,
      );
    }
    if (amount > available) {
      throw new Error(
        `Insufficient balance. Available: K${available.toFixed(2)}, Requested: K${amount.toFixed(2)}`,
      );
    }

    const { error } = await supabase.from("payouts").insert({
      artist_id: (artist as any).id,
      amount,
      method_code: data.method_code.trim(),
      destination: data.destination.trim(),
    } as any);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "payout.request", "artist", (artist as any).id, {
      amount: data.amount,
      available_balance: available,
    });
    return { ok: true };
  });

export const listMyPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return [];
    const { data } = await context.supabase
      .from("payouts")
      .select("*")
      .eq("artist_id", (artist as any).id)
      .order("requested_at", { ascending: false });
    return data ?? [];
  });

// ---------- Verification Application ----------

export const requestArtistVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: artist } = await supabase
      .from("artists")
      .select("id, verified, verification_status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!artist) throw new Error("Artist profile required");
    if ((artist as any).verified) throw new Error("Artist is already verified");
    if ((artist as any).verification_status === "pending") {
      throw new Error("Your verification application is already under review");
    }

    // Get dynamic verification settings
    const { readVerificationConfig } = await import("@/lib/pricing.functions");
    const verificationConfig = await readVerificationConfig();
    const minFollowers = verificationConfig.min_followers;
    const minEarnings = verificationConfig.min_earnings;

    // Check follower count
    const { count: followersCount } = await supabase
      .from("artist_followers")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", (artist as any).id);

    if ((followersCount ?? 0) < minFollowers) {
      throw new Error(
        `Verification requires at least ${minFollowers} followers (Currently: ${followersCount ?? 0})`,
      );
    }

    // Check total earnings
    const { data: songs } = await supabase
      .from("songs")
      .select("id")
      .eq("artist_id", (artist as any).id);
    const { data: albums } = await supabase
      .from("albums")
      .select("id")
      .eq("artist_id", (artist as any).id);
    const songIds = (songs ?? []).map((s) => s.id);
    const albumIds = (albums ?? []).map((a) => a.id);

    let totalRevenue = 0;
    if (songIds.length || albumIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const filters: string[] = [];
      if (songIds.length) filters.push(`song_id.in.(${songIds.join(",")})`);
      if (albumIds.length) filters.push(`album_id.in.(${albumIds.join(",")})`);
      const { data: sales } = await supabaseAdmin
        .from("purchases")
        .select("amount")
        .eq("status", "completed")
        .or(filters.join(","));
      totalRevenue = (sales ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    }

    if (totalRevenue <= minEarnings) {
      throw new Error(
        `Verification requires total earnings over K${minEarnings} (Currently: K${totalRevenue.toFixed(2)})`,
      );
    }

    const { error } = await supabase
      .from("artists")
      .update({ verification_status: "pending" } as any)
      .eq("id", (artist as any).id);

    if (error) throw new Error(error.message);
    await audit(supabase, userId, "artist.request_verification", "artist", (artist as any).id);
    return { ok: true };
  });

// ---------- New: collab prefs, feature toggle, label join/leave, song list ----------

export const setCollabPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { accepts_collabs?: boolean; allow_features?: boolean; feature_rate?: number }) => d,
  )
  .handler(async ({ context, data }) => {
    const patch: any = {};
    if (data.accepts_collabs !== undefined) patch.accepts_collabs = data.accepts_collabs;
    if (data.allow_features !== undefined) patch.available_for_features = data.allow_features;
    if (data.feature_rate !== undefined) {
      const r = Number(data.feature_rate);
      if (!Number.isFinite(r) || r < 0 || r > 100000) {
        throw new Error("Feature rate must be between 0 and 100000");
      }
      patch.feature_rate = r;
    }
    const { error } = await context.supabase
      .from("artists")
      .update(patch)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch the album with artist to verify ownership
    const { data: album, error: albumErr } = await supabaseAdmin
      .from("albums")
      .select("id, title, cover_url, artist_id, artists!inner(user_id)")
      .eq("id", data.id)
      .maybeSingle();

    if (albumErr || !album) {
      throw new Error("Album not found");
    }

    // 2. Permission check: owner OR staff (admin/superadmin) — previously
    // staff was blocked, so admins couldn't clean up ghost albums.
    const isStaff = await isStaffUser(supabase, userId);
    if (!isStaff && (album as any).artists.user_id !== userId) {
      throw new Error("Forbidden: You do not have permission to delete this album");
    }

    // 3. Fetch songs on this album so we delete them TOGETHER with the album.
    // Previously songs were orphaned via SET NULL, leaving ghost covers on
    // home shelves (album row with 0 songs still in recentAlbums) and forcing
    // song-by-song deletes.
    const { data: albumSongs } = await supabaseAdmin
      .from("songs")
      .select("id, audio_url, cover_url")
      .eq("album_id", data.id);
    const songIds = (albumSongs ?? []).map((s: any) => s.id as string);

    // 4. Remove featured slots pointing at the album OR its songs (target_id
    // has no FK, so orphans otherwise keep rendering ghost covers).
    try {
      await supabaseAdmin
        .from("featured_slots")
        .delete()
        .eq("target_type", "album")
        .eq("target_id", data.id);
      if (songIds.length > 0) {
        await supabaseAdmin
          .from("featured_slots")
          .delete()
          .eq("target_type", "song")
          .in("target_id", songIds);
      }
    } catch {
      /* ignore */
    }

    // 5. Delete saved_albums entries
    await supabaseAdmin.from("saved_albums").delete().eq("album_id", data.id);

    // 6. Collect distinct storage paths before row deletes (for shared checks)
    const audioPaths = Array.from(
      new Set((albumSongs ?? []).map((s: any) => s.audio_url).filter(Boolean)),
    ) as string[];
    const coverPaths = Array.from(
      new Set(
        [album.cover_url, ...(albumSongs ?? []).map((s: any) => s.cover_url)].filter(Boolean),
      ),
    ) as string[];

    // 7. Delete songs first (lets FK CASCADE clean playlist_songs,
    // saved_tracks, likes, play_history, collaborators). Purchases use
    // SET NULL so receipts survive.
    if (songIds.length > 0) {
      const { error: songsDelErr } = await supabaseAdmin.from("songs").delete().in("id", songIds);
      if (songsDelErr) throw new Error(songsDelErr.message);
    }

    // 8. Delete the album row
    const { error: delError } = await supabaseAdmin.from("albums").delete().eq("id", data.id);

    if (delError) {
      throw new Error(delError.message);
    }

    // 9. Best-effort storage cleanup AFTER commit, only when no other
    // song/album still references the path.
    try {
      const { r2Delete, isR2Configured } = await import("./r2.server");
      const { deleteStoredMedia } = await import("./media.server");
      const useR2 = isR2Configured();
      for (const p of audioPaths) {
        try {
          if (useR2) await r2Delete("song-audio", p);
          await supabaseAdmin.storage.from("song-audio").remove([p]);
        } catch {
          /* ignore per-file */
        }
      }
      for (const p of coverPaths) {
        try {
          const [{ data: s1 }, { data: s2 }] = await Promise.all([
            supabaseAdmin.from("songs").select("id").eq("cover_url", p).limit(1).maybeSingle(),
            supabaseAdmin.from("albums").select("id").eq("cover_url", p).limit(1).maybeSingle(),
          ]);
          if (!s1 && !s2) await deleteStoredMedia("album-art", p);
        } catch {
          /* ignore per-file */
        }
      }
    } catch (err) {
      console.warn("[Album Delete] storage cleanup failed:", err);
    }

    // 10. Audit log
    await audit(supabaseAdmin, userId, "album.delete", "album", data.id, {
      title: album.title,
      artist_id: album.artist_id,
      song_count: songIds.length,
      deleted_by_role: isStaff ? "staff" : "artist",
    });

    return { ok: true, id: data.id, title: album.title, deletedSongs: songIds.length };
  });

export const updateAlbum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      title?: string;
      description?: string;
      genre?: string;
      cover_url?: string;
      release_date?: string;
      price?: number;
      status?: "draft" | "pending" | "approved" | "rejected";
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch the album with artist to verify ownership
    const { data: album, error: albumErr } = await supabaseAdmin
      .from("albums")
      .select("id, title, cover_url, artist_id, artists!inner(user_id)")
      .eq("id", data.id)
      .maybeSingle();

    if (albumErr || !album) {
      throw new Error("Album not found");
    }

    // 2. Permission check: owner OR staff (admins must be able to
    // moderate/clean up albums — previously staff were blocked entirely).
    const staff = await isStaffUser(supabase, userId);
    if (!staff && (album as any).artists.user_id !== userId) {
      throw new Error("Forbidden: You do not have permission to edit this album");
    }

    // 3. Handle cover art update (delete old if changed)
    if (data.cover_url && data.cover_url !== album.cover_url && album.cover_url) {
      try {
        // Check if any other song or album is using the old cover
        const { data: sharedSong } = await supabaseAdmin
          .from("songs")
          .select("id")
          .eq("cover_url", album.cover_url)
          .limit(1)
          .maybeSingle();

        const { data: sharedAlbum } = await supabaseAdmin
          .from("albums")
          .select("id")
          .eq("cover_url", album.cover_url)
          .neq("id", data.id)
          .limit(1)
          .maybeSingle();

        if (!sharedSong && !sharedAlbum) {
          const { deleteStoredMedia } = await import("./media.server");
          await deleteStoredMedia("album-art", album.cover_url);
        }
      } catch (err) {
        console.warn("[Album Update] Could not delete old cover art:", err);
      }
    }

    // 4. Build update object (validated — client checks are bypassable)
    const updateData: any = {};
    if (data.title !== undefined) {
      const t = data.title.trim();
      if (!t) throw new Error("Album title is required");
      if (t.length > 200) throw new Error("Album title is too long");
      updateData.title = t;
    }
    if (data.description !== undefined) updateData.description = data.description;
    if (data.genre !== undefined) updateData.genre = normalizeGenre(data.genre) || null;
    if (data.cover_url !== undefined) {
      assertOwnStoragePath("cover", data.cover_url, userId, staff);
      updateData.cover_url = data.cover_url;
    }
    if (data.release_date !== undefined) updateData.release_date = data.release_date;
    if (data.price !== undefined) {
      const { getPricingConfig } = await import("@/lib/pricing.functions");
      const pricing = await getPricingConfig();
      const p = Number(data.price);
      if (!Number.isFinite(p) || p < 0 || p > pricing.album_max) {
        throw new Error(`Album price must be between 0 and ${pricing.album_max}`);
      }
      if (p > 0 && p < pricing.album_min) {
        throw new Error(`Paid albums must cost at least K${pricing.album_min}`);
      }
      updateData.price = p;
    }
    if (data.status !== undefined) {
      updateData.status = clampArtistStatus(data.status, "draft", staff);
    }

    // 5. Update the album
    const { error: updateError } = await supabaseAdmin
      .from("albums")
      .update(updateData)
      .eq("id", data.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // 6. Audit log
    await audit(supabaseAdmin, userId, "album.update", "album", data.id, {
      title: album.title,
      changes: updateData,
    });

    return { ok: true, id: data.id };
  });

export const updateSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      title?: string;
      cover_url?: string;
      genre?: string;
      price?: number;
      track_number?: number;
      status?: "draft" | "pending" | "approved" | "rejected";
      explicit?: boolean;
      album_id?: string | null;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch the song with artist to verify ownership
    const { data: song, error: songErr } = await supabaseAdmin
      .from("songs")
      .select("id, title, cover_url, artist_id, artists!inner(user_id)")
      .eq("id", data.id)
      .maybeSingle();

    if (songErr || !song) {
      throw new Error("Song not found");
    }

    // 2. Permission check: owner OR staff.
    const staff = await isStaffUser(supabase, userId);
    if (!staff && (song as any).artists.user_id !== userId) {
      throw new Error("Forbidden: You do not have permission to edit this song");
    }

    // 3. Handle cover art update (delete old if changed)
    if (data.cover_url && data.cover_url !== song.cover_url && song.cover_url) {
      try {
        // Check if any other song or album is using the old cover
        const { data: sharedSong } = await supabaseAdmin
          .from("songs")
          .select("id")
          .eq("cover_url", song.cover_url)
          .neq("id", data.id)
          .limit(1)
          .maybeSingle();

        const { data: sharedAlbum } = await supabaseAdmin
          .from("albums")
          .select("id")
          .eq("cover_url", song.cover_url)
          .limit(1)
          .maybeSingle();

        if (!sharedSong && !sharedAlbum) {
          const { deleteStoredMedia } = await import("./media.server");
          await deleteStoredMedia("album-art", song.cover_url);
        }
      } catch (err) {
        console.warn("[Song Update] Could not delete old cover art:", err);
      }
    }

    // 4. Build update object (validated — client checks are bypassable)
    const updateData: any = {};
    if (data.title !== undefined) {
      const t = data.title.trim();
      if (!t) throw new Error("Song title is required");
      if (t.length > 200) throw new Error("Song title is too long");
      updateData.title = t;
    }
    if (data.cover_url !== undefined) {
      assertOwnStoragePath("cover", data.cover_url, userId, staff);
      updateData.cover_url = data.cover_url;
    }
    if (data.genre !== undefined) updateData.genre = normalizeGenre(data.genre) || null;
    if (data.price !== undefined) {
      const { getPricingConfig } = await import("@/lib/pricing.functions");
      const pricing = await getPricingConfig();
      const p = Number(data.price);
      if (!Number.isFinite(p) || p < 0 || p > pricing.song_max) {
        throw new Error(`Song price must be between 0 and ${pricing.song_max}`);
      }
      if (p > 0 && p < pricing.song_min) {
        throw new Error(`Paid songs must cost at least K${pricing.song_min}`);
      }
      updateData.price = p;
    }
    if (data.track_number !== undefined) updateData.track_number = data.track_number;
    if (data.status !== undefined) {
      updateData.status = clampArtistStatus(data.status, "draft", staff);
    }
    if (data.explicit !== undefined) updateData.explicit = data.explicit;
    if (data.album_id !== undefined) {
      // The target album must belong to the caller — otherwise anyone could
      // attach their song to another artist's album.
      if (data.album_id !== null && !staff) {
        const { data: target } = await supabaseAdmin
          .from("albums")
          .select("id, artist_id")
          .eq("id", data.album_id)
          .maybeSingle();
        if (!target || (target as any).artist_id !== (song as any).artist_id) {
          throw new Error("Target album not found or not yours");
        }
      }
      updateData.album_id = data.album_id;
    }

    // 5. Update the song
    const { error: updateError } = await supabaseAdmin
      .from("songs")
      .update(updateData)
      .eq("id", data.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // 6. Audit log
    await audit(supabaseAdmin, userId, "song.update", "song", data.id, {
      title: song.title,
      changes: updateData,
    });

    return { ok: true, id: data.id };
  });

export const leaveLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) throw new Error("Artist profile required");
    await context.supabase
      .from("artists")
      .update({ label_id: null } as any)
      .eq("user_id", context.userId);
    await context.supabase
      .from("label_artists")
      .update({ status: "left" } as any)
      .eq("artist_id", (artist as any).id)
      .eq("status", "active");
    return { ok: true };
  });

export const listMyLabelInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id, label_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return { current: null, invites: [] };
    const { data: invites } = await context.supabase
      .from("label_artists")
      .select("id, royalty_pct, status, labels!inner(id, name, logo_url)")
      .eq("artist_id", (artist as any).id)
      .eq("status", "invited");
    return { current: artist, invites: invites ?? [] };
  });

export const listMySongs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: artist } = await context.supabase
      .from("artists")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!artist) return [];
    const { data } = await context.supabase
      .from("songs")
      .select("id, title, status, cover_url, price, play_count, created_at, genre")
      .eq("artist_id", (artist as any).id)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

// ---------- Storage signing ----------

export const signUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { bucket: "song-audio" | "album-art" | "artist-images" | "user-avatars"; path: string }) =>
      d,
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from(data.bucket)
      .createSignedUploadUrl(data.path);
    if (error) throw new Error(error.message);
    return signed;
  });

// ---------- Edit an existing track ----------
