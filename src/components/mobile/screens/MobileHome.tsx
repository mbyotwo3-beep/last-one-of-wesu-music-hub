import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { Crown, TrendingUp } from "lucide-react";
import { getNewReleases, getTrendingSongs, getFeaturedAlbums } from "@/lib/music.functions";
import { SongRow } from "@/components/mobile/shared/SongRow";
import { StorageImage } from "@/components/StorageImage";
import { CarouselShelf } from "@/components/CarouselShelf";
import { getActiveCarousels } from "@/lib/carousel.functions";
import { useServerFn } from "@tanstack/react-start";

const newReleasesQO = queryOptions({
  queryKey: ["new-releases"],
  queryFn: () => getNewReleases(),
  staleTime: 5 * 60 * 1000,
});

const trendingQO = queryOptions({
  queryKey: ["trending"],
  queryFn: () => getTrendingSongs(),
  staleTime: 5 * 60 * 1000,
});

const featuredQO = queryOptions({
  queryKey: ["featured-albums"],
  queryFn: () => getFeaturedAlbums(),
  staleTime: 5 * 60 * 1000,
});

export { newReleasesQO, trendingQO, featuredQO };

/**
 * Mobile-optimised home screen.
 * Featured carousel → New Releases → Trending → Go Premium card.
 *
 * Feature: wesu-plus-completion
 */
export function MobileHome() {
  const { data: featured } = useSuspenseQuery(featuredQO);
  const { data: newReleases } = useSuspenseQuery(newReleasesQO);
  const { data: trending } = useSuspenseQuery(trendingQO);
  const carouselsFn = useServerFn(getActiveCarousels);

  const { data: carousels } = useQuery({
    queryKey: ["active-carousels"],
    queryFn: () => carouselsFn(),
    staleTime: 60 * 1000,
  });

  const [emblaRef] = useEmblaCarousel({ loop: false, align: "start", dragFree: true });

  return (
    <div className="pb-6">
      {/* Custom Carousels configured by Admin / Superadmin */}
      {carousels && carousels.map((carousel) => (
        <div key={carousel.id} className="px-2">
          <CarouselShelf carousel={carousel} />
        </div>
      ))}
      {/* Featured Carousel */}
      {featured.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground px-4 mb-3">
            Featured
          </h2>
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-3 pl-4">
              {featured.map((album) => (
                <Link
                  key={album.id}
                  to="/albums/$id"
                  params={{ id: album.id }}
                  className="shrink-0 w-36 rounded-xl overflow-hidden bg-card ring-1 ring-white/10"
                >
                  <div className="aspect-square bg-secondary">
                    <StorageImage
                      bucket="album-art"
                      path={album.cover_url}
                      alt={album.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold truncate">{album.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {(album.artist as { name?: string } | null)?.name ?? "Unknown"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Releases */}
      <div className="mb-6">
        <div className="flex items-center justify-between px-4 mb-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            New Releases
          </h2>
        </div>
        <div>
          {newReleases.slice(0, 10).map((song) => (
            <SongRow
              key={song.id}
              song={{
                id: song.id,
                title: song.title,
                artistName: (song.artist as { name?: string } | null)?.name ?? "Unknown",
                coverUrl: song.cover_url,
                price: song.price,
                durationSeconds: song.duration,
              }}
            />
          ))}
          {newReleases.length === 0 && (
            <p className="px-4 text-sm text-muted-foreground py-4">No new releases yet.</p>
          )}
        </div>
      </div>

      {/* Trending */}
      <div className="mb-6 px-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="size-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Trending
          </h2>
        </div>
        <div className="space-y-2">
          {trending.slice(0, 5).map((song, i) => (
            <div key={song.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{song.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {(song.artist as { name?: string } | null)?.name ?? "Unknown"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{song.play_count ?? 0}</span>
            </div>
          ))}
          {trending.length === 0 && (
            <p className="text-sm text-muted-foreground">No trending songs yet.</p>
          )}
        </div>
      </div>

      {/* Go Premium card — temporarily hidden while subscriptions are disabled */}

    </div>
  );
}
