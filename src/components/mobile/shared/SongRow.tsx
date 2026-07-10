import { Music2 } from "lucide-react";
import { usePlayer } from "@/stores/player";
import type { PlayerTrack } from "@/stores/player";

interface SongRowProps {
  song: {
    id: string;
    title: string;
    artistName: string;
    coverUrl?: string | null;
    price?: number | null;
    durationSeconds?: number | null;
  };
}

/**
 * Reusable 44pt-height song list item for mobile screens.
 * Tapping calls setTrack from Zustand to begin playback.
 *
 * Feature: wesu-plus-completion
 */
export function SongRow({ song }: SongRowProps) {
  const setTrack = usePlayer((s) => s.setTrack);
  const currentTrack = usePlayer((s) => s.track);
  const isActive = currentTrack?.id === song.id;

  const track: PlayerTrack = {
    id: song.id,
    title: song.title,
    artistName: song.artistName,
    coverUrl: song.coverUrl,
    durationSeconds: song.durationSeconds,
  };

  return (
    <button
      onClick={() => setTrack(track)}
      className={`w-full flex items-center gap-3 px-4 py-2 min-h-[44px] text-left transition-colors hover:bg-white/5 active:bg-white/10 ${
        isActive ? "bg-primary/10" : ""
      }`}
      aria-pressed={isActive}
    >
      <div className="size-10 rounded-md overflow-hidden bg-card shrink-0 flex items-center justify-center">
        {song.coverUrl ? (
          <img
            src={song.coverUrl}
            alt={song.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Music2 className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>
          {song.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{song.artistName}</p>
      </div>
      {song.price != null && (
        <span className="text-xs font-semibold text-primary shrink-0">
          {song.price > 0 ? `K${Number(song.price).toFixed(2)}` : "Free"}
        </span>
      )}
    </button>
  );
}
