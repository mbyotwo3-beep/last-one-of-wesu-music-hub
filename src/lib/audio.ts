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

// Resolved-audio-URL cache: a replay, a queue resume or a Next-skip must not
// pay the sign round trip again. Keys are scoped to the listener — an
// anonymous preview must never be served to a logged-in owner (and vice
// versa) after login/logout. The map is mirrored to localStorage so a cold
// start (the APK WebView reloading the site every launch) resumes the last
// queue with zero URL round trips while the server-side signature is valid.
interface CachedUrl {
  url: string;
  previewMode: boolean;
  expiresAt: number;
}

const audioUrlCache = new Map<string, CachedUrl>();

const cacheKey = (userId: string | null, songId: string) => `${userId ?? "anon"}:${songId}`;

/**
 * How long a resolved URL may be REUSED, per kind. Deliberately a little
 * SHORTER than the server-side signature (300s preview / 3600s full) so a
 * cached URL is never expired by the time it plays. The old 15-minute full
 * TTL re-paid the round trip for URLs that were still perfectly valid —
 * every song replayed after 15 minutes stalled on the network for nothing.
 */
export function audioUrlTtlMs(previewMode: boolean): number {
  return previewMode ? 280_000 : 3_300_000;
}

// --- localStorage mirror (kept on the phone so the next load is fast) ------
const AUDIO_URL_STORE_KEY = "wesu:audio-url-cache";
const AUDIO_URL_PERSIST_MAX = 40;

function persistAudioUrlCache(): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    // Map iteration order is insertion order and set() refreshes it, so the
    // tail is the most recently used — keep that end.
    const entries = [...audioUrlCache.entries()]
      .filter(([, v]) => v.expiresAt > now)
      .slice(-AUDIO_URL_PERSIST_MAX)
      .map(([k, v]) => ({ k, ...v }));
    window.localStorage.setItem(AUDIO_URL_STORE_KEY, JSON.stringify({ v: 1, entries }));
  } catch {
    /* quota / private mode — the in-memory map still works */
  }
}

/** Re-read the localStorage mirror into memory (init + tests). */
export function hydrateAudioUrlCache(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(AUDIO_URL_STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      entries?: { k: string; url: string; previewMode: boolean; expiresAt: number }[];
    };
    if (!Array.isArray(parsed?.entries)) return;
    const now = Date.now();
    for (const e of parsed.entries) {
      if (!e || typeof e.k !== "string" || typeof e.url !== "string" || e.url.length === 0) continue;
      if (typeof e.expiresAt !== "number" || e.expiresAt <= now) continue;
      audioUrlCache.set(e.k, {
        url: e.url,
        previewMode: e.previewMode === true,
        expiresAt: e.expiresAt,
      });
    }
  } catch {
    /* corrupt mirror — ignore; the next set rewrites it */
  }
}

/** Test seam: drop everything (memory + persisted mirror). */
export function __resetAudioUrlCacheForTests(): void {
  audioUrlCache.clear();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUDIO_URL_STORE_KEY);
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") hydrateAudioUrlCache();

export function getCachedAudioUrl(songId: string, userId: string | null): CachedUrl | null {
  const key = cacheKey(userId, songId);
  const cached = audioUrlCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    audioUrlCache.delete(key);
    persistAudioUrlCache();
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
  audioUrlCache.set(cacheKey(userId, songId), {
    url,
    previewMode,
    expiresAt: Date.now() + audioUrlTtlMs(previewMode),
  });
  persistAudioUrlCache();
}

/**
 * Drop a song's cached URLs for BOTH the signed-in and anonymous keys.
 *
 * Needed on any playback failure: a signed URL that returned 403 stays in the
 * cache for its full TTL, so without evicting it every retry replays the same
 * dead URL and the track is unrecoverable until the app restarts.
 */
export function evictCachedAudioUrlForUser(songId: string, userId: string | null): void {
  audioUrlCache.delete(cacheKey(userId, songId));
  audioUrlCache.delete(cacheKey(null, songId));
  persistAudioUrlCache();
}

/** Drop cached URLs for a song (e.g. right after purchase unlocks the full track). */
export function evictCachedAudioUrl(songId: string): void {
  for (const key of audioUrlCache.keys()) {
    if (key.endsWith(`:${songId}`)) audioUrlCache.delete(key);
  }
  persistAudioUrlCache();
}

export type PreviewCapAction = "advance" | "replay" | "wait" | "idle";

/**
 * Pure: what should the 15s preview cap do right now? Advances only once
 * the listener actually HEARD the cap (engine-mirrored progress) — a bare
 * wall-clock used to skip unheard previews on slow networks that were still
 * buffering at 15s. (unit-tested)
 */
export function previewCapDecision(args: {
  playing: boolean;
  heardSeconds: number;
  elapsedMs: number;
  repeatOne: boolean;
  capSeconds?: number;
  heardThreshold?: number;
  giveUpMs?: number;
}): PreviewCapAction {
  const { playing, heardSeconds, elapsedMs, repeatOne } = args;
  const cap = args.capSeconds ?? 15;
  const heardAt = args.heardThreshold ?? Math.max(0, cap - 2);
  const giveUp = args.giveUpMs ?? 120_000;
  if (!playing) return "idle";
  if (heardSeconds >= heardAt) return repeatOne ? "replay" : "advance";
  if (elapsedMs > giveUp) return "advance";
  return "wait";
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
