import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .validator((d: { name: string; bio?: string; genre?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
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
      await audit(supabase, userId, "artist.reapply", "artist", row!.id);
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
    await audit(supabase, userId, "artist.apply", "artist", row!.id);
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

// ---------- Upload song ----------

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
      .select("id, status")
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
    await audit(supabase, userId, "song.upload", "song", song!.id, { title: data.title });
    return { ok: true, id: song!.id };
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
    
    // SECURITY: Validate amount
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error("Payout amount must be a positive number");
    }
    
    if (data.amount > 1000000) {
      throw new Error("Payout amount cannot exceed $1,000,000");
    }
    
    const { data: artist } = await supabase
      .from("artists")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!artist) throw new Error("Artist profile required");
    
    // SECURITY: Check available balance
    const available = await getArtistAvailableBalance(supabase, (artist as any).id);
    if (data.amount > available) {
      throw new Error(
        `Insufficient balance. Available: $${available.toFixed(2)}, Requested: $${data.amount.toFixed(2)}`
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
      .select("id, title, status, cover_url")
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
