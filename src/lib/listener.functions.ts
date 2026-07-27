import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";

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
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    
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
  .validator((d: { name: string; description?: string; is_public?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("playlists")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description ?? null,
        is_public: data.is_public ?? false,
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
    const { error } = await context.supabase.from("playlist_songs").insert({
      playlist_id: data.playlist_id,
      song_id: data.song_id,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFromPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { playlist_id: string; song_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("playlist_songs")
      .delete()
      .eq("playlist_id", data.playlist_id)
      .eq("song_id", data.song_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("song_likes")
      .select("song_id")
      .eq("song_id", data.song_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      await context.supabase
        .from("song_likes")
        .delete()
        .eq("song_id", data.song_id)
        .eq("user_id", context.userId);
      return { liked: false };
    }
    await context.supabase
      .from("song_likes")
      .insert({ song_id: data.song_id, user_id: context.userId } as any);
    return { liked: true };
  });

export const getSignedAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { song_id: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: song } = await context.supabase
      .from("songs")
      .select("audio_url, price")
      .eq("id", data.song_id)
      .single();
    if (!song) throw new Error("Song not found");

    // Superadmin bypass — full playback everywhere for testing
    const { data: isSuper } = await context.supabase.rpc("is_superadmin" as any, {
      _user_id: context.userId,
    });

    // Free if priced 0 OR user is subscribed OR user purchased it OR superadmin
    if (!isSuper && (song as any).price && Number((song as any).price) > 0) {
      const [{ data: sub }, { data: purchase }] = await Promise.all([
        context.supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", context.userId)
          .eq("status", "active")
          .maybeSingle(),
        context.supabase
          .from("purchases")
          .select("id")
          .eq("user_id", context.userId)
          .eq("song_id", data.song_id)
          .maybeSingle(),
      ]);
      if (!sub && !purchase) return { url: "", requiresPurchase: true as const };
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

    // Sign via the authenticated user's client — storage RLS grants access
    // to entitled listeners (owner, staff, subscribed, or purchased).
    // The public read policy allows this for approved songs without service role.
    const { data: signed, error } = await context.supabase.storage
      .from("song-audio")
      .createSignedUrl(rawPath, 3600);
    if (error || !signed?.signedUrl) {
      console.error("Audio URL signing error:", error);
      throw new Error(error?.message ?? "Unable to sign audio URL. Please ensure the song is approved.");
    }
    return { url: signed.signedUrl };
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
      throw new Error("This song requires a subscription or purchase");
    }
    const rawPath = String((song as any).audio_url ?? "");
    if (/^https?:\/\//i.test(rawPath)) {
      return { url: rawPath };
    }

    // Validate that audio_url is not empty
    if (!rawPath || rawPath === "" || rawPath === "null") {
      throw new Error("Song audio file not found. Please contact support.");
    }

    // Sign via the anon client — the "song-audio public read for approved songs"
    // storage policy authorizes this without a service-role key.
    const { data: signed, error } = await supabase.storage
      .from("song-audio")
      .createSignedUrl(rawPath, 3600);
    if (error || !signed?.signedUrl) {
      console.error("Public audio URL signing error:", error);
      throw new Error(error?.message ?? "Audio temporarily unavailable. Please ensure the song is approved.");
    }
    return { url: signed.signedUrl };
  });

/**
 * Get a signed audio URL for a short 15-second preview (client-capped).
 *
 * Previews are intentionally public for ALL approved tracks (free and paid)
 * so anonymous listeners can sample songs before buying/subscribing. The
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

    // Short-lived signed URL (45s) — enough to start playback; client caps to 15s.
    // Sign via anon client so previews work on deployments without a service-role key.
    const { data: signed, error } = await supabase.storage
      .from("song-audio")
      .createSignedUrl(rawPath, 45);
    if (error || !signed?.signedUrl) {
      console.error("Preview audio URL signing error:", error);
      throw new Error(error?.message ?? "Preview temporarily unavailable. Please ensure the song is approved.");
    }
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
