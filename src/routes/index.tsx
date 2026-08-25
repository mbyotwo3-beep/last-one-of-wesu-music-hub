import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play } from "lucide-react";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { getHomeDiscover, getForYou } from "@/lib/music.functions";
import { getRecentlyPlayed } from "@/lib/play-history.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  TrackCard,
  AlbumTile,
  ArtistTile,
  PlaylistTile,
} from "@/components/discover/TrackCard";
import { CarouselShelf } from "@/components/CarouselShelf";
import { getActiveCarousels } from "@/lib/carousel.functions";

const discoverQO = queryOptions({
  queryKey: ["home-discover"],
  queryFn: () => getHomeDiscover(),
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
    context.queryClient.ensureQueryData(discoverQO);
  },
  component: IndexRoute,
});

function IndexRoute() {
  return <HomePage />;
}

function HomePage() {
  const { data } = useSuspenseQuery(discoverQO);
  const setTrack = usePlayer((s) => s.setTrack);
  const { user } = useAuth();
  const forYouFn = useServerFn(getForYou);
  const recentlyPlayedFn = useServerFn(getRecentlyPlayed);
  const carouselsFn = useServerFn(getActiveCarousels);

  const { data: carousels } = useQuery({
    queryKey: ["active-carousels"],
    queryFn: () => carouselsFn(),
    staleTime: 60 * 1000,
  });

  const { data: forYouData } = useQuery({
    queryKey: ["for-you", user?.id],
    queryFn: () => forYouFn(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const { data: recentlyPlayed } = useQuery({
    queryKey: ["recently-played", user?.id],
    queryFn: () => recentlyPlayedFn(),
    enabled: !!user,
    staleTime: 60 * 1000,
  });
  const {
    featured,
    newReleases,
    trending,
    topArtists,
    recentAlbums,
    editorialPlaylists,
    moods,
  } = data;

  const heroPick = featured[0] ?? recentAlbums[0];
  const empty =
    featured.length === 0 &&
    newReleases.length === 0 &&
    trending.length === 0 &&
    topArtists.length === 0 &&
    recentAlbums.length === 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="lg:max-w-[calc(100vw-16rem)] lg:ml-auto px-4 md:px-6 py-6 md:py-8 space-y-10">
        {heroPick && (
          <section className="relative rounded-2xl overflow-hidden bg-card ring-1 ring-white/5 aspect-[16/9] md:aspect-[2.4/1]">
            <StorageImage
              bucket="album-art"
              path={heroPick.cover_url}
              alt={heroPick.title}
              className="absolute inset-0 w-full h-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
            <div className="relative h-full flex flex-col justify-end p-6 md:p-10 max-w-2xl">
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
                Featured
              </p>
              <h1 className="text-2xl md:text-5xl font-bold text-white tracking-tight mb-2">
                {heroPick.title}
              </h1>
              <p className="text-sm md:text-lg text-zinc-300 mb-5">
                {(heroPick.artist as { name?: string } | null)?.name ?? "Various Artists"}
              </p>
              <div className="flex gap-3">
                <Link
                  to="/albums/$id"
                  params={{ id: heroPick.id }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm cursor-pointer hover:scale-105 transition-transform"
                >
                  <Play className="size-4 fill-current" />
                  Open Album
                </Link>
                <Link
                  to="/browse"
                  className="inline-flex items-center px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm backdrop-blur cursor-pointer hover:scale-105 transition-transform"
                >
                  Browse All
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Custom Carousels configured by Admin / Superadmin */}
        {carousels && carousels.map((carousel) => (
          <CarouselShelf key={carousel.id} carousel={carousel} />
        ))}

        {user && recentlyPlayed && recentlyPlayed.length > 0 && (
          <HorizontalShelf title="Recently Played" showAllLink="/library">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {recentlyPlayed.map((s: any) => (
                <TrackCard key={s.id} song={s} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {user && forYouData && forYouData.forYou.length > 0 && (
          <HorizontalShelf title="Made For You" >
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {forYouData.forYou.map((s: any) => (
                <TrackCard key={s.id} song={s} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {user && forYouData && forYouData.byFavoriteArtists.length > 0 && (
          <HorizontalShelf title="More from artists you like">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {forYouData.byFavoriteArtists.map((s: any) => (
                <TrackCard key={s.id} song={s} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {user && forYouData && forYouData.favoriteArtists.length > 0 && (
          <HorizontalShelf title="Your favorite artists" showAllLink="/artists">
            <div className="grid grid-flow-col auto-cols-[8rem] md:auto-cols-[10rem] gap-4 min-w-max">
              {forYouData.favoriteArtists.map((a: any) => (
                <ArtistTile key={a.id} artist={a} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {newReleases.length > 0 && (
          <HorizontalShelf title="New Music" showAllLink="/new-music">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {newReleases.map((s) => (
                <TrackCard key={s.id} song={s} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {topArtists.length > 0 && (
          <HorizontalShelf title="Popular Artists" showAllLink="/artists">
            <div className="grid grid-flow-col auto-cols-[8rem] md:auto-cols-[10rem] gap-4 min-w-max">
              {topArtists.map((a) => (
                <ArtistTile key={a.id} artist={a} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {trending.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4 px-2">
              <h2 className="text-2xl font-bold tracking-tight">Top Tracks Today</h2>
              <Link
                to="/hot-tracks"
                className="text-sm text-primary hover:text-primary/80 font-medium cursor-pointer"
              >
                See All
              </Link>
            </div>
            <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
              {trending.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() =>
                    setTrack({
                      id: s.id,
                      title: s.title,
                      artistName: (s.artist as { name?: string } | null)?.name ?? "Unknown",
                      coverUrl: s.cover_url,
                      durationSeconds: (s as { duration?: number }).duration,
                    })
                  }
                  className="w-full flex items-center gap-4 p-2 rounded-lg hover:bg-white/5 transition-colors text-left group cursor-pointer"
                >
                  <span className="w-6 text-sm text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <StorageImage
                    bucket="album-art"
                    path={s.cover_url}
                    alt={s.title}
                    className="size-11 rounded-md overflow-hidden bg-card object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(s.artist as { name?: string } | null)?.name ?? "Unknown"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {(s.play_count ?? 0).toLocaleString()} plays
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {recentAlbums.length > 0 && (
          <HorizontalShelf title="Fresh Albums" showAllLink="/albums">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {recentAlbums.map((al) => (
                <AlbumTile key={al.id} album={al} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {editorialPlaylists.length > 0 && (
          <HorizontalShelf title="Made For You" showAllLink="/playlists">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {editorialPlaylists.map((p) => (
                <PlaylistTile key={p.id} playlist={p} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {moods.map((mood) =>
          mood.songs.length === 0 ? null : (
            <HorizontalShelf key={mood.genre} title={`${mood.genre} Essentials`}>
              <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                {mood.songs.map((s) => (
                  <TrackCard key={s.id} song={s} />
                ))}
              </div>
            </HorizontalShelf>
          ),
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
