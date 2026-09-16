// ─── Audio Engine & Browser Playback Activation ─────────────────
// Ensures all Play buttons across the app can play audio immediately
// without being blocked by browser Autoplay / User-Activation policies.

const SILENT_AUDIO =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let _audio: HTMLAudioElement | null = null;

export function getAudio(): HTMLAudioElement {
  if (typeof window === "undefined") return null as any;
  if (!_audio) {
    if ((window as any).__wesuAudio) {
      _audio = (window as any).__wesuAudio;
    } else {
      _audio = new Audio();
      _audio.preload = "auto";
      _audio.crossOrigin = "anonymous";
      (window as any).__wesuAudio = _audio;
    }
  }
  return _audio!;
}

/**
 * Primes and unlocks the audio element within a synchronous user interaction
 * (e.g. click or touch on ANY play button in the app).
 * This establishes user activation on the audio pipeline so subsequent
 * async play() calls succeed without "NotAllowedError".
 */
export function primeAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  try {
    const audio = getAudio();
    if (!audio) return null;
    // Real media belongs to the engine (playing state in the store).
    // Priming must NEVER start it: on app open the engine pre-attaches the
    // restored track's URL while paused, and the first tap anywhere
    // (scroll, menu, …) reaches here via the global pointerdown listener —
    // playing the element here is what started songs "on their own".
    // Only the silent placeholder may be played, purely to unlock the
    // pipeline for a later engine-driven play() call.
    if (audio.src && audio.src !== SILENT_AUDIO) {
      return audio;
    }
    if (!audio.src || audio.src === "") {
      audio.src = SILENT_AUDIO;
    }
    const p = audio.play();
    if (p !== undefined) {
      p.catch(() => {});
    }
    return audio;
  } catch {
    return null;
  }
}

// In-memory cache for resolved audio URLs to enable 0ms instant playback on repeat plays.
// Keys are scoped to the listener: an anonymous preview must never be served
// to a logged-in owner (and vice versa) after login/logout.
interface CachedUrl {
  url: string;
  previewMode: boolean;
  expiresAt: number;
}

const audioUrlCache = new Map<string, CachedUrl>();

const cacheKey = (userId: string | null, songId: string) => `${userId ?? "anon"}:${songId}`;

export function getCachedAudioUrl(songId: string, userId: string | null): CachedUrl | null {
  const cached = audioUrlCache.get(cacheKey(userId, songId));
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    audioUrlCache.delete(cacheKey(userId, songId));
    return null;
  }
  return cached;
}

export function setCachedAudioUrl(
  songId: string,
  userId: string | null,
  url: string,
  previewMode: boolean,
): void {
  // Previews are signed for 45s server-side — cache them shorter so a replay
  // re-resolves instead of playing an expired URL. Full URLs live 1h.
  const ttl = previewMode ? 40_000 : 15 * 60 * 1000;
  audioUrlCache.set(cacheKey(userId, songId), {
    url,
    previewMode,
    expiresAt: Date.now() + ttl,
  });
}

/** Drop cached URLs for a song (e.g. right after purchase unlocks the full track). */
export function evictCachedAudioUrl(songId: string): void {
  for (const key of audioUrlCache.keys()) {
    if (key.endsWith(`:${songId}`)) audioUrlCache.delete(key);
  }
}

// Global user interaction listener to prime the audio context on first touch/click anywhere
if (typeof window !== "undefined") {
  const onFirstInteraction = () => {
    primeAudio();
    window.removeEventListener("pointerdown", onFirstInteraction);
    window.removeEventListener("keydown", onFirstInteraction);
  };
  window.addEventListener("pointerdown", onFirstInteraction, { passive: true, once: true });
  window.addEventListener("keydown", onFirstInteraction, { passive: true, once: true });
}
