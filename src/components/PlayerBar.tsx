import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Heart,
  Music2,
  Loader2,
  Radio,
  X,
  Maximize2,
  Minimize2,
  Repeat,
  Shuffle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/stores/player";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { getSignedAudioUrl, getPublicAudioUrl, getPreviewAudioUrl, incrementPlayCount } from "@/lib/listener.functions";
import { Link } from "@tanstack/react-router";
import { useIsNative } from "@/hooks/use-platform";
import {
  preloadNative,
  playNative,
  pauseNative,
  stopNative,
  onNativeComplete,
  isNativeAudioAvailable,
} from "@/lib/native-audio";

// Singleton audio element — persists across route changes
let _audio: HTMLAudioElement | null = null;
// Track whether native audio plugin is active for the current session
let _nativeAvailable: boolean | null = null;

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = "auto";
    // Expose for NowPlayingScreen seek integration
    (window as any).__wesuAudio = _audio;
  }
  return _audio;
}

export function PlayerBar() {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const liked = usePlayer((s) => s.liked);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleLike = usePlayer((s) => s.toggleLike);
  const setProgress = usePlayer((s) => s.setProgress);

  const { user } = useAuth();
  const isNative = useIsNative();
  const getSignedFn = useServerFn(getSignedAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const incrementFn = useServerFn(incrementPlayCount);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [showAd, setShowAd] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const currentTrackId = useRef<string | null>(null);
  const nativeCleanupRef = useRef<(() => void) | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load audio when track changes
  useEffect(() => {
    if (!track) {
      // Stop both engines
      if (currentTrackId.current) stopNative(currentTrackId.current).catch(() => {});
      getAudio().pause();
      currentTrackId.current = null;
      setLoading(false);
      setIsPreview(false);
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      return;
    }
    if (currentTrackId.current === track.id) return;

    // Stop previous track on native
    if (currentTrackId.current) {
      stopNative(currentTrackId.current).catch(() => {});
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
    }

    currentTrackId.current = track.id;
    setError(null);
    setLoading(true);
    setIsPreview(false);
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    const audio = getAudio();
    audio.pause();
    audio.src = "";

    let retries = 0;
    async function loadUrl() {
      try {
        let url: string;
        let previewMode = false;
        
        if (user) {
          try {
            const res = await getSignedFn({ data: { song_id: track!.id } });
            url = res.url;
          } catch (err) {
            // User doesn't have subscription/purchase, use preview
            const res = await getPreviewFn({ data: { song_id: track!.id } });
            url = res.url;
            previewMode = true;
          }
        } else {
          // Anonymous — use preview
          const res = await getPreviewFn({ data: { song_id: track!.id } });
          url = res.url;
          previewMode = true;
          setShowAd(true);
        }

        setIsPreview(previewMode);

        // Try native audio first on native platform (background audio support)
        if (isNative) {
          if (_nativeAvailable === null) {
            _nativeAvailable = await isNativeAudioAvailable();
          }
          if (_nativeAvailable) {
            const preloaded = await preloadNative(track!.id, url);
            if (preloaded) {
              await playNative(track!.id);
              setLoading(false);
              if (!playing) usePlayer.getState().togglePlay();
              
              // Set preview timer if in preview mode
              if (previewMode) {
                previewTimerRef.current = setTimeout(() => {
                  stopNative(track!.id).catch(() => {});
                  usePlayer.getState().togglePlay();
                  setError("Preview ended. Subscribe or purchase to listen to the full track.");
                }, 15000);
              }
              
              // Wire 'complete' event back to Zustand
              const cleanup = await onNativeComplete(() => {
                usePlayer.getState().setTrack({ ...usePlayer.getState().track!, audioUrl: null });
                if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
                if (track && user && !previewMode) {
                  incrementFn({ data: { song_id: track!.id } }).catch(() => {});
                }
              });
              nativeCleanupRef.current = cleanup;
              return;
            }
          }
        }

        // HTMLAudioElement fallback
        audio.src = url;
        audio.volume = volume;
        await audio.play();
        setLoading(false);
        if (!playing) usePlayer.getState().togglePlay(); // sync store
        
        // Set preview timer if in preview mode
        if (previewMode) {
          previewTimerRef.current = setTimeout(() => {
            audio.pause();
            usePlayer.getState().togglePlay();
            setError("Preview ended. Subscribe or purchase to listen to the full track.");
          }, 15000);
        }
      } catch (err) {
        if (retries < 2) {
          retries++;
          await new Promise((r) => setTimeout(r, 1000));
          return loadUrl();
        }
        setLoading(false);
        setError((err as Error).message);
        if (playing) usePlayer.getState().togglePlay(); // sync store to paused
      }
    }
    loadUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  // Sync playing state — handle both native and HTML audio
  useEffect(() => {
    const audio = getAudio();
    if (!track) return;

    async function syncPlayState() {
      if (!track) return;
      // If native is active, delegate to native
      if (isNative && _nativeAvailable && nativeCleanupRef.current) {
        if (playing) {
          await playNative(track.id).catch(() => {});
        } else {
          await pauseNative(track.id).catch(() => {});
        }
        return;
      }
      // HTMLAudioElement fallback
      if (playing && audio.paused && audio.src) {
        audio.play().catch(() => {});
      } else if (!playing && !audio.paused) {
        audio.pause();
      }
    }
    syncPlayState();
  }, [playing, track, isNative]);

  // Progress tracking
  useEffect(() => {
    const audio = getAudio();
    const onTimeUpdate = () => setProgress(Math.floor(audio.currentTime));
    const onEnded = () => {
      usePlayer.getState().setTrack({ ...usePlayer.getState().track!, audioUrl: null }); // mark ended
      if (playing) usePlayer.getState().togglePlay();
      if (track && user) {
        incrementFn({ data: { song_id: track.id } }).catch(() => {});
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  // Volume
  useEffect(() => {
    getAudio().volume = volume;
  }, [volume]);

  if (!track) return null;

  const dur = track.durationSeconds ?? 0;
  const progress = dur > 0 ? (progressSeconds / dur) * 100 : 0;
  const elapsed = `${Math.floor(progressSeconds / 60)}:${(progressSeconds % 60).toString().padStart(2, "0")}`;
  const durLabel = dur ? `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}` : "—";

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = pct * dur;
    getAudio().currentTime = newTime;
    setProgress(Math.floor(newTime));
  }

  return (
    <>
      {/* Expanded Player View */}
      {isExpanded && (
        <div className="fixed inset-0 bg-gradient-to-b from-background to-background/95 z-[100] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6">
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Minimize player"
            >
              <Minimize2 className="size-6" />
            </button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Now Playing</p>
            </div>
            <button
              onClick={() => {
                usePlayer.getState().exitSong();
                setIsExpanded(false);
              }}
              className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Exit song"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Album Art */}
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="aspect-square max-w-md w-full rounded-lg overflow-hidden shadow-2xl bg-card">
              {track.coverUrl ? (
                <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music2 className="size-24 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* Track Info & Controls */}
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                <p className="text-lg text-muted-foreground truncate">{track.artistName}</p>
              </div>
              {user && (
                <button
                  onClick={toggleLike}
                  className="shrink-0 ml-4"
                  aria-label={liked ? "Unlike" : "Like"}
                >
                  <Heart
                    className={`size-6 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`}
                  />
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div
                className="h-1.5 bg-muted rounded-full relative overflow-hidden cursor-pointer"
                onClick={seek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={progressSeconds}
                aria-label="Seek"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{elapsed}</span>
                <span>{durLabel}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-8">
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Shuffle"
              >
                <Shuffle className="size-5" />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Previous"
              >
                <SkipBack className="size-6" />
              </button>
              <button
                onClick={() => {
                  if (!loading && !error) togglePlay();
                }}
                disabled={loading || !!error}
                className="bg-foreground text-background p-4 rounded-full hover:scale-105 transition-transform disabled:opacity-30"
                aria-label={playing ? "Pause" : "Play"}
              >
                {loading ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : playing ? (
                  <Pause className="size-6" />
                ) : (
                  <Play className="size-6 ml-0.5" />
                )}
              </button>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Next"
              >
                <SkipForward className="size-6" />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Repeat"
              >
                <Repeat className="size-5" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3">
              <Volume2 className="size-5 text-muted-foreground" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label="Volume"
              />
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </div>
        </div>
      )}

      {/* Mini Player Bar */}
      <div
        className="fixed bottom-0 inset-x-0 bg-obsidian/95 backdrop-blur-xl border-t border-white/10 z-50 cursor-pointer"
        onClick={() => setIsExpanded(true)}
      >
        {/* Ad banner for anonymous / free users */}
        {showAd && !user && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-primary/10 border-b border-primary/20 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Radio className="size-3 text-primary" />
              You're listening with ads.
            </span>
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Sign up free to save music →
            </Link>
          </div>
        )}

        {/* Preview banner */}
        {isPreview && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs">
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Radio className="size-3" />
              15-second preview
            </span>
            <Link to="/checkout" className="font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              Subscribe for full access →
            </Link>
          </div>
        )}

        <div className="max-w-7xl mx-auto h-20 px-6 flex items-center justify-between gap-4">
          {/* Track info */}
          <div className="flex items-center gap-4 w-1/3 min-w-0">
            <div className="size-12 rounded-md overflow-hidden bg-card shrink-0 ring-1 ring-white/10 flex items-center justify-center">
              {track.coverUrl ? (
                <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
              ) : (
                <Music2 className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-sm font-medium truncate">{track.title}</p>
              <p className="text-xs text-muted-foreground truncate">{track.artistName}</p>
            </div>
            {user && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike();
                }}
                className="hidden sm:block shrink-0"
                aria-label={liked ? "Unlike" : "Like"}
              >
                <Heart
                  className={`size-4 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`}
                />
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-1 w-1/3">
            <div className="flex items-center gap-6">
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Previous"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!loading && !error) togglePlay();
                }}
                disabled={loading || !!error}
                className="bg-foreground text-obsidian p-2.5 rounded-full hover:scale-105 transition-transform disabled:opacity-30"
                aria-label={playing ? "Pause" : "Play"}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4 ml-0.5" />
                )}
              </button>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Next"
              >
                <SkipForward className="size-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="w-full flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                {elapsed}
              </span>
              <div
                className="flex-1 h-1 bg-muted rounded-full relative overflow-hidden cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  seek(e);
                }}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={progressSeconds}
                aria-label="Seek"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                {durLabel}
              </span>
            </div>

            {error && <p className="text-[10px] text-destructive truncate max-w-xs">{error}</p>}
          </div>

          {/* Volume & Exit */}
          <div className="flex items-center justify-end gap-4 w-1/3">
            <div className="flex items-center gap-3">
              <Volume2 className="size-4 text-muted-foreground shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 accent-primary hidden sm:block"
                aria-label="Volume"
              />
            </div>
            {track && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  usePlayer.getState().exitSong();
                }}
                className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Exit song"
                title="Exit song"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
