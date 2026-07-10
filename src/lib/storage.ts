import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a File to a private Supabase storage bucket and return the stored path.
 * Path layout: <user_id>/<timestamp>-<safe-name>
 */
export async function uploadFileToBucket(
  bucket: "song-audio" | "album-art" | "artist-images" | "user-avatars",
  userId: string,
  file: File,
): Promise<string> {
  console.log("[Storage] Upload starting:", {
    bucket,
    userId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  });

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}-${safe}`;
  
  console.log("[Storage] Generated path:", path);
  
  const uploadStart = Date.now();
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  
  const uploadDuration = Date.now() - uploadStart;
  
  if (error) {
    console.error("[Storage] Upload failed:", {
      error,
      errorMessage: error.message,
      bucket,
      path,
      duration: uploadDuration
    });
    throw new Error(error.message);
  }
  
  console.log("[Storage] Upload successful:", {
    path,
    data,
    duration: uploadDuration
  });
  
  return path;
}
