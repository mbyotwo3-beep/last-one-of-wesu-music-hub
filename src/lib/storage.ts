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
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { url, path } = await signUploadUrl({ 
    data: { bucket, filename: file.name, folder } 
  });

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    if (file.type) {
      xhr.setRequestHeader("content-type", file.type);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve(path);
      } else {
        reject(new Error(`Upload failed (${xhr.status} ${xhr.statusText || ""}). Please try again.`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during file upload. Please check your connection and try again."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out. Please try again."));
    };

    xhr.onabort = () => {
      reject(new Error("Upload was cancelled."));
    };

    xhr.send(file);
  });
}
