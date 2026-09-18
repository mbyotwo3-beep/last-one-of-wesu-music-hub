import { ListMusic } from "lucide-react";
import { StorageImage } from "@/components/StorageImage";

/**
 * Playlist artwork: a 2x2 mosaic of the first song covers
 * when the playlist has no custom cover, a single cover when there is only
 * one, and a music-note placeholder when empty.
 */
export function PlaylistCover({
  covers,
  alt,
  className = "",
}: {
  covers: (string | null | undefined)[];
  alt: string;
  className?: string;
}) {
  const distinct = [...new Set(covers.filter(Boolean))] as string[];
  if (distinct.length >= 2) {
    const cells = distinct.slice(0, 4);
    return (
      <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-muted ${className}`}>
        {cells.map((c, i) => (
          <StorageImage
            key={`${c}-${i}`}
            bucket="album-art"
            path={c}
            alt={i === 0 ? alt : ""}
            className="w-full h-full object-cover min-h-0 min-w-0"
          />
        ))}
        {cells.length < 4 &&
          Array.from({ length: 4 - cells.length }).map((_, i) => (
            <div key={`empty-${i}`} className="w-full h-full bg-card" />
          ))}
      </div>
    );
  }
  if (distinct.length === 1) {
    return (
      <StorageImage
        bucket="album-art"
        path={distinct[0]}
        alt={alt}
        className={`object-cover bg-muted ${className}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-secondary/80 border border-border ${className}`}>
      <ListMusic className="w-1/3 h-1/3 max-w-10 max-h-10 text-muted-foreground" />
    </div>
  );
}
