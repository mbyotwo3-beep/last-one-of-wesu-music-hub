import { Play, Pause, Heart } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";
import { DownloadButton } from "@/components/DownloadButton";
import { useSavedTrack } from "@/hooks/use-saved-track";

interface TrackRowProps {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  coverUrl: string;
  audioUrl?: string;
  index: number;
  price?: number | null;
}

export function TrackRow({ id, title, artist, album, duration, coverUrl, audioUrl, index, price }: TrackRowProps) {
  const setTrack = usePlayer((s) => s.setTrack);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);
  const { isSaved, toggle } = useSavedTrack(id);

  const isCurrentTrack = currentTrackId === id;
  const isPlayingThisTrack = playing && isCurrentTrack;

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    if (isCurrentTrack) {
      togglePlay();
      return;
    }
    
    setTrack({
      id,
      title,
      artistName: artist,
      coverUrl,
      audioUrl: audioUrl || undefined,
    });
  };

  return (
    <div
      className="group flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors w-full text-left"
    >
      {/* Track Number / Play Button */}
      <div className="w-8 flex justify-center">
        <button
          onClick={handlePlay}
          className="text-foreground hover:text-primary transition-colors"
          aria-label={isPlayingThisTrack ? "Pause" : "Play"}
        >
          {isPlayingThisTrack ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </button>
      </div>

      {/* Album Art */}
      <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
        <img src={coverUrl} alt={album} className="w-full h-full object-cover" />
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={handlePlay}>
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{artist}</p>
      </div>

      {/* Album Name (hidden on mobile) */}
      <div className="hidden sm:block w-48 min-w-0">
        <p className="text-sm text-muted-foreground truncate">{album}</p>
      </div>

      {/* Duration */}
      <div className="text-sm text-muted-foreground w-12 text-right">{duration}</div>

      {/* Price */}
      {price !== null && price !== undefined && (
        <div className="text-sm font-medium text-primary w-20 text-right">
          {useCurrency.getState().formatPrice(price)}
        </div>
      )}

      {Number(price ?? 0) <= 0 && <DownloadButton songId={id} />}

      {/* Like Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={isSaved ? "Unlike" : "Like"}
      >
        <Heart
          className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        />
      </button>
    </div>
  );
}
