import { signUploadUrl, type MediaBucketName } from "@/lib/media.functions";

/**
 * Upload a File straight to Cloudflare R2 using a short-lived presigned PUT
 * URL minted by the server, and return the stored path.
 * Path layout: <user_id>/<timestamp>-<safe-name>
 */
export async function uploadFileToBucket(
  bucket: MediaBucketName,
  _userId: string,
  file: File,
): Promise<string> {
  const { url, path } = await signUploadUrl({ data: { bucket, filename: file.name } });

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
