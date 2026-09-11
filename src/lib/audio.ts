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
    // If already playing real media, don't interrupt
    if (audio.src && audio.src !== SILENT_AUDIO && !audio.paused) {
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

// In-memory cache for resolved audio URLs to enable 0ms instant playback on repeat plays
interface CachedUrl {
  url: string;
  previewMode: boolean;
  expiresAt: number;
}

const audioUrlCache = new Map<string, CachedUrl>();

export function getCachedAudioUrl(songId: string): CachedUrl | null {
  const cached = audioUrlCache.get(songId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    audioUrlCache.delete(songId);
    return null;
  }
  return cached;
}

export function setCachedAudioUrl(songId: string, url: string, previewMode: boolean): void {
  // Cache for 15 minutes
  audioUrlCache.set(songId, {
    url,
    previewMode,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
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
