/**
 * Skeleton loading components with pulsing animation
 * Used to show placeholders while content is loading
 */

export function SkeletonHeroCarousel() {
  return (
    <div className="relative w-full aspect-[16/9] md:aspect-[2.4/1] rounded-2xl mb-8 bg-card overflow-hidden">
      <div className="animate-pulse w-full h-full bg-muted/30" />
    </div>
  );
}

export function SkeletonAlbumArt({ className = "" }: { className?: string }) {
  return (
    <div
      className={`aspect-square rounded-xl bg-muted/30 animate-pulse ${className}`}
    />
  );
}

export function SkeletonArtistAvatar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`aspect-square rounded-full bg-muted/30 animate-pulse ${className}`}
    />
  );
}

export function SkeletonTrackRow() {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg">
      <div className="w-12 h-12 rounded bg-muted/30 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 bg-muted/30 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-muted/30 rounded animate-pulse" />
      </div>
      <div className="w-12 text-right">
        <div className="h-4 w-8 bg-muted/30 rounded animate-pulse ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonText({ className = "" }: { className?: string }) {
  return (
    <div className={`h-4 bg-muted/30 rounded animate-pulse ${className}`} />
  );
}

export function SkeletonButton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-10 w-24 bg-muted/30 rounded-full animate-pulse ${className}`}
    />
  );
}

export function SkeletonHorizontalShelf() {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="h-8 w-48 bg-muted/30 rounded animate-pulse" />
        <div className="h-6 w-20 bg-muted/30 rounded animate-pulse" />
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 px-2 scrollbar-hide">
        <SkeletonAlbumArt className="w-40 h-40 md:w-44 md:h-44" />
        <SkeletonAlbumArt className="w-40 h-40 md:w-44 md:h-44" />
        <SkeletonAlbumArt className="w-40 h-40 md:w-44 md:h-44" />
        <SkeletonAlbumArt className="w-40 h-40 md:w-44 md:h-44" />
        <SkeletonAlbumArt className="w-40 h-40 md:w-44 md:h-44" />
      </div>
    </div>
  );
}

export function SkeletonShelf({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="h-8 w-48 bg-muted/30 rounded animate-pulse" />
        <div className="h-6 w-20 bg-muted/30 rounded animate-pulse" />
      </div>
      <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-2">
            <SkeletonAlbumArt className="w-36 h-36 md:w-44 md:h-44" />
            <SkeletonText className="w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
