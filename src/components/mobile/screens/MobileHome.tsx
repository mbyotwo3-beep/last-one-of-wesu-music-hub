import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { Crown, TrendingUp } from "lucide-react";
import { getNewReleases, getTrendingSongs, getFeaturedAlbums } from "@/lib/music.functions";
import { SongRow } from "@/components/mobile/shared/SongRow";

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

  const [emblaRef] = useEmblaCarousel({ loop: false, align: "start", dragFree: true });

  return (
    <div className="pb-6">
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
                  to="/albums"
                  className="shrink-0 w-36 rounded-xl overflow-hidden bg-card ring-1 ring-white/10"
                >
                  <div className="aspect-square bg-secondary">
                    {album.cover_url ? (
                      <img
                        src={album.cover_url}
                        alt={album.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-card" />
                    )}
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

      {/* Go Premium card */}
      <div className="mx-4 bg-primary/10 border border-primary/20 rounded-2xl p-5 flex items-center gap-4">
        <Crown className="size-8 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Go Premium</p>
          <p className="text-xs text-muted-foreground">
            Ad-free listening · Support Zambian artists
          </p>
        </div>
        <Link
          to="/subscriptions"
          className="shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs font-bold min-h-[44px] flex items-center"
        >
          Upgrade
        </Link>
      </div>
    </div>
  );
}
