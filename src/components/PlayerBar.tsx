import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  Loader2,
  Radio,
  X,
  Maximize2,
  Minimize2,
  Repeat,
  Repeat1,
  Shuffle,
  ListMusic,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import {
  getSignedAudioUrl,
  getPublicAudioUrl,
  getPreviewAudioUrl,
  incrementPlayCount,
} from "@/lib/listener.functions";
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

let _audio: HTMLAudioElement | null = null;
let _nativeAvailable: boolean | null = null;

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = "auto";
    (window as any).__wesuAudio = _audio;
  }
  return _audio;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar({ audioOnly = false }: { audioOnly?: boolean } = {}) {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const liked = usePlayer((s) => s.liked);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleLike = usePlayer((s) => s.toggleLike);
  const setProgress = usePlayer((s) => s.setProgress);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const skipNext = usePlayer((s) => s.skipNext);
  const skipPrev = usePlayer((s) => s.skipPrev);

  const { user } = useAuth();
  const isNative = useIsNative();
  const getSignedFn = useServerFn(getSignedAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const incrementFn = useServerFn(incrementPlayCount);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const currentTrackId = useRef<string | null>(null);
  const nativeCleanupRef = useRef<(() => void) | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load audio when track changes
  useEffect(() => {
    if (!track) {
      if (currentTrackId.current) stopNative(currentTrackId.current).catch(() => {});
      getAudio().pause();
      currentTrackId.current = null;
      setLoading(false);
      setIsPreview(false);
      setAudioDuration(0);
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      return;
    }
    if (currentTrackId.current === track.id) return;

    if (currentTrackId.current) {
      stopNative(currentTrackId.current).catch(() => {});
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
    }

    currentTrackId.current = track.id;
    setError(null);
    setLoading(true);
    setIsPreview(false);
    setAudioDuration(0);
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
          } catch {
            const res = await getPreviewFn({ data: { song_id: track!.id } });
            url = res.url;
            previewMode = true;
          }
        } else {
          const res = await getPreviewFn({ data: { song_id: track!.id } });
          url = res.url;
          previewMode = true;
          setShowAd(true);
        }

        setIsPreview(previewMode);

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
              if (previewMode) {
                previewTimerRef.current = setTimeout(() => {
                  stopNative(track!.id).catch(() => {});
                  usePlayer.getState().togglePlay();
                  setError("Preview ended. Subscribe or purchase for full track.");
                }, 15000);
              }
              const cleanup = await onNativeComplete(() => {
                if (usePlayer.getState().repeat === "one") {
                  playNative(track!.id).catch(() => {});
                  return;
                }
                usePlayer.getState().skipNext();
                if (track && user && !previewMode) {
                  incrementFn({ data: { song_id: track!.id } }).catch(() => {});
                }
              });
              nativeCleanupRef.current = cleanup;
              return;
            }
          }
        }

        audio.src = url;
        audio.volume = muted ? 0 : volume;
        await audio.play();
        setLoading(false);
        if (!playing) usePlayer.getState().togglePlay();

        if (previewMode) {
          previewTimerRef.current = setTimeout(() => {
            audio.pause();
            usePlayer.getState().togglePlay();
            setError("Preview ended. Subscribe or purchase for full track.");
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
        if (playing) usePlayer.getState().togglePlay();
      }
    }
    loadUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  // Sync playing state
  useEffect(() => {
    const audio = getAudio();
    if (!track) return;
    async function syncPlayState() {
      if (!track) return;
      if (isNative && _nativeAvailable && nativeCleanupRef.current) {
        if (playing) await playNative(track.id).catch(() => {});
        else await pauseNative(track.id).catch(() => {});
        return;
      }
      if (playing && audio.paused && audio.src) audio.play().catch(() => {});
      else if (!playing && !audio.paused) audio.pause();
    }
    syncPlayState();
  }, [playing, track, isNative]);

  // Progress + duration + ended
  useEffect(() => {
    const audio = getAudio();
    const onTimeUpdate = () => setProgress(Math.floor(audio.currentTime));
    const onMeta = () => setAudioDuration(audio.duration || 0);
    const onEnded = () => {
      const st = usePlayer.getState();
      if (track && user && !isPreview) {
        incrementFn({ data: { song_id: track.id } }).catch(() => {});
      }
      if (st.repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      st.skipNext();
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, isPreview]);

  // Volume
  useEffect(() => {
    getAudio().volume = muted ? 0 : volume;
  }, [volume, muted]);

  if (audioOnly) return null;
  if (!track) return null;

  const dur = audioDuration || track.durationSeconds || 0;
  const progressPct = dur > 0 ? (progressSeconds / dur) * 100 : 0;

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * dur;
    getAudio().currentTime = newTime;
    setProgress(Math.floor(newTime));
  }

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      {/* Expanded Now Playing (mobile-style overlay, reused on desktop when expanded) */}
      {isExpanded && (
        <div className="fixed inset-0 bg-gradient-to-b from-background to-background/95 z-[100] flex flex-col">
          <div className="flex items-center justify-between p-6">
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Minimize player"
            >
              <Minimize2 className="size-6" />
            </button>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Now Playing</p>
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
          <div className="flex-1 flex items-center justify-center px-8">
            <StorageImage
              bucket="album-art"
              path={track.coverUrl}
              alt={track.title}
              className="aspect-square max-w-md w-full rounded-lg overflow-hidden shadow-2xl bg-card object-cover"
            />
          </div>
          <div className="p-6 space-y-6 max-w-md mx-auto w-full">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                <p className="text-lg text-muted-foreground truncate">{track.artistName}</p>
              </div>
              {user && (
                <button onClick={toggleLike} className="shrink-0 ml-4" aria-label={liked ? "Unlike" : "Like"}>
                  <Heart className={`size-6 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
              )}
            </div>
            <div className="space-y-2">
              <div
                className="h-1.5 bg-muted rounded-full relative overflow-hidden cursor-pointer group"
                onClick={seek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={progressSeconds}
                aria-label="Seek"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{fmt(progressSeconds)}</span>
                <span>{fmt(dur)}</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={toggleShuffle}
                className={`transition-colors ${shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Shuffle"
              >
                <Shuffle className="size-5" />
              </button>
              <button onClick={skipPrev} className="text-muted-foreground hover:text-foreground" aria-label="Previous">
                <SkipBack className="size-6" />
              </button>
              <button
                onClick={() => !loading && !error && togglePlay()}
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
              <button onClick={skipNext} className="text-muted-foreground hover:text-foreground" aria-label="Next">
                <SkipForward className="size-6" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`transition-colors ${repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Repeat"
              >
                {repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={toggleMute} aria-label="Mute">
                <VolIcon className="size-5 text-muted-foreground" />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label="Volume"
              />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </div>
        </div>
      )}

      {/* Desktop Spotify-style bar */}
      <div className="fixed bottom-0 inset-x-0 bg-obsidian/95 backdrop-blur-xl border-t border-white/10 z-50">
        {showAd && !user && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-primary/10 border-b border-primary/20 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Radio className="size-3 text-primary" /> You're listening with ads.
            </span>
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Sign up free →
            </Link>
          </div>
        )}
        {isPreview && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs">
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <Radio className="size-3" /> 15-second preview
            </span>
            <Link to="/checkout" className="font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              Subscribe for full access →
            </Link>
          </div>
        )}

        <div className="h-20 px-4 grid grid-cols-3 items-center gap-4">
          {/* Left: Track info */}
          <div className="flex items-center gap-3 min-w-0">
            <StorageImage
              bucket="album-art"
              path={track.coverUrl}
              alt={track.title}
              className="size-14 rounded-md overflow-hidden bg-card shrink-0 ring-1 ring-white/10 object-cover cursor-pointer"
              onClick={() => setIsExpanded(true)}
            />
            <div className="min-w-0 overflow-hidden">
              <p className="text-sm font-medium truncate hover:underline cursor-pointer" onClick={() => setIsExpanded(true)}>
                {track.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">{track.artistName}</p>
            </div>
            {user && (
              <button
                onClick={toggleLike}
                className="ml-2 shrink-0 p-1.5 rounded-full hover:bg-white/5"
                aria-label={liked ? "Unlike" : "Like"}
              >
                <Heart className={`size-4 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              </button>
            )}
          </div>

          {/* Center: Controls + progress */}
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleShuffle}
                className={`transition-colors ${shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Shuffle"
                title="Shuffle"
              >
                <Shuffle className="size-4" />
              </button>
              <button
                onClick={skipPrev}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Previous"
                title="Previous"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                onClick={() => !loading && !error && togglePlay()}
                disabled={loading || !!error}
                className="bg-foreground text-obsidian p-2 rounded-full hover:scale-105 transition-transform disabled:opacity-30"
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
                onClick={skipNext}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Next"
                title="Next"
              >
                <SkipForward className="size-4" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`transition-colors ${repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Repeat"
                title={`Repeat: ${repeat}`}
              >
                {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
              </button>
            </div>
            <div className="w-full flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                {fmt(progressSeconds)}
              </span>
              <div
                className="flex-1 h-1 bg-muted rounded-full relative overflow-hidden cursor-pointer group"
                onClick={seek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={progressSeconds}
                aria-label="Seek"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-foreground group-hover:bg-primary transition-colors"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progressPct}% - 6px)` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums w-8">{fmt(dur)}</span>
            </div>
            {error && <p className="text-[10px] text-destructive truncate max-w-md">{error}</p>}
          </div>

          {/* Right: Queue, volume, expand */}
          <div className="flex items-center justify-end gap-3">
            <Link
              to="/library"
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-white/5"
              aria-label="Queue"
              title="Your library"
            >
              <ListMusic className="size-4" />
            </Link>
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground" aria-label="Mute">
                <VolIcon className="size-4" />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-24 accent-primary"
                aria-label="Volume"
              />
            </div>
            <button
              onClick={() => setIsExpanded(true)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-white/5"
              aria-label="Expand"
              title="Now playing"
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              onClick={() => usePlayer.getState().exitSong()}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-white/5"
              aria-label="Close"
              title="Close player"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
