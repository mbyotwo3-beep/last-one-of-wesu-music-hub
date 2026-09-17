/**
 * Native audio helper using @capgo/native-audio.
 * Enables background audio playback on Android/iOS.
 * Falls back silently to HTMLAudioElement if the plugin is unavailable.
 *
 * Feature: wesu-plus-completion
 * Validates: Requirements 16.1, 16.2, 16.5
 */

/**
 * Preload an audio track by URL using the native audio plugin.
 * Errors are caught silently — the caller should fall back to HTMLAudioElement.
 *
 * @param id  Unique asset identifier (e.g. song id)
 * @param url Remote audio URL (signed Supabase URL)
 */
export async function preloadNative(id: string, url: string, isUrl = true): Promise<boolean> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.preload({
      assetId: id,
      assetPath: url,
      audioChannelNum: 1,
      isUrl,
    });
    return true;
  } catch {
    // Plugin absent, unsupported, or preload failed — fall through to HTMLAudioElement
    return false;
  }
}

function guessOfflineExt(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("m4a") || m.includes("mp4")) return "m4a";
  if (m.includes("flac")) return "flac";
  return "mp3";
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

/**
 * Stage decrypted vault bytes as an APP-PRIVATE temp file for the native
 * audio plugin (which cannot play Blob URLs). The file lives in the app's
 * sandboxed cache dir — invisible to other apps and music players — and the
 * caller must delete it via deleteNativeTempFile when the track changes.
 * Returns the file URI, or null when the Filesystem plugin is unavailable.
 *
 * NOTE for the mobile build: register @capacitor/filesystem in the native
 * project (npx cap sync) or staging silently returns null and offline
 * playback falls back to an error prompting re-download.
 */
export async function stageNativeOfflineFile(
  songId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<{ uri: string; path: string } | null> {
  try {
    const Filesystem = filesystemPlugin();
    if (!Filesystem) return null;
    const path = `wesu-offline/${songId}.${guessOfflineExt(mime)}`;
    await Filesystem.writeFile({
      path,
      data: arrayBufferToBase64(bytes),
      directory: "CACHE",
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: "CACHE" });
    if (!uri) return null;
    return { uri, path };
  } catch {
    return null;
  }
}

/**
 * Read one vault track and stage it for the native plugin in a single step.
 * Returns null when nothing is downloaded (or the copy is corrupt).
 */
export async function prepareNativeOfflineTrack(
  songId: string,
): Promise<{ uri: string; path: string } | null> {
  try {
    const { readVaultTrack } = await import("./offline-vault");
    const track = await readVaultTrack(songId);
    if (!track) return null;
    return await stageNativeOfflineFile(songId, track.bytes, track.mime);
  } catch {
    return null;
  }
}

/**
 * The Capacitor Filesystem plugin via the runtime bridge (no npm import, so
 * the web bundle never tries to resolve it). Null on web / when unregistered.
 */
function filesystemPlugin(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).Capacitor?.Plugins?.Filesystem ?? null;
}

/** Delete a staged temp file (best effort — the cache dir is expendable). */
export async function deleteNativeTempFile(path: string | null): Promise<void> {
  if (!path) return;
  try {
    const Filesystem = filesystemPlugin();
    if (!Filesystem) return;
    await Filesystem.deleteFile({ path, directory: "CACHE" });
  } catch {
    /* already gone — ignore */
  }
}

/**
 * Play a preloaded native audio asset.
 * Returns true on success, false if plugin is unavailable or asset not loaded.
 */
export async function playNative(id: string): Promise<boolean> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.play({ assetId: id });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pause native audio playback.
 */
export async function pauseNative(id: string): Promise<void> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.pause({ assetId: id });
  } catch {
    // Silently ignore — HTMLAudioElement fallback handles this
  }
}

/**
 * Stop and unload a native audio asset.
 */
export async function stopNative(id: string): Promise<void> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.stop({ assetId: id });
    await NativeAudio.unload({ assetId: id });
  } catch {
    // Silently ignore
  }
}

/**
 * Register a listener for when native audio playback completes.
 * Only fires for the given asset id — a stale listener from a skipped track
 * must never advance the queue. If the plugin payload carries no asset id,
 * the callback still fires (backward compatible).
 * Returns a cleanup function to remove the listener.
 */
export async function onNativeComplete(assetId: string, callback: () => void): Promise<() => void> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const handle = await NativeAudio.addListener("complete", (event: any) => {
      if (!event || event.assetId === undefined || event.assetId === assetId) {
        callback();
      }
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}

/**
 * Check if the @capgo/native-audio plugin is available in the current environment.
 */
export async function isNativeAudioAvailable(): Promise<boolean> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    // If the import succeeds and the plugin object exists, it's available
    return !!NativeAudio;
  } catch {
    return false;
  }
}
