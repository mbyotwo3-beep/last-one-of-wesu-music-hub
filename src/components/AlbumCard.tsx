import { Play, Pause } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";

interface AlbumCardProps {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  audioUrl?: string;
  duration?: number;
  price?: number | null;
}

export function AlbumCard({ id, title, subtitle, imageUrl, audioUrl, duration, price }: AlbumCardProps) {
  const setTrack = usePlayer((s) => s.setTrack);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);
  const formatPrice = useCurrency((s) => s.formatPrice);

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
      artistName: subtitle,
      coverUrl: imageUrl,
      audioUrl: audioUrl || undefined,
      durationSeconds: duration,
    });
  };

  return (
    <button
      onClick={handlePlay}
      className="group relative aspect-square rounded-xl overflow-hidden bg-secondary transition-all duration-300 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
    >
      {/* Album Art */}
      <img
        src={imageUrl}
        alt={title}
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
        {/* Play Button */}
        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg hover:bg-white/30 transition-colors">
          {isPlayingThisTrack ? (
            <Pause className="size-5 text-white" />
          ) : (
            <Play className="size-5 text-white fill-white ml-0.5" />
          )}
        </div>
      </div>

      {/* Card Info (shown below card in grid layout) */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <p className="text-sm font-semibold text-white truncate">{title}</p>
        <p className="text-xs text-zinc-300 truncate">{subtitle}</p>
        {price !== null && price !== undefined && (
          <p className="text-xs font-medium text-primary mt-1">
            {formatPrice(price)}
          </p>
        )}
      </div>
    </button>
  );
}

