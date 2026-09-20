import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart, Music2, Pause, Play, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/use-auth";
import { usePlayer } from "@/stores/player";
import { useTrackMeta } from "@/hooks/use-track-meta";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { StorageImage } from "@/components/StorageImage";
import { useSongEntitlement } from "@/hooks/use-song-entitlement";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Full-screen Now Playing view.
 * Rendered by /now-playing route (modal).
 * Swipe-down dismisses via router.history.back().
 *
 * Feature: wesu-plus-completion
 */
export function NowPlayingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const audioUrl = usePlayer((s) => s.track?.audioUrl);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const skipNext = usePlayer((s) => s.skipNext);
  const skipPrev = usePlayer((s) => s.skipPrev);
  const seekTo = usePlayer((s) => s.seekTo);
  const isPreview = usePlayer((s) => s.isPreview);
  const { data: meta } = useTrackMeta(track?.id);
  const trackPrice = meta ? Number(meta.price ?? 0) : null;
  const { owned } = useSongEntitlement(track?.id, trackPrice, (meta as any)?.album_id);
  const { isSaved, toggle: toggleSaved } = useSavedTrack(track?.id);

  if (!track) return null;

  const dur = isPreview ? 15 : (track.durationSeconds ?? 0);
  // Spinner only while playback was requested but the source isn't ready.
  // The button stays enabled: tapping it starts/retries instead of idling
  // on a dead spinner when paused-unresolved.
  const isLoading = audioUrl === undefined && playing;

  function dismiss() {
    // Direct loads (deep link) have no in-app history — fall back home
    // instead of getting stuck.
    if (router.history.length > 1) router.history.back();
    else router.navigate({ to: "/" });
  }

  function handleLike() {
    if (!track) return;
    // Anonymous taps redirect to /auth via the hook (replays after sign-in).
    toggleSaved();
  }

  function handleSeek(values: number[]) {
    // Route through the store so preview clamping + empty-src guards apply.
    seekTo(values[0]);
  }

  // Real swipe-down detection: track the touch start in the same coordinate
  // space (clientY). The old code mixed clientY with screenY, which can never
  // meaningfully exceed the threshold.
  const touchStartY = useRef<number | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartY.current;
    touchStartY.current = null;
    const end = e.changedTouches[0]?.clientY;
    if (start != null && end != null && end - start > 100) {
      dismiss();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-background z-[70] flex flex-col p-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center self-start -ml-2 mb-4 text-muted-foreground"
        aria-label="Dismiss now playing"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Cover art */}
      <div className="flex-1 flex items-center justify-center mb-6">
        <div className="min-h-[280px] min-w-[280px] size-[280px] rounded-2xl overflow-hidden bg-card ring-1 ring-white/10 flex items-center justify-center">
          {track.coverUrl ? (
            <StorageImage
              bucket="album-art"
              path={track.coverUrl}
              alt={track.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Music2 className="size-16 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Track info + like + share */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 min-w-0 mr-4">
          <h2 className="text-xl font-bold truncate">{track.title}</h2>
          <p className="text-muted-foreground truncate">{track.artistName}</p>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <button
              onClick={handleLike}
              disabled={false}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={isSaved ? "Unlike" : "Like"}
            >
              <Heart
                className={`size-6 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground"}`}
              />
            </button>
          )}
          <ShareMenu
            songId={track.id}
            songTitle={track.title}
            coverUrl={track.coverUrl}
            artistName={track.artistName}
            type="song"
            className="relative z-20"
          />
        </div>
      </div>
      {user && (trackPrice === null || owned) && (
        <div className="mb-4">
          <DownloadButton
            songId={track.id}
            label="Download"
            title={track.title}
            artistName={track.artistName}
            coverUrl={track.coverUrl}
          />
        </div>
      )}

      {/* Seek slider */}
      <div className="mb-2">
        <Slider
          min={0}
          max={dur || 1}
          step={1}
          value={[progressSeconds]}
          onValueChange={handleSeek}
          aria-valuemin={0}
          aria-valuemax={dur}
          aria-valuenow={progressSeconds}
          aria-label="Seek"
          className="w-full"
        />
      </div>

      {/* Duration labels */}
      <div className="flex justify-between text-xs text-muted-foreground mb-6">
        <span>{formatTime(progressSeconds)}</span>
        <span>{dur ? formatTime(dur) : "—"}</span>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={skipPrev}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Previous"
        >
          <SkipBack className="size-6" />
        </button>
        <button
          onClick={togglePlay}
          className="min-h-[56px] min-w-[56px] flex items-center justify-center bg-foreground text-obsidian rounded-full hover:scale-105 transition-transform"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="size-6" />
          ) : isLoading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <Play className="size-6 ml-0.5" />
          )}
        </button>
        <button
          onClick={skipNext}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Next"
        >
          <SkipForward className="size-6" />
        </button>
      </div>
    </div>
  );
}
