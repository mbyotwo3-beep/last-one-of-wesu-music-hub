import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useOfflineList } from "@/hooks/use-offline-list";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Play, RefreshCw } from "lucide-react";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { getHomeDiscover, getForYou } from "@/lib/music.functions";
import { getRecentlyPlayed } from "@/lib/play-history.functions";
import { useAuth } from "@/hooks/use-auth";
import { TrackCard, AlbumTile, ArtistTile, PlaylistTile } from "@/components/discover/TrackCard";
import { CarouselShelf } from "@/components/CarouselShelf";
import { getActiveCarousels } from "@/lib/carousel.functions";
import { HeroCarousel, type HeroSlide } from "@/components/HeroCarousel";
import { useHeroPool } from "@/hooks/use-hero-pool";
import { getActiveHeroSlides } from "@/lib/hero-carousel.functions";
import { SkeletonHeroCarousel, SkeletonShelf, SkeletonTrackRow } from "@/components/Skeleton";
import { RouteError as SharedRouteError } from "@/components/RouteError";

const discoverQO = queryOptions({
  queryKey: ["home-discover"],
  queryFn: () => getHomeDiscover(),
  staleTime: 5 * 60 * 1000,
});

// Called directly, the way discoverQO does — useServerFn is a hook and cannot
// be used to build a module-scope queryOptions.
const carouselsQO = queryOptions({
  queryKey: ["active-carousels"],
  queryFn: () => getActiveCarousels(),
  staleTime: 60 * 1000,
});

const heroQO = queryOptions({
  queryKey: ["active-hero-slides"],
  queryFn: () => getActiveHeroSlides(),
  staleTime: 60 * 1000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Listen Now — Wesu+" },
      {
        name: "description",
        content:
          "Stream the best Zambian and African music. Buy songs and albums with MTN MoMo, Airtel Money, Zamtel Kwacha, or card.",
      },
      { property: "og:title", content: "Wesu+ — Stream Zambian & African Music" },
      {
        property: "og:description",
        content:
          "Stream the best Zambian and African music. Buy songs and albums with Mobile Money.",
      },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  loader: async ({ context }) => {
    // Awaited, and the results are RETURNED so TanStack Start serializes them
    // into the router state and the client's very first render has the same
    // data the server rendered. Loading was a side effect only before —
    // nothing reached the client, so hydration re-painted the page from
    // skeletons and React tore the server markup down on every load.
    //
    // Offline cold start must not throw: the page renders last-known content
    // from snapshots instead (Spotify-style browsable cache). A null here is
    // that honest fallback, not a crash: the component gates the shelves on
    // data being present and offers a retry when the fetch failed.
    const [discover, carousels, hero] = await Promise.all([
      context.queryClient.ensureQueryData(discoverQO).catch(() => null),
      context.queryClient.ensureQueryData(carouselsQO).catch(() => null),
      context.queryClient.ensureQueryData(heroQO).catch(() => null),
    ]);
    return { discover, carousels, hero };
  },
  component: IndexRoute,
  errorComponent: SharedRouteError,
});

function IndexRoute() {
  return <HomePage />;
}

function HomePage() {
  // discover is the page's primary payload: its loading state gates the
  // shelves. Before, isLoading was ignored with everything defaulting to [] —
  // and the empty-state, then, claimed "No music has been published yet"
  // WHILE THE FEED WAS STILL ARRIVING. On a phone that is every cold boot:
  // relaunch after the process was killed, first launch after an update —
  // an open that lands on a fake "welcome" screen instead of the app.
  //
  // The loader's serialized result seeds the same queries with initialData,
  // so SERVER and CLIENT paint identically and hydration never disagrees.
  const boot = Route.useLoaderData() as {
    discover: unknown;
    carousels: unknown;
    hero: unknown;
  };
  const {
    data: discoverData,
    isLoading: discoverLoading,
    isError: discoverError,
    refetch: refetchDiscover,
  } = useOfflineList("home:discover", {
    queryKey: ["home-discover"],
    queryFn: () => getHomeDiscover(),
    staleTime: 5 * 60 * 1000,
    initialData: (boot?.discover ?? undefined) as
      | Awaited<ReturnType<typeof getHomeDiscover>>
      | undefined,
  });
  const setQueue = usePlayer((s) => s.setQueue);
  const { user } = useAuth();
  const forYouFn = useServerFn(getForYou);
  const recentlyPlayedFn = useServerFn(getRecentlyPlayed);
  const carouselsFn = useServerFn(getActiveCarousels);
  const heroSlidesFn = useServerFn(getActiveHeroSlides);

  const { data: carousels, isLoading: carouselsLoading } = useOfflineList("home:carousels", {
    queryKey: ["active-carousels"],
    queryFn: () => carouselsFn(),
    staleTime: 60 * 1000,
    initialData: (boot?.carousels ?? undefined) as
      | Awaited<ReturnType<typeof getActiveCarousels>>
      | undefined,
  });

  const { data: heroSlides, isLoading: heroSlidesLoading } = useOfflineList("home:hero", {
    queryKey: ["active-hero-slides"],
    queryFn: () => heroSlidesFn(),
    staleTime: 60 * 1000,
    initialData: (boot?.hero ?? undefined) as
      | Awaited<ReturnType<typeof getActiveHeroSlides>>
      | undefined,
  });

  // The signed-in shelves (For You, Recently Played) must render ONLY after
  // mount. The server cannot see the localStorage session, so a signed-in
  // listener's first client paint would disagree with the server HTML —
  // the same hydration failure the loader-seeding fixes elsewhere. Waiting
  // one effect-turn keeps server and client unified; the shelf then appears
  // as a normal post-hydration update.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: forYouData, isLoading: forYouLoading } = useOfflineList("home:foryou", {
    queryKey: ["for-you", user?.id],
    queryFn: () => forYouFn(),
    enabled: mounted && !!user,
    staleTime: 5 * 60 * 1000,
  });
  const { data: recentlyPlayed, isLoading: recentlyPlayedLoading } = useOfflineList("home:recent", {
    queryKey: ["recently-played", user?.id],
    queryFn: () => recentlyPlayedFn(),
    enabled: mounted && !!user,
    staleTime: 60 * 1000,
  });
  // Shape-guarded shelf reads. The feeds arrive through server-fn RPCs; any
  // payload that is not the exact shape (e.g. an error envelope from a
  // middleware rejection) must degrade to "shelf hidden", never to a
  // TypeError that unmounts the whole home route.
  const forYouLists = (forYouData && typeof forYouData === "object"
    ? (forYouData as { forYou?: unknown[]; byFavoriteArtists?: unknown[]; favoriteArtists?: unknown[] })
    : null);
  const forYouTracks = Array.isArray(forYouLists?.forYou) ? forYouLists!.forYou! : [];
  const byFavoriteArtists = Array.isArray(forYouLists?.byFavoriteArtists)
    ? forYouLists!.byFavoriteArtists!
    : [];
  const favoriteArtists = Array.isArray(forYouLists?.favoriteArtists)
    ? forYouLists!.favoriteArtists!
    : [];
  const recentTracks = Array.isArray(recentlyPlayed) ? recentlyPlayed : [];
  const carouselList = Array.isArray(carousels) ? carousels : [];

  const {
    featured = [],
    newReleases = [],
    trending = [],
    topArtists = [],
    recentAlbums = [],
    editorialPlaylists = [],
    moods = [],
  } = discoverData ?? {};
  const moodList = Array.isArray(moods) ? moods : [];

  // Admin slides always win. Only when the table has no active rows does the
  // hero fall back to rotating through the catalogue.
  //
  // Everything below runs unconditionally so the hook order stays stable: making
  // it conditional is exactly how hooks-after-early-return crashed
  // albums.$id.tsx twice.
  const heroPool = useHeroPool(
    useMemo(() => [...featured, ...recentAlbums], [featured, recentAlbums]),
    useMemo(() => [...trending, ...newReleases], [trending, newReleases]),
  );

  const adminHeroSlides: HeroSlide[] = useMemo(
    () =>
      (heroSlides ?? []).map((slide) => ({
        id: slide.id,
        title: slide.title,
        description: slide.description,
        imageUrl: slide.image_url,
        videoUrl: slide.video_url || undefined,
        ctaText: slide.cta_text,
        ctaLink: slide.cta_link,
        ctaExternal: slide.cta_external,
        ctaTarget: (slide as any).link_target ?? "_self",
      })),
    [heroSlides],
  );

  const usingAdminSlides = adminHeroSlides.length > 0;
  const heroSlidesToShow: HeroSlide[] = usingAdminSlides ? adminHeroSlides : heroPool;
  // Empty means LOADED AND empty. Loading or failed are separate states with
  // their own surfaces below — "empty" is only allowed to say "no music has
  // been published yet" when the feed truly arrived empty.
  const empty =
    !discoverLoading &&
    !discoverError &&
    featured.length === 0 &&
    newReleases.length === 0 &&
    trending.length === 0 &&
    topArtists.length === 0 &&
    recentAlbums.length === 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-10">
        {/* Hero Carousel - Netlify-style with auto-rotation
             *
             * Two sources, and the admin always wins:
             *
             *   1. hero_carousel_slides, set at /admin -> Hero Carousel.
             *   2. Otherwise a rotating pool of real songs and albums, so the
             *      hero is never stuck showing one album forever.
             *
             * Both go through the SAME HeroCarousel, so the rotation, the dots,
             * the swipe and the CTA behaviour are identical either way. That is
             * deliberate: the old fallback was a second, near-identical layout
             * that looked like the hero, and it is what made this look
             * hardcoded and unfixable.
             */}
            {heroSlidesLoading ? (
              <SkeletonHeroCarousel />
            ) : heroSlidesToShow.length > 0 ? (
              <HeroCarousel slides={heroSlidesToShow} />
            ) : (
              <section className="rounded-2xl bg-card ring-1 ring-white/5 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing to show yet —{" "}
                  <Link to="/browse" className="underline">
                    browse the catalogue
                  </Link>
                  .
                </p>
              </section>
            )}

            {/* Custom Carousels configured by Admin / Superadmin */}
            {carouselsLoading && !carousels ? (
              <SkeletonShelf count={5} />
            ) : (
              carousels &&
              carouselList.map((carousel) => <CarouselShelf key={carousel.id} carousel={carousel} />)
            )}

            {/* The home feed booting: skeleton, not the empty state. Loading
                 * must never render as "No music has been published yet" —
                 * that line announced a launch defect that does not exist, on
                 * every phone cold boot, in the seconds before the shelves
                 * arrive. A failed fetch draws its own retry surface instead.
                 */}
            {discoverLoading && !discoverData ? (
              <div className="space-y-10">
                <SkeletonShelf count={6} />
                <SkeletonShelf count={6} />
              </div>
            ) : discoverError ? (
              <div className="text-center py-20">
                <Globe className="size-8 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
                <h2 className="text-lg font-bold mb-2">The feed didn't load</h2>
                <p className="text-muted-foreground text-sm mb-5">
                  Check your connection and try again. Your downloads still play.
                </p>
                <button
                  onClick={refetchDiscover}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] cursor-pointer"
                >
                  <RefreshCw className="size-4" />
                  Try again
                </button>
              </div>
            ) : null}

            {user && recentTracks.length > 0 && (
              <HorizontalShelf title="Recently Played" showAllLink="/library">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {recentTracks.map((s: any) => (
                    <TrackCard key={s.id} song={s} />
                  ))}
                </div>
              </HorizontalShelf>
            )}

            {user && forYouTracks.length > 0 && (
              <HorizontalShelf title="Made For You">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {forYouTracks.map((s: any) => (
                    <TrackCard key={s.id} song={s} />
                  ))}
                </div>
              </HorizontalShelf>
            )}

            {user && byFavoriteArtists.length > 0 && (
              <HorizontalShelf title="More from artists you like">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {byFavoriteArtists.map((s: any) => (
                    <TrackCard key={s.id} song={s} />
                  ))}
                </div>
              </HorizontalShelf>
            )}

            {user && favoriteArtists.length > 0 && (
              <HorizontalShelf title="Your favorite artists" showAllLink="/artists">
                <div className="grid grid-flow-col auto-cols-[8rem] md:auto-cols-[10rem] gap-4 min-w-max">
                  {favoriteArtists.map((a: any) => (
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
                        setQueue(
                          trending.map((t: any) => ({
                            id: t.id,
                            title: t.title,
                            artistName: (t.artist as { name?: string } | null)?.name ?? "Unknown",
                            coverUrl: t.cover_url,
                            durationSeconds: (t as { duration?: number }).duration,
                          })),
                          i,
                        )
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
              <HorizontalShelf title="Editorial Playlists" showAllLink="/playlists">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {editorialPlaylists.map((p) => (
                    <PlaylistTile key={p.id} playlist={p} />
                  ))}
                </div>
              </HorizontalShelf>
            )}

            {moodList.map((mood) =>
              !mood || !Array.isArray(mood.songs) || mood.songs.length === 0 ? null : (
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
