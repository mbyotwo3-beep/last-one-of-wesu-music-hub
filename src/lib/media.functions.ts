import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MediaBucketName = "song-audio" | "album-art" | "artist-images" | "user-avatars" | "label-images" | "hero-images";

const BUCKETS: MediaBucketName[] = ["song-audio", "album-art", "artist-images", "user-avatars", "label-images", "hero-images"];

/**
 * Presigned PUT for a direct browser → R2 upload.
 * Falls back to Supabase storage if R2 is not configured.
 * The key is scoped to the caller's own folder by default, or a custom folder if provided.
 */
export const signUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: MediaBucketName; filename: string; folder?: string }) => d)
  .handler(async ({ context, data }) => {
    if (!BUCKETS.includes(data.bucket)) throw new Error("Unknown bucket");
    const safe = (data.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    // Use custom folder if provided, otherwise use userId
    const folder = data.folder || context.userId;
    const path = `${folder}/${Date.now()}-${safe}`;
    const { r2SignedPutUrl, isR2Configured } = await import("./r2.server");
    
    if (isR2Configured()) {
      const url = await r2SignedPutUrl(data.bucket, path);
      return { url, path, provider: "r2" as const };
    }
    
    // Fallback to Supabase storage
    const { data: signed, error } = await context.supabase.storage
      .from(data.bucket)
      .createSignedUploadUrl(path);
    
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    
    return { url: signed.signedUrl, path, provider: "supabase" as const };
  });

/** Short-lived read URL for cover art / avatars (publicly viewable media). */
export const signImageUrl = createServerFn({ method: "POST" })
  .validator((d: { bucket: Exclude<MediaBucketName, "song-audio">; path: string }) => d)
  .handler(async ({ data }) => {
    if (!BUCKETS.includes(data.bucket) || (data.bucket as string) === "song-audio") {
      throw new Error("Unknown bucket");
    }
    if (!data.path) throw new Error("Missing path");
    const { signMediaUrl } = await import("./media.server");
    return { url: await signMediaUrl(data.bucket, data.path, { expiresIn: 3600 }) };
  });
