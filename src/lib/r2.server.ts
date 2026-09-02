import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (S3-compatible) object storage.
 *
 * All uploads live in a single R2 bucket. The logical "bucket" names the app
 * has always used (song-audio, album-art, ...) become key prefixes, so the
 * paths stored in the database do not change:
 *
 *   R2 key = `${logicalBucket}/${storedPath}`
 *
 * The bucket is private: every read is a short-lived presigned GET and every
 * upload is a presigned PUT scoped to the caller's own folder.
 */

export type MediaBucket = "song-audio" | "album-art" | "artist-images" | "user-avatars";

const R2_ENDPOINT = "https://231415d20c628abc20c285627e045eb0.r2.cloudflarestorage.com";
const R2_BUCKET = "wesu";

function credentials() {
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

export function isR2Configured() {
  return credentials() !== null;
}

function client() {
  const creds = credentials();
  if (!creds) throw new Error("R2 storage is not configured");
  return new AwsClient({ ...creds, service: "s3", region: "auto" });
}

export function r2ObjectUrl(bucket: MediaBucket, path: string) {
  const key = `${bucket}/${path}`.replace(/^\/+/, "");
  return `${R2_ENDPOINT}/${R2_BUCKET}/${key
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
}

/** Short-lived presigned GET URL. `download` sets a filename via response headers. */
export async function r2SignedGetUrl(
  bucket: MediaBucket,
  path: string,
  opts: { expiresIn?: number; download?: string } = {},
): Promise<string> {
  const url = new URL(r2ObjectUrl(bucket, path));
  url.searchParams.set("X-Amz-Expires", String(opts.expiresIn ?? 3600));
  if (opts.download) {
    url.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${opts.download.replace(/"/g, "")}"`,
    );
  }
  const signed = await client().sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Short-lived presigned PUT URL the browser uploads directly to. */
export async function r2SignedPutUrl(
  bucket: MediaBucket,
  path: string,
  opts: { expiresIn?: number } = {},
): Promise<string> {
  const url = new URL(r2ObjectUrl(bucket, path));
  url.searchParams.set("X-Amz-Expires", String(opts.expiresIn ?? 900));
  const signed = await client().sign(new Request(url, { method: "PUT" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function r2Put(
  bucket: MediaBucket,
  path: string,
  body: ArrayBuffer | Uint8Array | Blob,
  contentType?: string,
) {
  const res = await client().fetch(r2ObjectUrl(bucket, path), {
    method: "PUT",
    body: body as BodyInit,
    headers: contentType ? { "content-type": contentType } : undefined,
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
}

export async function r2Delete(bucket: MediaBucket, path: string) {
  const res = await client().fetch(r2ObjectUrl(bucket, path), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status})`);
  }
}

export async function r2Exists(bucket: MediaBucket, path: string) {
  try {
    const res = await client().fetch(r2ObjectUrl(bucket, path), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
