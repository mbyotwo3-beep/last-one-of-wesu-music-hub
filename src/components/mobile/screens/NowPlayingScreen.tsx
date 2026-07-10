import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Heart, Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { toggleLike } from "@/lib/listener.functions";
import { useAuth } from "@/hooks/use-auth";
import { usePlayer } from "@/stores/player";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
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
  const liked = usePlayer((s) => s.liked);
  const progressSeconds = usePlayer((s) => s.progressSeconds);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleLikeStore = usePlayer((s) => s.toggleLike);
  const setProgress = usePlayer((s) => s.setProgress);

  const toggleLikeFn = useServerFn(toggleLike);
  const [liking, setLiking] = useState(false);

  if (!track) return null;

  const dur = track.durationSeconds ?? 0;

  async function handleLike() {
    if (!user || !track || liking) return;
    setLiking(true);
    try {
      await toggleLikeFn({ data: { song_id: track.id } });
      toggleLikeStore();
    } finally {
      setLiking(false);
    }
  }

  function handleSeek(values: number[]) {
    const newTime = values[0];
    // Update the HTML audio element via the module-level reference in PlayerBar
    const audio = (window as any).__wesuAudio as HTMLAudioElement | undefined;
    if (audio) audio.currentTime = newTime;
    setProgress(newTime);
  }

  return (
    <div
      className="fixed inset-0 bg-background z-50 flex flex-col p-6 pt-[env(safe-area-inset-top)]"
      // Touch-based swipe down to dismiss
      onTouchEnd={(e) => {
        const touch = e.changedTouches[0];
        if (touch && touch.clientY - touch.screenY > 100) {
          router.history.back();
        }
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={() => router.history.back()}
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
            <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <Music2 className="size-16 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Track info + like */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1 min-w-0 mr-4">
          <h2 className="text-xl font-bold truncate">{track.title}</h2>
          <p className="text-muted-foreground truncate">{track.artistName}</p>
        </div>
        {user && (
          <button
            onClick={handleLike}
            disabled={liking}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart
              className={`size-6 ${liked ? "fill-primary text-primary" : "text-muted-foreground"}`}
            />
          </button>
        )}
      </div>

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
          {playing ? <Pause className="size-6" /> : <Play className="size-6 ml-0.5" />}
        </button>
        <button
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Next"
        >
          <SkipForward className="size-6" />
        </button>
      </div>
    </div>
  );
}
