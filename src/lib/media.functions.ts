import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "@/lib/roles";

export type MediaBucketName =
  "song-audio" | "album-art" | "artist-images" | "user-avatars" | "label-images" | "hero-images";

const BUCKETS: MediaBucketName[] = [
  "song-audio",
  "album-art",
  "artist-images",
  "user-avatars",
  "label-images",
  "hero-images",
];

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
    // Scope uploads to the caller's own folder. A custom folder is only
    // honored for staff — otherwise anyone could write into another user's
    // prefix by passing folder=<victim-id>.
    let folder = context.userId;
    if (data.folder && data.folder !== context.userId) {
      const staff = await isStaffUser(context.supabase, context.userId);
      if (!staff) throw new Error("Forbidden: cannot upload to another user's folder");
      if (data.folder.includes("..") || data.folder.includes("/")) {
        throw new Error("Invalid folder");
      }
      folder = data.folder;
    }
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
    if (!data.path || typeof data.path !== "string") throw new Error("Missing path");
    // Only relative storage paths — never absolute URLs or traversal.
    if (/^(https?:|data:|blob:)/i.test(data.path) || data.path.includes("..")) {
      throw new Error("Invalid path");
    }
    const { signMediaUrl } = await import("./media.server");
    // Use public URL instead of signed URL to support multiple domains
    return { url: await signMediaUrl(data.bucket, data.path, { expiresIn: 3600 }) };
  });

/** Delete an image media object from storage to save storage space (photos only). */
export const deleteMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: Exclude<MediaBucketName, "song-audio">; path: string }) => d)
  .handler(async ({ context, data }) => {
    const photoBuckets = [
      "album-art",
      "artist-images",
      "user-avatars",
      "label-images",
      "hero-images",
    ];
    if (!photoBuckets.includes(data.bucket)) {
      throw new Error("Invalid photo bucket for deletion");
    }
    if (!data.path || typeof data.path !== "string") {
      throw new Error("Missing path for deletion");
    }
    // Reject absolute URLs and traversal — only relative storage paths.
    if (/^(https?:|data:|blob:)/i.test(data.path) || data.path.includes("..")) {
      throw new Error("Invalid path");
    }

    // Security check: must be in caller's own user folder or caller is staff
    const ownerPrefix = `${context.userId}/`;
    const isOwner = data.path.startsWith(ownerPrefix);
    if (!isOwner) {
      const isStaff = await isStaffUser(context.supabase, context.userId);
      if (!isStaff) {
        throw new Error("Unauthorized to delete this media file");
      }
    }

    const { deleteStoredMedia } = await import("./media.server");
    await deleteStoredMedia(data.bucket as any, data.path);
    return { ok: true };
  });
