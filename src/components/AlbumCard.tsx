import { Play, Pause } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { PriceTag } from "@/components/PriceTag";

interface AlbumCardProps {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  audioUrl?: string;
  duration?: number;
  price?: number | null;
}

export function AlbumCard({
  id,
  title,
  subtitle,
  imageUrl,
  audioUrl,
  duration,
  price,
}: AlbumCardProps) {
  const setQueue = usePlayer((s) => s.setQueue);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);

  const isCurrentTrack = currentTrackId === id;
  const isPlayingThisTrack = playing && isCurrentTrack;

  const handlePlay = (e?: React.MouseEvent) => {
    // The play control is a SIBLING of the link, not a child, so a tap can
    // never both start playback and navigate.
    e?.stopPropagation();
    e?.preventDefault();
    if (isCurrentTrack) {
      togglePlay();
      return;
    }
    // Single-track queue (not bare setTrack) so Next/Prev and the queue
    // screen keep working instead of jumping into a stale queue.
    setQueue(
      [
        {
          id,
          title,
          artistName: subtitle,
          coverUrl: imageUrl,
          audioUrl: audioUrl || undefined,
          durationSeconds: duration,
          price: price ?? undefined,
        },
      ],
      0,
    );
  };

  return (
    // Not a <Link> wrapper: title and price must stay visible on a phone,
    // where there is no hover, and the play button must not be nested in it.
    <div className="group relative flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
        <Link
          to="/albums/$id"
          params={{ id }}
          aria-label={`${title} by ${subtitle}`}
          className="block h-full w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <StorageImage
            bucket="album-art"
            path={imageUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        </Link>

        {/* Play: always visible on touch (small screens), hover-revealed on desktop. */}
        <button
          type="button"
          onClick={handlePlay}
          aria-label={isPlayingThisTrack ? `Pause ${title}` : `Play ${title}`}
          className="absolute bottom-2 right-2 grid size-11 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-md transition hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          {isPlayingThisTrack ? (
            <Pause className="size-5 fill-white" />
          ) : (
            <Play className="size-5 fill-white" />
          )}
        </button>
      </div>

      {/* Always-visible metadata: this is what a touch user reads. */}
      <div className="min-w-0">
        <Link
          to="/albums/$id"
          params={{ id }}
          className="block truncate text-sm font-semibold hover:underline focus:outline-none focus-visible:underline"
        >
          {title}
        </Link>
        <div className="flex items-center gap-2">
          {subtitle ? (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          <PriceTag price={price} />
        </div>
      </div>
    </div>
  );
}
