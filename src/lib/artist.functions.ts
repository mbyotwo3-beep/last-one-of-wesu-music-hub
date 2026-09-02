import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";

// Best-effort audit; RLS may block insert for regular users — never fail the
// user's action because of this. SUPABASE_SERVICE_ROLE_KEY is not available on
// Lovable Cloud, so we can't fall back to an admin client here.
async function audit(
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
          genre: data.genre ?? null,
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
        genre: data.genre ?? null,
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
    const patch: any = {};
    for (const k of ["name", "bio", "genre", "avatar_url", "cover_url"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
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
    }) => d,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: artist } = await supabase
      .from("artists")
      .select("id, status, verified")
      .eq("user_id", userId)
      .maybeSingle();
    if (!artist) throw new Error("You must be an approved artist to upload");
    if ((artist as any).status === "pending")
      throw new Error("Your artist application is pending approval");

    // Security: storage paths must be scoped to the caller's own folder.
    // Prevents referencing another user's private object and later obtaining
    // a signed download URL for it via admin-signed URL helpers.
    const ownerPrefix = `${userId}/`;
    if (!data.audio_url || !data.audio_url.startsWith(ownerPrefix)) {
      throw new Error("Invalid audio_url: must be under your own storage folder");
    }
    if (data.cover_url && !data.cover_url.startsWith(ownerPrefix)) {
      throw new Error("Invalid cover_url: must be under your own storage folder");
    }

    // Songs require admin approval before showing on the platform.
    const { data: song, error } = await supabase
      .from("songs")
      .insert({
        title: data.title,
        audio_url: data.audio_url,
        cover_url: data.cover_url ?? null,
        duration: data.duration ?? null,
        genre: data.genre ?? null,
        price: data.price ?? 0,
        album_id: data.album_id ?? null,
        artist_id: (artist as any).id,
        status: "pending",
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "song.upload", "song", song!.id, {
      title: data.title,
      status: "pending",
    });
    return { ok: true, id: song!.id, status: "pending" };
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

    // 4. Clean up audio file from storage (best-effort)
    try {
      if (song.audio_url) {
        const { r2Delete, isR2Configured } = await import("./r2.server");
        if (isR2Configured()) await r2Delete("song-audio", song.audio_url);
        await supabaseAdmin.storage.from("song-audio").remove([song.audio_url]);
      }
    } catch {
      /* ignore */
    }

    // 5. Delete the song row (cascades to likes, playlist_songs, saved_tracks, play_history, song_collaborators)
    const { error: delError } = await supabaseAdmin
      .from("songs")
      .delete()
      .eq("id", song.id);

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
    const { data: album, error } = await supabase
      .from("albums")
      .insert({
        title: data.title,
        cover_url: data.cover_url ?? null,
        release_date: data.release_date ?? null,
        genre: data.genre ?? null,
        description: data.description ?? null,
        price: data.price ?? 0,
        artist_id: (artist as any).id,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "album.create", "album", album!.id, { title: data.title });
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
async function getArtistAvailableBalance(supabase: SupabaseClient, artistId: string): Promise<number> {
  // Get total earned from revenue splits
  const { data: splits } = await supabase
    .from("revenue_splits")
    .select("amount")
    .eq("artist_id", artistId)
    .eq("payee_role", "artist");
  
  const totalEarned = (splits ?? []).reduce((sum, s: any) => sum + Number(s.amount || 0), 0);
  
  // Get total already paid or pending
  const { data: payouts } = await supabase
    .from("payouts")
    .select("amount")
    .eq("artist_id", artistId)
    .in("status", ["completed", "pending"]);
  
  const totalPaid = (payouts ?? []).reduce((sum, p: any) => sum + Number(p.amount || 0), 0);
  
  return Math.max(0, totalEarned - totalPaid);
}

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { amount: number; method_code: string; destination: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    
    // Get dynamic withdrawal settings
    const { getWithdrawalConfig } = await import("@/lib/pricing.functions");
    const withdrawalConfig = await getWithdrawalConfig();
    const minWithdrawal = withdrawalConfig.min_amount;
    
    // REQUIREMENT: Payout only allowed if money is over minimum
    if (data.amount < minWithdrawal) {
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
      throw new Error(`You can only apply for withdrawal if your available balance is over K${minWithdrawal} (Current: K${available.toFixed(2)})`);
    }
    if (data.amount > available) {
      throw new Error(
        `Insufficient balance. Available: K${available.toFixed(2)}, Requested: K${data.amount.toFixed(2)}`
      );
    }
    
    const { error } = await supabase.from("payouts").insert({
      artist_id: (artist as any).id,
      amount: data.amount,
      method_code: data.method_code,
      destination: data.destination,
    } as any);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "payout.request", "artist", (artist as any).id, { 
      amount: data.amount,
      available_balance: available
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
    const { getVerificationConfig } = await import("@/lib/pricing.functions");
    const verificationConfig = await getVerificationConfig();
    const minFollowers = verificationConfig.min_followers;
    const minEarnings = verificationConfig.min_earnings;

    // Check follower count
    const { count: followersCount } = await supabase
      .from("artist_followers")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", (artist as any).id);

    if ((followersCount ?? 0) < minFollowers) {
      throw new Error(
        `Verification requires at least ${minFollowers} followers (Currently: ${followersCount ?? 0})`
      );
    }

    // Check total earnings
    const { data: songs } = await supabase.from("songs").select("id").eq("artist_id", (artist as any).id);
    const { data: albums } = await supabase.from("albums").select("id").eq("artist_id", (artist as any).id);
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
        `Verification requires total earnings over K${minEarnings} (Currently: K${totalRevenue.toFixed(2)})`
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
    if (data.feature_rate !== undefined) patch.feature_rate = data.feature_rate;
    const { error } = await context.supabase
      .from("artists")
      .update(patch)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
      .eq("id", (artist as any).id);
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
