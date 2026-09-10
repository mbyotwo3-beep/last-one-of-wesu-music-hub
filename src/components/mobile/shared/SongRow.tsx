import { usePlayer } from "@/stores/player";
import type { PlayerTrack } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { useServerFn } from "@tanstack/react-start";
import { getPreviewAudioUrl, getPublicAudioUrl } from "@/lib/listener.functions";
import { toast } from "sonner";
import { Play, Pause } from "lucide-react";

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
  const setIsPreview = usePlayer((s) => s.setIsPreview);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrack = usePlayer((s) => s.track);
  const isActive = currentTrack?.id === song.id;
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);

  const isPlayingThisTrack = playing && isActive;

  const handlePlay = async () => {
    try {
      const isPaid = song.price && Number(song.price) > 0;
      
      if (isActive) {
        // Just toggle play/pause if it's the same track
        togglePlay();
        return;
      }
      
      if (isPaid) {
        const { url } = await getPreviewFn({ data: { song_id: song.id } });
        setTrack({
          id: song.id,
          title: song.title,
          artistName: song.artistName,
          coverUrl: song.coverUrl,
          audioUrl: url,
          durationSeconds: song.durationSeconds,
        });
        setIsPreview(true);
        toast.info(`🎵 Previewing "${song.title}" (15s)`);
      } else {
        const { url } = await getPublicFn({ data: { song_id: song.id } });
        setTrack({
          id: song.id,
          title: song.title,
          artistName: song.artistName,
          coverUrl: song.coverUrl,
          audioUrl: url,
          durationSeconds: song.durationSeconds,
        });
        setIsPreview(false);
      }
      togglePlay();
    } catch (error) {
      toast.error(`Failed to play: ${(error as Error).message}`);
    }
  };

  return (
    <button
      onClick={handlePlay}
      className={`w-full flex items-center gap-3 px-4 py-2 min-h-[44px] text-left transition-colors hover:bg-white/5 active:bg-white/10 ${
        isActive ? "bg-primary/10" : ""
      }`}
      aria-pressed={isActive}
    >
      <StorageImage
        bucket="album-art"
        path={song.coverUrl}
        alt={song.title}
        className="size-10 rounded-md overflow-hidden bg-card shrink-0 object-cover"
      />
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
      <div className="shrink-0 w-8 flex justify-center">
        {isPlayingThisTrack ? (
          <Pause className="size-4 text-primary" />
        ) : (
          <Play className="size-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
}
