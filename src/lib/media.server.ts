import {
  isR2Configured,
  r2Exists,
  r2Put,
  r2SignedGetUrl,
  type MediaBucket,
} from "./r2.server";

/**
 * Single read path for stored media.
 *
 * R2 is the system of record for uploads. Objects that were uploaded to
 * Supabase Storage before the switch are lazily copied into R2 the first time
 * they are requested, so nothing 404s during the transition.
 */
export async function signMediaUrl(
  bucket: MediaBucket,
  path: string,
  opts: { expiresIn?: number; download?: string } = {},
): Promise<string> {
  if (isR2Configured()) {
    if (await r2Exists(bucket, path)) {
      return r2SignedGetUrl(bucket, path, opts);
    }
    const copied = await copyFromSupabase(bucket, path);
    if (copied) return r2SignedGetUrl(bucket, path, opts);
  }
  return signSupabaseUrl(bucket, path, opts);
}

async function signSupabaseUrl(
  bucket: MediaBucket,
  path: string,
  opts: { expiresIn?: number; download?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // Image buckets are public (album-art, artist-images, user-avatars, hero-images, label-images)
  // Audio bucket (song-audio) is private and requires signed URLs
  const publicBuckets = ["album-art", "artist-images", "user-avatars", "hero-images", "label-images"];
  
  if (publicBuckets.includes(bucket)) {
    // Use public URL for images to support multiple domains
    const { data } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Unable to get media URL");
    // Add download parameter if needed
    if (opts.download) {
      const url = new URL(data.publicUrl);
      url.searchParams.set("download", opts.download);
      return url.toString();
    }
    return data.publicUrl;
  }
  
  // Use signed URL for private buckets (song-audio)
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, opts.expiresIn ?? 3600, opts.download ? { download: opts.download } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Unable to sign media URL");
  return data.signedUrl;
}

/** Best-effort one-time copy of a legacy Supabase object into R2. */
export async function copyFromSupabase(bucket: MediaBucket, path: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error || !data) return false;
    await r2Put(bucket, path, await data.arrayBuffer(), data.type || undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a media object from R2 (if configured) and Supabase storage to reclaim space.
 * Safe to call even if the object was already deleted or doesn't exist.
 */
export async function deleteStoredMedia(bucket: MediaBucket, path: string): Promise<void> {
  if (!path || typeof path !== "string") return;
  // Ignore external full URLs
  if (/^https?:\/\//i.test(path)) return;

  // 1. Delete from R2 if configured
  if (isR2Configured()) {
    try {
      const { r2Delete } = await import("./r2.server");
      await r2Delete(bucket, path);
    } catch (err) {
      console.warn(`[Storage Cleanup] Failed to delete ${path} from R2 bucket ${bucket}:`, err);
    }
  }

  // 2. Delete from Supabase Storage
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(bucket).remove([path]);
  } catch (err) {
    console.warn(`[Storage Cleanup] Failed to delete ${path} from Supabase bucket ${bucket}:`, err);
  }
}

