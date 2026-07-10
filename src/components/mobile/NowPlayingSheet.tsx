import {
  ChevronDown,
  Heart,
  Music2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  Loader2,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { usePlayer } from "@/stores/player";
import { useAuth } from "@/hooks/use-auth";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Spotify-style full-screen Now Playing sheet.
 * Slides up from the bottom with animation when nowPlayingOpen = true.
 * Supports swipe-down to dismiss.
 *
 * Feature: wesu-plus-completion
 */
export function NowPlayingSheet() {
  const open = usePlayer((s) => s.nowPlayingOpen);
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const liked = usePlayer((s) => s.liked);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleLike = usePlayer((s) => s.toggleLike);
  const setProgress = usePlayer((s) => s.setProgress);
  const skipNext = usePlayer((s) => s.skipNext);
  const skipPrev = usePlayer((s) => s.skipPrev);
  const closeNowPlaying = usePlayer((s) => s.closeNowPlaying);

  const { user } = useAuth();

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "one" | "all">("off");
  const [volume, setVolume] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const dur = track?.durationSeconds ?? 0;
  const displayProgress = isDragging ? dragProgress : progressSeconds;
  const progressPct = dur > 0 ? Math.min((displayProgress / dur) * 100, 100) : 0;

  const isLoading = track?.audioUrl === undefined;

  // Sync volume to audio element
  useEffect(() => {
    const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
    if (audio) audio.volume = volume;
  }, [volume]);

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * dur;
    const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
    if (audio) audio.currentTime = newTime;
    setProgress(Math.floor(newTime));
  }

  function handleSeekTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    setIsDragging(true);
    setDragProgress(progressSeconds);
  }

  function handleSeekTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!dur || !isDragging) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
    setDragProgress(Math.floor(pct * dur));
  }

  function handleSeekTouchEnd() {
    if (!isDragging) return;
    setIsDragging(false);
    const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
    if (audio) audio.currentTime = dragProgress;
    setProgress(dragProgress);
  }

  // Swipe down to dismiss
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }

  function onTouchMove(e: React.TouchEvent) {
    touchCurrentY.current = e.touches[0].clientY;
    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }

  function onTouchEnd() {
    const delta = touchCurrentY.current - touchStartY.current;
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
    if (delta > 80) {
      closeNowPlaying();
    }
    touchStartY.current = 0;
    touchCurrentY.current = 0;
  }

  if (!track) return null;

  const repeatLabel = repeat === "off" ? "Repeat off" : repeat === "one" ? "Repeat one" : "Repeat all";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[80] bg-black/60 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={closeNowPlaying}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-[90] flex flex-col transition-transform duration-300 ease-out ${open ? "translate-y-0" : "translate-y-full"}`}
        style={{
          background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
          borderRadius: "24px 24px 0 0",
          maxHeight: "100dvh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label="Now Playing"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-2 shrink-0">
          <button
            onClick={closeNowPlaying}
            className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white -ml-2"
            aria-label="Close"
          >
            <ChevronDown className="size-6" />
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Now Playing</p>
          </div>
          <button
            onClick={() => {
              usePlayer.getState().exitSong();
            }}
            className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white -mr-2"
            aria-label="Exit song"
            title="Exit song"
          >
            <X className="size-6" />
          </button>
        </div>

        {/* Album Art — large, with drop shadow */}
        <div className="flex-1 flex items-center justify-center px-8 py-4 min-h-0">
          <div
            className="w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-[#2c2c2e]"
            style={{
              boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 8px 24px rgba(0,0,0,0.5)",
              transform: playing ? "scale(1.04)" : "scale(0.94)",
              transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            {track.coverUrl ? (
              <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music2 className="size-24 text-white/20" />
              </div>
            )}
          </div>
        </div>

        {/* Track info + Like */}
        <div className="flex items-center justify-between px-6 mb-3 shrink-0">
          <div className="flex-1 min-w-0 mr-4">
            <p className="text-xl font-bold text-white truncate">{track.title}</p>
            <p className="text-sm text-white/60 truncate mt-0.5">{track.artistName}</p>
          </div>
          {user && (
            <button
              onClick={toggleLike}
              className="w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
              aria-label={liked ? "Unlike" : "Like"}
            >
              <Heart
                className={`size-6 transition-colors ${liked ? "fill-[#1db954] text-[#1db954]" : "text-white/40"}`}
              />
            </button>
          )}
        </div>

        {/* Seek bar */}
        <div className="px-6 mb-1 shrink-0">
          <div
            className="relative h-10 flex items-center cursor-pointer group"
            onClick={handleSeekClick}
            onTouchStart={handleSeekTouchStart}
            onTouchMove={handleSeekTouchMove}
            onTouchEnd={handleSeekTouchEnd}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={dur}
            aria-valuenow={displayProgress}
            aria-label="Seek"
          >
            <div className="w-full h-1 bg-white/20 rounded-full">
              <div
                className="h-full rounded-full bg-white relative transition-all"
                style={{ width: `${progressPct}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 size-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
          <div className="flex justify-between text-xs text-white/40 tabular-nums -mt-1">
            <span>{formatTime(displayProgress)}</span>
            <span>{dur ? formatTime(dur) : "—"}</span>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-between px-8 mb-4 shrink-0">
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`w-10 h-10 flex items-center justify-center transition-colors active:scale-90 ${shuffle ? "text-[#1db954]" : "text-white/50 hover:text-white"}`}
            aria-label={`Shuffle ${shuffle ? "on" : "off"}`}
          >
            <Shuffle className="size-5" />
          </button>

          <button
            onClick={skipPrev}
            className="w-12 h-12 flex items-center justify-center text-white hover:text-white/80 active:scale-90 transition-all"
            aria-label="Previous"
          >
            <SkipBack className="size-7 fill-white" />
          </button>

          <button
            onClick={() => { if (!isLoading) togglePlay(); }}
            disabled={isLoading}
            className="w-16 h-16 flex items-center justify-center bg-white rounded-full shadow-lg active:scale-90 transition-transform disabled:opacity-50"
            aria-label={playing ? "Pause" : "Play"}
          >
            {isLoading ? (
              <Loader2 className="size-7 text-black animate-spin" />
            ) : playing ? (
              <Pause className="size-7 text-black fill-black" />
            ) : (
              <Play className="size-7 text-black fill-black ml-1" />
            )}
          </button>

          <button
            onClick={skipNext}
            className="w-12 h-12 flex items-center justify-center text-white hover:text-white/80 active:scale-90 transition-all"
            aria-label="Next"
          >
            <SkipForward className="size-7 fill-white" />
          </button>

          <button
            onClick={() => setRepeat(r => r === "off" ? "all" : r === "all" ? "one" : "off")}
            className={`w-10 h-10 flex items-center justify-center transition-colors active:scale-90 relative ${repeat !== "off" ? "text-[#1db954]" : "text-white/50 hover:text-white"}`}
            aria-label={repeatLabel}
          >
            <Repeat className="size-5" />
            {repeat === "one" && (
              <span className="absolute bottom-0 right-0 text-[8px] font-bold text-[#1db954]">1</span>
            )}
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-3 px-6 mb-6 shrink-0">
          <Volume2 className="size-4 text-white/40 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 accent-white h-1"
            aria-label="Volume"
            style={{ accentColor: "white" }}
          />
          <Volume2 className="size-5 text-white/70 shrink-0" />
        </div>
      </div>
    </>
  );
}
