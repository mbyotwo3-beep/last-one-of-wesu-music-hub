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
