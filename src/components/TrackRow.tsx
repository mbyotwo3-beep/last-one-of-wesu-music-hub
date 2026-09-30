import { Play, Pause, Heart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePlayer } from "@/stores/player";
import { PriceTag } from "@/components/PriceTag";
import { DownloadButton } from "@/components/DownloadButton";
import { StorageImage } from "@/components/StorageImage";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { ShareMenu } from "@/components/ShareMenu";

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

export function TrackRow({
  id,
  title,
  artist,
  artistId,
  album,
  duration,
  coverUrl,
  index,
  price,
}: TrackRowProps & { artistId?: string }) {
  const setQueue = usePlayer((s) => s.setQueue);
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

    setQueue([{ id, title, artistName: artist, coverUrl, price: price ?? undefined }], 0);
  };

  return (
    <div className="group flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors w-full text-left">
      {/* Track Number / Play Button — 44px target, not a bare 16px icon. */}
      <div className="flex w-11 shrink-0 justify-center">
        <button
          onClick={handlePlay}
          className="grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-secondary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={isPlayingThisTrack ? "Pause" : "Play"}
        >
          {isPlayingThisTrack ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
      </div>

      {/* Album Art */}
      <div className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0">
        <StorageImage
          bucket="album-art"
          path={coverUrl}
          alt={album}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Track Info — a real button so the row is keyboard/screen-reader
          playable, not a bare click handler on a div. */}
      <button
        type="button"
        onClick={handlePlay}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:underline"
      >
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {artistId ? (
          <span
            className="block truncate text-xs text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              to="/artists/$id"
              params={{ id: artistId }}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-foreground hover:underline"
            >
              {artist}
            </Link>
          </span>
        ) : (
          <p className="truncate text-xs text-muted-foreground">{artist}</p>
        )}
      </button>

      {/* Album Name (hidden on mobile) */}
      <div className="hidden sm:block w-48 min-w-0">
        <p className="text-sm text-muted-foreground truncate">{album}</p>
      </div>

      {/* Duration — hidden on narrow screens so the title keeps its width. */}
      <div className="hidden w-12 text-right text-sm text-muted-foreground md:block">
        {duration}
      </div>

      {/* Price — one shared, always-labelled component (Free vs K…). */}
      <div className="hidden w-20 justify-end md:flex">
        <PriceTag price={price} />
      </div>

      <DownloadButton songId={id} title={title} artistName={artist} coverUrl={coverUrl} />
      <ShareMenu
        songId={id}
        songTitle={title}
        coverUrl={coverUrl}
        artistName={artist}
        type="song"
      />

      {/* Like Button — always visible on touch. The hover-only rule here made
          the like action completely unreachable on a phone. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="grid size-11 shrink-0 place-items-center rounded-full transition-opacity hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        aria-label={isSaved ? "Unlike" : "Like"}
        aria-pressed={isSaved}
      >
        <Heart
          className={`size-5 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        />
      </button>
    </div>
  );
}
