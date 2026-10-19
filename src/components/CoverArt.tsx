import { Music2 } from "lucide-react";

import { StorageImage } from "@/components/StorageImage";
import { useArtworkGradient } from "@/hooks/use-artwork-gradient";
import type { ImageBucket } from "@/lib/storage-url";

interface CoverArtProps {
  bucket: ImageBucket;
  path?: string | null;
  alt: string;
  /** Sizing/rounding — the surface itself always fills this box. */
  className?: string;
  loading?: "eager" | "lazy";
  onClick?: () => void;
}

/**
 * A cover that owns its surface: an artwork-derived gradient immediately, the
 * real image fading in over it once decoded.
 *
 * WHY NOT JUST PUT THE GRADIENT ON THE PARENT OF StorageImage
 *
 * It was tried and did not survive the three loading states:
 *
 *   - while StorageImage resolves its signed URL it swaps itself out for a
 *     placeholder div, which shoved in a `bg-card` grey square over the top of
 *     any parent gradient. The user saw grey-red-grey for every cover.
 *   - the parent did not know the image's true aspect box, so the gradient
 *     could not sit under the fade.
 *
 * CoverArt holds the colour for BOTH phases; the image fades 0→1 over it, so
 * a slow load reads as the tint deepening, and a failed load reads as a
 * designed tinted tile with the placeholder icon — never a white flash and
 * never a broken-image icon.
 */
export function CoverArt({ bucket, path, alt, className = "", loading, onClick }: CoverArtProps) {
  const { css } = useArtworkGradient(bucket, path);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: css }}
      data-artwork-surface="cover"
    >
      {path ? (
        <StorageImage
          bucket={bucket}
          path={path}
          alt={alt}
          className="w-full h-full object-cover"
          loading={loading}
          onClick={onClick}
          fade
        />
      ) : (
        <div className="flex w-full h-full items-center justify-center" onClick={onClick}>
          <Music2 className="size-5 text-white/50" aria-hidden />
        </div>
      )}
    </div>
  );
}