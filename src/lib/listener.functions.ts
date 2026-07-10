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

    // Free if priced 0 OR user is subscribed OR user purchased it
    if ((song as any).price && Number((song as any).price) > 0) {
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
      if (!sub && !purchase) throw new Error("Subscribe or purchase to play full track");
    }

    // Try to use service role for signed URLs (more secure)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error } = await supabaseAdmin.storage
        .from("song-audio")
        .createSignedUrl((song as any).audio_url, 3600);
      if (error) throw error;
      return { url: signed.signedUrl };
    } catch (adminError) {
      // FALLBACK: If service role unavailable, use public URL
      // This works if storage bucket has public read access
      console.warn("[Audio] Service role unavailable, using public URL fallback:", adminError);
      const { supabase: publicClient } = await import("@/integrations/supabase/client");
      const { data: publicUrl } = publicClient.storage
        .from("song-audio")
        .getPublicUrl((song as any).audio_url);
      return { url: publicUrl.publicUrl };
    }
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
    
    // Try to use service role for signed URLs (more secure)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error } = await supabaseAdmin.storage
        .from("song-audio")
        .createSignedUrl((song as any).audio_url, 3600);
      if (error) throw error;
      return { url: signed.signedUrl };
    } catch (adminError) {
      // FALLBACK: If service role unavailable, use public URL
      console.warn("[Audio] Service role unavailable for anonymous playback, using public URL:", adminError);
      const { supabase: publicClient } = await import("@/integrations/supabase/client");
      const { data: publicUrl } = publicClient.storage
        .from("song-audio")
        .getPublicUrl((song as any).audio_url);
      return { url: publicUrl.publicUrl };
    }
  });

/**
 * Get a signed audio URL for preview (15-second clip) without requiring authentication.
 * This allows users to preview any approved song regardless of price.
 * The preview duration is enforced client-side.
 */
export const getPreviewAudioUrl = createServerFn({ method: "POST" })
  .validator((d: { song_id: string }) => d)
  .handler(async ({ data }) => {
    const supabase = getPublicSupabase();
    const { data: song } = await supabase
      .from("songs")
      .select("audio_url")
      .eq("id", data.song_id)
      .eq("status", "approved")
      .single();
    if (!song) throw new Error("Song not found");
    
    // Try to use service role for signed URLs (more secure)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed, error } = await supabaseAdmin.storage
        .from("song-audio")
        .createSignedUrl((song as any).audio_url, 3600);
      if (error) throw error;
      return { url: signed.signedUrl };
    } catch (adminError) {
      // FALLBACK: If service role unavailable, use public URL
      // This works if storage bucket has public read access
      console.warn("[Audio] Service role unavailable for preview, using public URL:", adminError);
      const { supabase: publicClient } = await import("@/integrations/supabase/client");
      const { data: publicUrl } = publicClient.storage
        .from("song-audio")
        .getPublicUrl((song as any).audio_url);
      return { url: publicUrl.publicUrl };
    }
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
