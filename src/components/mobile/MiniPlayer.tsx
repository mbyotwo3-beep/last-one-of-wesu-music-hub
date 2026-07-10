import { Loader2, Music2, Pause, Play, SkipForward, SkipBack, X } from "lucide-react";
import { usePlayer } from "@/stores/player";

/**
 * Spotify-style persistent mini player rendered above BottomTabBar.
 * - Always visible when a track is loaded (cannot be dismissed)
 * - Thin progress bar at the very bottom (like Spotify)
 * - Tap body → opens full NowPlayingSheet
 * - Play/Pause + Next/Prev on the right
 *
 * Feature: wesu-plus-completion
 */
export function MiniPlayer() {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const skipNext = usePlayer((s) => s.skipNext);
  const skipPrev = usePlayer((s) => s.skipPrev);
  const openNowPlaying = usePlayer((s) => s.openNowPlaying);

  if (!track) return null;

  const isLoading = track.audioUrl === undefined;
  const dur = track.durationSeconds ?? 0;
  const progress = dur > 0 ? Math.min((progressSeconds / dur) * 100, 100) : 0;

  return (
    <div
      className="fixed bottom-16 inset-x-0 z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Main bar */}
      <div
        className="mx-2 rounded-xl overflow-hidden bg-[#1c1c1e] border border-white/10 shadow-2xl"
        style={{ backdropFilter: "blur(24px)" }}
      >
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
          onClick={openNowPlaying}
          aria-label="Open now playing"
        >
          {/* Album art */}
          <div className="size-10 rounded-lg overflow-hidden bg-[#2c2c2e] shrink-0 flex items-center justify-center shadow-md">
            {track.coverUrl ? (
              <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <Music2 className="size-4 text-white/40" />
            )}
          </div>

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{track.title}</p>
            <p className="text-xs text-white/60 truncate leading-tight mt-0.5">{track.artistName}</p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={skipPrev}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all"
              aria-label="Previous"
            >
              <SkipBack className="size-4 fill-white/80" />
            </button>

            <button
              onClick={togglePlay}
              disabled={isLoading}
              className="w-9 h-9 flex items-center justify-center text-white hover:text-white/80 active:scale-90 transition-all disabled:opacity-40"
              aria-label={playing ? "Pause" : "Play"}
            >
              {isLoading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : playing ? (
                <Pause className="size-5 fill-white" />
              ) : (
                <Play className="size-5 fill-white" />
              )}
            </button>

            <button
              onClick={skipNext}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all"
              aria-label="Next"
            >
              <SkipForward className="size-4 fill-white/80" />
            </button>

            {track && (
              <button
                onClick={() => usePlayer.getState().exitSong()}
                className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white active:scale-90 transition-all ml-1 border-l border-white/10 pl-1"
                aria-label="Exit song"
                title="Exit song"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </button>

        {/* Spotify-style thin progress bar at the very bottom of the bar */}
        <div className="h-[2px] bg-white/10 w-full">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
