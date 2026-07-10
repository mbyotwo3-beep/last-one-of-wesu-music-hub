import { Play, Heart } from "lucide-react";
import { usePlayer } from "@/stores/player";

interface TrackRowProps {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  coverUrl: string;
  audioUrl?: string;
  index: number;
}

export function TrackRow({ id, title, artist, album, duration, coverUrl, audioUrl, index }: TrackRowProps) {
  const setTrack = usePlayer((s) => s.setTrack);
  const liked = usePlayer((s) => s.liked);
  const toggleLike = usePlayer((s) => s.toggleLike);

  const handlePlay = () => {
    setTrack({
      id,
      title,
      artistName: artist,
      coverUrl,
      audioUrl,
    });
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

      {/* Like Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleLike();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Heart
          className={`size-4 ${liked ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        />
      </button>
    </div>
  );
}
