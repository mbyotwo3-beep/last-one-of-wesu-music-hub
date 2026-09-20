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
 * @param url Remote audio URL (signed Supabase URL) or file:// URI
 * @param isUrl Pass true for remote URLs AND file:// URIs (per plugin docs)
 * @param metadata Notification / lock-screen metadata (requires configure())
 */
export interface NativeTrackMetadata {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
}

export async function preloadNative(
  id: string,
  url: string,
  isUrl = true,
  metadata?: NativeTrackMetadata | null,
): Promise<boolean> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.preload({
      assetId: id,
      assetPath: url,
      audioChannelNum: 1,
      isUrl,
      ...(metadata ? { notificationMetadata: metadata } : null),
    });
    return true;
  } catch {
    // Plugin absent, unsupported, or preload failed — fall through to HTMLAudioElement
    return false;
  }
}

/**
 * One-time plugin setup for music-app behavior: background playback,
 * notification / lock-screen controls, and audio-focus handling.
 * Safe to call repeatedly — configures at most once per page load.
 */
let _configured: boolean | null = null;

export async function configureNativeAudio(): Promise<boolean> {
  if (_configured !== null) return _configured;
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.configure({
      background: true,
      showNotification: true,
      focus: true,
    });
    _configured = true;
  } catch {
    _configured = false;
  }
  return _configured;
}

/** Test-only reset for the configure once-guard. */
export function __resetNativeAudioConfig() {
  _configured = null;
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
 * Large files are written in ~0.75MB base64 chunks: a single giant bridge
 * call can stall or fail on low-end devices.
 *
 * NOTE for the mobile build: register @capacitor/filesystem in the native
 * project (npx cap sync) or staging silently returns null and offline
 * playback falls back to an error prompting re-download.
 */
const STAGE_DIR = "wesu-offline";
const STAGE_CHUNK = 768 * 1024;

export async function stageNativeOfflineFile(
  songId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<{ uri: string; path: string } | null> {
  try {
    const Filesystem = filesystemPlugin();
    if (!Filesystem) return null;
    const path = `${STAGE_DIR}/${songId}.${guessOfflineExt(mime)}`;
    const b64 = arrayBufferToBase64(bytes);
    if (typeof Filesystem.appendFile === "function" && b64.length > STAGE_CHUNK) {
      // Start clean: never append onto a leftover partial file.
      await Filesystem.deleteFile({ path, directory: "CACHE" }).catch(() => {});
      await Filesystem.writeFile({
        path,
        data: b64.slice(0, STAGE_CHUNK),
        directory: "CACHE",
        recursive: true,
      });
      for (let i = STAGE_CHUNK; i < b64.length; i += STAGE_CHUNK) {
        await Filesystem.appendFile({
          path,
          data: b64.slice(i, i + STAGE_CHUNK),
          directory: "CACHE",
        });
      }
    } else {
      await Filesystem.writeFile({
        path,
        data: b64,
        directory: "CACHE",
        recursive: true,
      });
    }
    const { uri } = await Filesystem.getUri({ path, directory: "CACHE" });
    if (!uri) return null;
    return { uri, path };
  } catch {
    return null;
  }
}

/**
 * Delete orphaned staged files (e.g. left by an app kill mid-track).
 * Runs once at engine startup; the engine re-stages on demand, so wiping
 * the whole staging dir is always safe. The cache dir is expendable.
 */
export async function cleanupStaleNativeTempFiles(): Promise<void> {
  try {
    const Filesystem = filesystemPlugin();
    if (!Filesystem || typeof Filesystem.readdir !== "function") return;
    const listing = await Filesystem.readdir({ path: STAGE_DIR, directory: "CACHE" });
    const files: unknown[] = listing?.files ?? [];
    await Promise.all(
      files.map((f) => {
        const name = typeof f === "string" ? f : (f as { name?: string })?.name;
        if (!name) return Promise.resolve();
        return Filesystem.deleteFile({ path: `${STAGE_DIR}/${name}`, directory: "CACHE" }).catch(
          () => {},
        );
      }),
    );
  } catch {
    /* ignore */
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
  markNativeCommand();
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.play({ assetId: id });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resume a paused native audio asset (pause → play via notification or UI).
 */
export async function resumeNative(id: string): Promise<boolean> {
  markNativeCommand();
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.resume({ assetId: id });
    return true;
  } catch {
    return playNative(id);
  }
}

/**
 * Pause native audio playback.
 */
export async function pauseNative(id: string): Promise<void> {
  markNativeCommand();
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.pause({ assetId: id });
  } catch {
    // Silently ignore — HTMLAudioElement fallback handles this
  }
}

/** Seek the native asset (seconds). No-op on failure. */
export async function seekNative(id: string, seconds: number): Promise<void> {
  markNativeCommand();
  if (!Number.isFinite(seconds) || seconds < 0) return;
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    await NativeAudio.setCurrentTime({ assetId: id, time: seconds });
  } catch {
    /* fallback element handles web */
  }
}

/** Volume 0..1 for the native asset. No-op on failure. */
export async function setNativeVolume(id: string, volume: number): Promise<void> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const v = Math.max(0, Math.min(1, Number(volume) || 0));
    await NativeAudio.setVolume({ assetId: id, volume: v });
  } catch {
    /* ignore */
  }
}

/** Duration in seconds, or null when unknown/unavailable. */
export async function getNativeDuration(id: string): Promise<number | null> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const { duration } = await NativeAudio.getDuration({ assetId: id });
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

/** Current position in seconds, or null when unknown/unavailable. */
export async function getNativeCurrentTime(id: string): Promise<number | null> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const { currentTime } = await NativeAudio.getCurrentTime({ assetId: id });
    return Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : null;
  } catch {
    return null;
  }
}

/** Whether the native asset is currently playing. Null when unknowable. */
export async function isNativePlaying(id: string): Promise<boolean | null> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const { isPlaying } = await NativeAudio.isPlaying({ assetId: id });
    return typeof isPlaying === "boolean" ? isPlaying : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to native position updates (~100ms while playing).
 * Only fires the callback for the matching asset id.
 */
export async function onNativeTimeUpdate(
  assetId: string,
  callback: (seconds: number) => void,
): Promise<() => void> {
  try {
    const { NativeAudio } = await import("@capgo/native-audio");
    const handle = await NativeAudio.addListener("currentTime", (event: any) => {
      if (!event || event.assetId === undefined || event.assetId === assetId) {
        const t = Number(event?.currentTime);
        if (Number.isFinite(t) && t >= 0) callback(t);
      }
    });
    return () => handle.remove();
  } catch {
    return () => {};
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
 * Proves a registered runtime plugin (not just a resolvable npm import, which
 * is also true on desktop browsers where no native runtime exists).
 */
export async function isNativeAudioAvailable(): Promise<boolean> {
  try {
    if (typeof window === "undefined") return false;
    const registered = (window as any).Capacitor?.Plugins?.NativeAudio;
    if (!registered) return false;
    const { NativeAudio } = await import("@capgo/native-audio");
    return !!NativeAudio;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Store ↔ native bridges (module-level so the zustand store, which owns
// seek/toggle semantics, can drive the native engine without importing UI).
// ---------------------------------------------------------------------------

type SeekHook = ((seconds: number) => void) | null;
let seekHook: SeekHook = null;

/** PlayerBar registers this; the store calls it on every seek so the native
 *  engine follows HTMLAudioElement semantics. No-op on web. */
export function setNativeSeekHook(hook: SeekHook) {
  seekHook = hook;
}

/** Store entry point: mirror a seek onto the native engine when active. */
export function emitNativeSeek(seconds: number) {
  try {
    seekHook?.(seconds);
  } catch {
    /* never break the store for native */
  }
}

let lastNativeCommandAt = 0;

/** Stamp every JS-initiated native command so the remote-control reconciler
 *  can tell "user pressed pause in-app" from "user pressed pause on the
 *  lock screen". */
export function markNativeCommand() {
  lastNativeCommandAt = Date.now();
}

export function getLastNativeCommandAt(): number {
  return lastNativeCommandAt;
}

/** Test-only reset for command timestamps. */
export function __resetNativeCommandClock() {
  lastNativeCommandAt = 0;
}

/**
 * Pure reconciler decision: should the JS store adopt the native player's
 * truth? Returns true only when they genuinely disagree AND enough time has
 * passed since the last in-app command (so our own play/pause/seek round
 * trip can't flap the UI). Unknown native state (null) never syncs.
 */
export function shouldSyncPlaying(
  storePlaying: boolean,
  nativePlaying: boolean | null,
  nowMs = Date.now(),
  commandAt = lastNativeCommandAt,
  graceMs = 2000,
): boolean {
  if (nativePlaying === null) return false;
  if (nativePlaying === storePlaying) return false;
  return nowMs - commandAt >= graceMs;
}

/** Build lock-screen/notification metadata from a player track. */
export function buildNotificationMetadata(track: {
  title: string;
  artistName: string;
  albumTitle?: string | null;
  artworkUrl?: string | null;
}): NativeTrackMetadata {
  return {
    title: track.title,
    artist: track.artistName,
    ...(track.albumTitle ? { album: track.albumTitle } : null),
    ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : null),
  };
}
