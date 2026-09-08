import { Play, Heart } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";
import { DownloadButton } from "@/components/DownloadButton";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { useServerFn } from "@tanstack/react-start";
import { getPreviewAudioUrl, getPublicAudioUrl } from "@/lib/listener.functions";
import { toast } from "sonner";

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
  const setIsPreview = usePlayer((s) => s.setIsPreview);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const { isSaved, toggle } = useSavedTrack(id);
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);

  const handlePlay = async () => {
    try {
      const isPaid = price && Number(price) > 0;
      
      if (isPaid) {
        const { url } = await getPreviewFn({ data: { song_id: id } });
        setTrack({
          id,
          title,
          artistName: artist,
          coverUrl,
          audioUrl: url,
        });
        setIsPreview(true);
        toast.info(`🎵 Previewing "${title}" (15s)`);
      } else {
        const { url } = await getPublicFn({ data: { song_id: id } });
        setTrack({
          id,
          title,
          artistName: artist,
          coverUrl,
          audioUrl: url,
        });
        setIsPreview(false);
      }
      togglePlay();
    } catch (error) {
      toast.error(`Failed to play: ${(error as Error).message}`);
    }
  };

  return (
    <div
      onClick={handlePlay}
      className="group flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors w-full text-left cursor-pointer"
    >
      {/* Track Number / Play Button */}
      <div className="w-8 flex justify-center">
        <span className="text-sm text-muted-foreground group-hover:hidden">{index}</span>
        <Play className="size-4 text-foreground hidden group-hover:block" />
      </div>

      {/* Album Art */}
      <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
        <img src={coverUrl} alt={album} className="w-full h-full object-cover" />
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0">
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
      >
        <Heart
          className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        />
      </button>
    </div>
  );
}
