import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "@/lib/roles";

export interface StorageFile {
  /** Full object key including folders, e.g. "artist-uuid/cover.jpg". */
  name: string;
  bucket_id: string;
  size: number;
  created_at: string;
  metadata: any;
  /** "image" | "audio" | "video" | "other" — drives the thumbnail/icon. */
  kind: "image" | "audio" | "video" | "other";
  /** Publicly reachable URL for rendering a thumbnail. Images only. */
  url?: string | null;
}

/**
 * Admins and superadmins, not superadmin only.
 *
 * The media gallery is where a moderator goes to pull artwork that breaches
 * the terms. Locking it to superadmin meant an admin reviewing content had no
 * way to remove the offending photo or audio file at all.
 */
async function assertMediaStaff(supabase: any, userId: string) {
  if (!(await isStaffUser(supabase, userId))) {
    throw new Error("Forbidden: admin access required");
  }
}

/** Buckets whose objects can be rendered without a signed URL. */
const PUBLIC_BUCKETS = [
  "album-art",
  "artist-images",
  "user-avatars",
  "hero-images",
  "label-images",
];

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "oga", "opus", "flac", "aac", "m4a"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v"];

export function classifyMedia(name: string): StorageFile["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (VIDEO_EXT.includes(ext)) return "video";
  return "other";
}

/**
 * Walk a bucket recursively.
 *
 * The old implementation listed only the bucket root. Uploads are written as
 * "<user-uuid>/<file>", so the gallery rendered one row per artist folder —
 * no thumbnails, no file sizes, nothing to inspect or delete. It looked like
 * the media was missing rather than merely unlisted.
 *
 * Bounded by maxEntries and a depth limit so a large bucket cannot hang the
 * request or melt a serverless function.
 */
export const listStorageFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: string }) => d)
  .handler(async ({ context, data }) => {
    await assertMediaStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const maxEntries = 400;
    const maxDepth = 4;
    const out: StorageFile[] = [];

    const walk = async (prefix: string, depth: number) => {
      if (depth > maxDepth || out.length >= maxEntries) return;
      const { data: entries, error } = await (supabaseAdmin as any).storage
        .from(data.bucket)
        .list(prefix, { limit: 1000 });
      if (error) return; // a missing prefix is normal, not fatal
      for (const f of entries ?? []) {
        if (out.length >= maxEntries) return;
        const path = prefix ? `${prefix}/${f.name}` : f.name;
        // Supabase marks a "folder" by returning a null id and no size.
        const isFolder = f.id === null || f.id === undefined;
        if (isFolder) {
          await walk(path, depth + 1);
          continue;
        }
        const kind = classifyMedia(path);
        let url: string | null = null;
        if (PUBLIC_BUCKETS.includes(data.bucket) && kind === "image") {
          url = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path).data.publicUrl;
        }
        out.push({
          name: path,
          bucket_id: data.bucket,
          size: f.metadata?.size || 0,
          created_at: f.created_at,
          metadata: f.metadata,
          kind,
          url,
        });
      }
    };

    await walk("", 0);
    // Newest first — that is what a moderator is looking for.
    return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  });

// ─── delete a file from storage ───────────────
export const deleteStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { bucket: string; path: string }) => d)
  .handler(async ({ context, data }) => {
    await assertMediaStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // R2 is the system of record (see media.server.ts). Removing only the
    // Supabase copy left the object in R2, so it kept resolving through
    // signMediaUrl and "deleted" media came straight back.
    let r2Error: string | null = null;
    try {
      const { deleteStoredMedia } = await import("@/lib/media.server");
      const { isR2Configured } = await import("@/lib/r2.server");
      if (isR2Configured()) {
        const { r2Delete } = await import("@/lib/r2.server");
        await r2Delete(data.bucket as any, data.path);
      }
    } catch (err: any) {
      r2Error = err?.message ?? String(err);
    }

    const { error } = await (supabaseAdmin as any).storage.from(data.bucket).remove([data.path]);
    if (error && !r2Error) throw new Error(error.message);

    return {
      ok: true,
      path: data.path,
      // Surfaced, not swallowed: a moderator must know if the file is still
      // being served from object storage.
      r2_deleted: r2Error === null,
      ...(r2Error
        ? { warning: `Removed from Supabase storage but R2 delete failed: ${r2Error}` }
        : {}),
    };
  });

// ─── get all buckets ─────────────────────────────
export const listStorageBuckets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMediaStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: buckets, error } = await (supabaseAdmin as any).storage.listBuckets();

    if (error) throw new Error(error.message);

    return (buckets ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      public: b.public,
    }));
  });
