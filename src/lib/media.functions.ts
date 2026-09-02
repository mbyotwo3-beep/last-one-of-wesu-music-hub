import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MediaBucketName = "song-audio" | "album-art" | "artist-images" | "user-avatars";

const BUCKETS: MediaBucketName[] = ["song-audio", "album-art", "artist-images", "user-avatars"];

/**
 * Presigned PUT for a direct browser → R2 upload.
 * The key is always scoped to the caller's own folder.
 */
export const signUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: MediaBucketName; filename: string }) => d)
  .handler(async ({ context, data }) => {
    if (!BUCKETS.includes(data.bucket)) throw new Error("Unknown bucket");
    const safe = (data.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${context.userId}/${Date.now()}-${safe}`;
    const { r2SignedPutUrl, isR2Configured } = await import("./r2.server");
    if (!isR2Configured()) throw new Error("Object storage is not configured");
    const url = await r2SignedPutUrl(data.bucket, path);
    return { url, path };
  });

/** Short-lived read URL for cover art / avatars (publicly viewable media). */
export const signImageUrl = createServerFn({ method: "POST" })
  .validator((d: { bucket: Exclude<MediaBucketName, "song-audio">; path: string }) => d)
  .handler(async ({ data }) => {
    if (!BUCKETS.includes(data.bucket) || data.bucket === "song-audio") {
      throw new Error("Unknown bucket");
    }
    if (!data.path) throw new Error("Missing path");
    const { signMediaUrl } = await import("./media.server");
    return { url: await signMediaUrl(data.bucket, data.path, { expiresIn: 3600 }) };
  });
