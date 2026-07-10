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
export async function preloadNative(id: string, url: string): Promise<boolean> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.preload({
      assetId: id,
      assetPath: url,
      audioChannelNum: 1,
      isUrl: true,
    });
    return true;
  } catch {
    // Plugin absent, unsupported, or preload failed — fall through to HTMLAudioElement
    return false;
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
 * Returns a cleanup function to remove the listener.
 */
export async function onNativeComplete(callback: () => void): Promise<() => void> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const handle = await NativeAudio.addListener("complete", callback);
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
