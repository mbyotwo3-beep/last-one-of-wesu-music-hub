import { Loader2, Pause, Play, SkipForward, SkipBack, Radio } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { useTrackMeta } from "@/hooks/use-track-meta";

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
  const isPreview = usePlayer((s) => s.isPreview);
  const { data: meta } = useTrackMeta(track?.id);
  const trackPrice: number = Number(meta?.price ?? 0);

  if (!track) return null;

  // A track is allowed to be paused while its URL is still resolving. The
  // player starts in `playing=true`, so loading must never lock the pause
  // control once playback has been requested.
  const isLoading = track.audioUrl === undefined && !playing;
  const dur = track.durationSeconds ?? 0;
  const progress = dur > 0 ? Math.min((progressSeconds / dur) * 100, 100) : 0;

  return (
    <div
      className="fixed bottom-16 inset-x-0 z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {isPreview && (
        <div className="mx-2 mb-1 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 text-[11px]">
          <span className="flex items-center gap-1.5 text-amber-400 font-medium">
            <Radio className="size-3" /> 15-second preview
          </span>
          {trackPrice > 0 && (
            <Link
              to="/checkout"
              search={{ item: "song", id: track.id }}
              className="font-semibold text-amber-300 hover:underline shrink-0 cursor-pointer"
            >
              Buy K{trackPrice.toFixed(0)}
            </Link>
          )}
        </div>
      )}

      {/* Main bar */}
      <div
        className="mx-2 rounded-xl overflow-hidden bg-[#1c1c1e] border border-white/10 shadow-2xl"
        style={{ backdropFilter: "blur(24px)" }}
      >
        <div className="w-full flex items-center gap-3 px-3 py-2.5">
          {/* Tap album art + info to open now playing */}
          <button
            type="button"
            onClick={openNowPlaying}
            aria-label="Open now playing"
            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer hover:bg-white/5 rounded-lg transition-colors"
          >
            <StorageImage
              bucket="album-art"
              path={track.coverUrl}
              alt={track.title}
              className="size-10 rounded-lg overflow-hidden bg-[#2c2c2e] shrink-0 object-cover shadow-md"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">{track.title}</p>
              <p className="text-xs text-white/60 truncate leading-tight mt-0.5">{track.artistName}</p>
            </div>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={skipPrev}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all cursor-pointer rounded-full hover:bg-white/10"
              aria-label="Previous"
            >
              <SkipBack className="size-4 fill-white/80" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              disabled={isLoading}
              className="w-9 h-9 flex items-center justify-center text-white hover:text-white/80 active:scale-90 transition-all disabled:opacity-40 cursor-pointer rounded-full hover:bg-white/10"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-5 fill-white" />
              ) : isLoading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Play className="size-5 fill-white" />
              )}
            </button>

            <button
              type="button"
              onClick={skipNext}
              className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all cursor-pointer rounded-full hover:bg-white/10"
              aria-label="Next"
            >
              <SkipForward className="size-4 fill-white/80" />
            </button>
          </div>
        </div>

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
