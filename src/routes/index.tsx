import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { usePlatform } from "@/hooks/use-platform";
import { MobileHome } from "@/components/mobile/screens/MobileHome";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import {
  getFeaturedAlbums,
  getNewReleases,
  getTrendingSongs,
} from "@/lib/music.functions";

const featuredQO = queryOptions({
  queryKey: ["home-featured"],
  queryFn: () => getFeaturedAlbums(),
  staleTime: 5 * 60 * 1000,
});
const newQO = queryOptions({
  queryKey: ["home-new"],
  queryFn: () => getNewReleases(),
  staleTime: 5 * 60 * 1000,
});
const trendingQO = queryOptions({
  queryKey: ["home-trending"],
  queryFn: () => getTrendingSongs(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Listen Now — Wesu+" },
      {
        name: "description",
        content:
          "Stream the best Zambian and African music. Free & Premium tiers. Pay with MTN MoMo, Airtel Money, Zamtel Kwacha, or card.",
      },
      { property: "og:title", content: "Wesu+ — Stream Zambian & African Music" },
      {
        property: "og:description",
        content: "Stream the best Zambian and African music. Free & Premium tiers.",
      },
      { property: "og:url", content: "https://www.wesuplusly.com/" },
    ],
    links: [{ rel: "canonical", href: "https://www.wesuplusly.com/" }],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(featuredQO);
    context.queryClient.ensureQueryData(newQO);
    context.queryClient.ensureQueryData(trendingQO);
  },
  component: IndexRoute,
});

function IndexRoute() {
  const platform = usePlatform();
  return platform === "native" ? <MobileHome /> : <HomePage />;
}

function HomePage() {
  const { data: featured } = useSuspenseQuery(featuredQO);
  const { data: newReleases } = useSuspenseQuery(newQO);
  const { data: trending } = useSuspenseQuery(trendingQO);
  const setTrack = usePlayer((s) => s.setTrack);

  const empty =
    featured.length === 0 && newReleases.length === 0 && trending.length === 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="lg:max-w-[calc(100vw-16rem)] lg:ml-auto px-4 md:px-6 py-6 md:py-8">
        {featured.length > 0 && (
          <HorizontalShelf title="Featured Albums" showAllLink="/albums">
            <div className="grid grid-flow-col auto-cols-[10rem] md:auto-cols-[12rem] gap-4 min-w-max">
              {featured.map((al) => (
                <Link key={al.id} to="/albums/$id" params={{ id: al.id }} className="group block">
                  <StorageImage
                    bucket="album-art"
                    path={al.cover_url}
                    alt={al.title}
                    className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover"
                  />
                  <p className="mt-2 text-sm font-semibold truncate">{al.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(al.artist as any)?.name ?? "Various"}
                  </p>
                </Link>
              ))}
            </div>
          </HorizontalShelf>
        )}

        {newReleases.length > 0 && (
          <HorizontalShelf title="New Music" showAllLink="/new-music">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {newReleases.map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    setTrack({
                      id: s.id,
                      title: s.title,
                      artistName: (s.artist as any)?.name ?? "Unknown",
                      coverUrl: s.cover_url,
                      durationSeconds: s.duration,
                    })
                  }
                  className="group text-left"
                >
                  <div className="relative">
                    <StorageImage
                      bucket="album-art"
                      path={s.cover_url}
                      alt={s.title}
                      className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover"
                    />
                    <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                        <Play className="size-5 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-sm font-semibold truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(s.artist as any)?.name ?? "Unknown"}
                  </p>
                </button>
              ))}
            </div>
          </HorizontalShelf>
        )}

        {trending.length > 0 && (
          <HorizontalShelf title="Top Tracks" showAllLink="/hot-tracks">
            <div className="w-full space-y-1">
              {trending.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() =>
                    setTrack({
                      id: s.id,
                      title: s.title,
                      artistName: (s.artist as any)?.name ?? "Unknown",
                      coverUrl: s.cover_url,
                    })
                  }
                  className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
                >
                  <span className="w-6 text-sm text-muted-foreground group-hover:hidden">
                    {i + 1}
                  </span>
                  <Play className="w-6 text-sm hidden group-hover:block size-4 fill-current" />
                  <StorageImage
                    bucket="album-art"
                    path={s.cover_url}
                    alt={s.title}
                    className="size-10 rounded-md overflow-hidden bg-card object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(s.artist as any)?.name ?? "Unknown"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {(s.play_count ?? 0).toLocaleString()} plays
                  </span>
                </button>
              ))}
            </div>
          </HorizontalShelf>
        )}

        {empty && (
          <div className="text-center py-24">
            <h1 className="text-3xl font-bold mb-2">Welcome to Wesu+</h1>
            <p className="text-muted-foreground mb-6">
              No music has been published yet. Check back soon.
            </p>
            <Link
              to="/browse"
              className="inline-block px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
            >
              Explore Browse
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
