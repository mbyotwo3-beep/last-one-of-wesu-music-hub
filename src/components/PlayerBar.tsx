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
import { recordPlay } from "@/lib/play-history.functions";
import { Link } from "@tanstack/react-router";
import { useIsNative } from "@/hooks/use-platform";
import { useTrackMeta } from "@/hooks/use-track-meta";
import { useSavedTrack } from "@/hooks/use-saved-track";

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
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const togglePlay = usePlayer((s) => s.togglePlay);
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
  const recordPlayFn = useServerFn(recordPlay);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const isPreview = usePlayer((s) => s.isPreview);
  const setIsPreview = usePlayer((s) => s.setIsPreview);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const currentTrackId = useRef<string | null>(null);
  const nativeCleanupRef = useRef<(() => void) | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { data: meta } = useTrackMeta(track?.id);
  const artistId: string | undefined = meta?.artists?.id ?? meta?.artist_id;
  const albumId: string | undefined = meta?.albums?.id ?? meta?.album_id;
  const trackPrice: number = Number(meta?.price ?? 0);
  const { isSaved: liked, toggle: toggleLike } = useSavedTrack(track?.id);


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

        // Get current access token for entitlement-checked preview of paid tracks.
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sess } = await supabase.auth.getSession();
        const accessToken = sess.session?.access_token ?? null;

        if (user) {
          let signed: { url: string; requiresPurchase?: boolean } | null = null;
          try {
            signed = await getSignedFn({ data: { song_id: track!.id } });
          } catch {
            signed = null;
          }
          if (signed && signed.url && !signed.requiresPurchase) {
            url = signed.url;
          } else {
            const res = await getPreviewFn({ data: { song_id: track!.id, access_token: accessToken } });
            url = res.url;
            previewMode = true;
          }
        } else {
          const res = await getPreviewFn({ data: { song_id: track!.id, access_token: accessToken } });
          url = res.url;
          previewMode = true;
          setShowAd(true);
        }

        // Validate URL is absolute HTTPS/HTTP so the browser can't accidentally
        // resolve a bare filename against the current origin (which caused the
        // OpaqueResponseBlocking errors on wesuplusly.com).
        if (!url || !/^https?:\/\//i.test(url)) {
          throw new Error("Audio unavailable (invalid URL)");
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
                  setError("Preview ended. Buy this track for full access.");

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

        // Attach event-driven loading state so the spinner clears the moment
        // the browser reports the media is ready — not just when play() resolves.
        const cleanupEvents = () => {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("playing", onPlaying);
          audio.removeEventListener("play", onPlay);
          audio.removeEventListener("error", onError);
        };
        const onCanPlay = () => setLoading(false);
        const onPlay = () => setLoading(false);
        const onPlaying = () => {
          setLoading(false);
          // Log the play to build a personalized "Recently Played" shelf.
          if (user && !previewMode) {
            recordPlayFn({ data: { song_id: track!.id, progress_seconds: 0 } }).catch(() => {});
          }
        };
        const onError = () => {
          cleanupEvents();
          setLoading(false);
          setError("Failed to load audio. Please try again.");
          if (usePlayer.getState().playing) usePlayer.getState().togglePlay();
        };
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("error", onError);

        audio.src = url;
        audio.volume = muted ? 0 : volume;
        try {
          await audio.play();
        } catch (playErr) {
          // Autoplay blocked or transient — keep listeners so a subsequent
          // togglePlay from the user still resolves loading via events.
          setLoading(false);
          throw playErr;
        }
        if (!playing) usePlayer.getState().togglePlay();

        if (previewMode) {
          previewTimerRef.current = setTimeout(() => {
            audio.pause();
            usePlayer.getState().togglePlay();
            setError("Preview ended. Buy this track for full access.");
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
      {/* Expanded Now Playing (Spotify-style desktop layout) */}
      {isExpanded && (
        <div className="fixed inset-0 bg-gradient-to-b from-background to-background/95 z-[100] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Minimize player"
            >
              <Minimize2 className="size-5" />
            </button>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Now Playing</p>
            <button
              onClick={() => {
                usePlayer.getState().exitSong();
                setIsExpanded(false);
              }}
              className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Exit song"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* Left side: Full cover art */}
            <div className="flex-1 flex items-center justify-center p-8">
              <StorageImage
                bucket="album-art"
                path={track.coverUrl}
                alt={track.title}
                className="max-h-[70vh] w-auto rounded-lg overflow-hidden shadow-2xl bg-card object-contain"
              />
            </div>

            {/* Center: Controls */}
            <div className="w-96 flex flex-col justify-center p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {albumId ? (
                    <Link to="/albums/$id" params={{ id: albumId }} onClick={() => setIsExpanded(false)} className="block hover:underline">
                      <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                    </Link>
                  ) : artistId ? (
                    <Link to="/artists/$id" params={{ id: artistId }} onClick={() => setIsExpanded(false)} className="block hover:underline">
                      <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                    </Link>
                  ) : (
                    <h2 className="text-2xl font-bold truncate">{track.title}</h2>
                  )}
                  {artistId ? (
                    <Link to="/artists/$id" params={{ id: artistId }} onClick={() => setIsExpanded(false)} className="block text-lg text-muted-foreground truncate hover:text-foreground hover:underline">
                      {track.artistName}
                    </Link>
                  ) : (
                    <p className="text-lg text-muted-foreground truncate">{track.artistName}</p>
                  )}
                </div>
                {user && (
                  <button onClick={toggleLike} className="shrink-0 ml-4" aria-label={liked ? "Unlike" : "Like"}>
                    <Heart className={`size-6 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                )}
              </div>
              {isPreview && trackPrice > 0 && (
                <Link
                  to="/checkout"
                  search={{ item: "song", id: track.id }}
                  onClick={() => setIsExpanded(false)}
                  className="block w-full text-center py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold hover:bg-amber-500/30 transition-colors"
                >
                  Buy this track — ZMW {trackPrice.toFixed(2)}
                </Link>
              )}
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
              <div className="flex items-center justify-center gap-6">
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
                  {playing ? (
                    <Pause className="size-6" />
                  ) : loading ? (
                    <Loader2 className="size-6 animate-spin" />
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
            </div>

            {/* Right side: Vertical volume and Queue */}
            <div className="w-20 border-l border-border bg-muted/20 flex flex-col">
              {/* Vertical volume slider */}
              <div className="flex-1 flex flex-col items-center justify-center py-8">
                <button onClick={toggleMute} className="mb-4 text-muted-foreground hover:text-foreground" aria-label="Mute">
                  <VolIcon className="size-5" />
                </button>
                <div className="h-48 w-1 bg-muted rounded-full relative">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={muted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                    style={{
                      WebkitAppearance: "slider-vertical",
                      accentColor: "hsl(var(--primary))",
                    }}
                    aria-label="Volume"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-primary rounded-full transition-all"
                    style={{ height: `${(muted ? 0 : volume) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Far right: Queue */}
            <div className="w-96 border-l border-border bg-muted/20 p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Queue</h3>
                <span className="text-sm text-muted-foreground">{queue.length} songs</span>
              </div>
              {queue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Queue is empty</p>
              ) : (
                <div className="space-y-2">
                  {queue.map((queueTrack, index) => (
                    <button
                      key={`${queueTrack.id}-${index}`}
                      onClick={() => {
                        if (index !== queueIndex) {
                          usePlayer.getState().setQueue(queue, index);
                        }
                      }}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        index === queueIndex ? "bg-primary/10" : "hover:bg-accent"
                      }`}
                    >
                      <StorageImage
                        bucket="album-art"
                        path={queueTrack.coverUrl}
                        alt={queueTrack.title}
                        className="size-10 rounded overflow-hidden bg-card object-cover"
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`text-sm font-medium truncate ${index === queueIndex ? "text-primary" : ""}`}>
                          {queueTrack.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{queueTrack.artistName}</p>
                      </div>
                      {index === queueIndex && playing && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-0.5 h-3 bg-primary animate-pulse" />
                          <div className="w-0.5 h-3 bg-primary animate-pulse delay-75" />
                          <div className="w-0.5 h-3 bg-primary animate-pulse delay-150" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error && <div className="p-4 text-sm text-destructive text-center border-t border-border">{error}</div>}
        </div>
      )}

      {/* Desktop Spotify-style bar */}
      <div className="fixed bottom-0 inset-x-0 bg-obsidian/95 backdrop-blur-xl border-t border-white/10 z-50">
        {showAd && !user && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-primary/10 border-b border-primary/20 text-xs">
            <span className="flex items-center gap-1.5 text-gray-300">
              <Radio className="size-3 text-primary" /> You're listening with ads.
            </span>
            <Link to="/auth" className="font-semibold text-primary hover:underline">
              Sign up free →
            </Link>
          </div>
        )}
        {isPreview && (
          <div className="flex items-center justify-between px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs">
            <span className="flex items-center gap-1.5 text-amber-400">
              <Radio className="size-3" /> 15-second preview
            </span>
            <div className="flex items-center gap-3">
              {trackPrice > 0 && (
                <Link
                  to="/checkout"
                  search={{ item: "song", id: track.id }}
                  className="font-semibold text-amber-400 hover:underline"
                >
                  Buy this track — ZMW {trackPrice.toFixed(2)}
                </Link>
              )}
            </div>
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
              {albumId ? (
                <Link to="/albums/$id" params={{ id: albumId }} className="text-sm font-medium text-white truncate hover:underline block">
                  {track.title}
                </Link>
              ) : artistId ? (
                <Link to="/artists/$id" params={{ id: artistId }} className="text-sm font-medium text-white truncate hover:underline block">
                  {track.title}
                </Link>
              ) : (
                <p className="text-sm font-medium text-white truncate hover:underline cursor-pointer" onClick={() => setIsExpanded(true)}>
                  {track.title}
                </p>
              )}

              {artistId ? (
                <Link to="/artists/$id" params={{ id: artistId }} className="text-xs text-gray-300 truncate hover:text-white hover:underline block">
                  {track.artistName}
                </Link>
              ) : (
                <p className="text-xs text-gray-300 truncate">{track.artistName}</p>
              )}
            </div>
            {user && (
              <button
                onClick={toggleLike}
                className="ml-2 shrink-0 p-1.5 rounded-full hover:bg-white/10"
                aria-label={liked ? "Unlike" : "Like"}
              >
                <Heart className={`size-4 ${liked ? "fill-primary text-primary" : "text-gray-300 hover:text-white"}`} />
              </button>
            )}
          </div>

          {/* Center: Controls + progress */}
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleShuffle}
                className={`transition-colors ${shuffle ? "text-primary" : "text-gray-300 hover:text-white"}`}
                aria-label="Shuffle"
                title="Shuffle"
              >
                <Shuffle className="size-4" />
              </button>
              <button
                onClick={skipPrev}
                className="text-gray-300 hover:text-white"
                aria-label="Previous"
                title="Previous"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                onClick={() => !loading && !error && togglePlay()}
                disabled={loading || !!error}
                className="bg-white text-black p-2 rounded-full hover:scale-105 transition-transform disabled:opacity-30"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4 ml-0.5" />
                )}
              </button>
              <button
                onClick={skipNext}
                className="text-gray-300 hover:text-white"
                aria-label="Next"
                title="Next"
              >
                <SkipForward className="size-4" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`transition-colors ${repeat !== "off" ? "text-primary" : "text-gray-300 hover:text-white"}`}
                aria-label="Repeat"
                title={`Repeat: ${repeat}`}
              >
                {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
              </button>
            </div>
            <div className="w-full flex items-center gap-2">
              <span className="text-[10px] text-gray-300 tabular-nums w-8 text-right">
                {fmt(progressSeconds)}
              </span>
              <div
                className="flex-1 h-1 bg-gray-600 rounded-full relative overflow-hidden cursor-pointer group"
                onClick={seek}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={dur}
                aria-valuenow={progressSeconds}
                aria-label="Seek"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-white group-hover:bg-primary transition-colors"
                  style={{ width: `${progressPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progressPct}% - 6px)` }}
                />
              </div>
              <span className="text-[10px] text-gray-300 tabular-nums w-8">{fmt(dur)}</span>
            </div>
            {error && <p className="text-[10px] text-destructive truncate max-w-md">{error}</p>}
          </div>

          {/* Right: Queue, volume, expand */}
          <div className="flex items-center justify-end gap-3">
            <Link
              to="/library"
              className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-white/10"
              aria-label="Queue"
              title="Your library"
            >
              <ListMusic className="size-4" />
            </Link>
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-gray-300 hover:text-white" aria-label="Mute">
                <VolIcon className="size-4" />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-24 accent-white"
                aria-label="Volume"
              />
            </div>
            <button
              onClick={() => setIsExpanded(true)}
              className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-white/10"
              aria-label="Expand"
              title="Now playing"
            >
              <Maximize2 className="size-4" />
            </button>
            <button
              onClick={() => usePlayer.getState().exitSong()}
              className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-white/10"
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
