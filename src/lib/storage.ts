import { signUploadUrl, type MediaBucketName } from "@/lib/media.functions";

/**
 * Upload a File straight to Cloudflare R2 or Supabase storage using a short-lived presigned PUT
 * URL minted by the server, and return the stored path.
 * Path layout: <folder>/<timestamp>-<safe-name> (defaults to user_id folder)
 */
export async function uploadFileToBucket(
  bucket: MediaBucketName,
  folder: string,
  file: File,
): Promise<string> {
  const { url, path, provider } = await signUploadUrl({ 
    data: { bucket, filename: file.name, folder } 
  });

  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: file.type ? { "content-type": file.type } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}). Please try again.`);
  }

  return path;
}
