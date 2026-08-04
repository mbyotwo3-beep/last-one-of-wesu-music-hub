import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { usePlatform } from "@/hooks/use-platform";
import { MobileBrowse } from "@/components/mobile/screens/MobileBrowse";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import {
  getFeaturedAlbums,
  getNewReleases,
  getTrendingSongs,
  getTopArtists,
  getRecentAlbums,
  getPublicPlaylists,
  getGenres,
  getSongsByGenre,
} from "@/lib/music.functions";
import {
  TrackCard,
  AlbumTile,
  ArtistTile,
  GenreTile,
  PlaylistTile,
} from "@/components/discover/TrackCard";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getRecentlyPlayed } from "@/lib/play-history.functions";
import { useAuth } from "@/hooks/use-auth";

const featuredQO = queryOptions({
  queryKey: ["browse-featured"],
  queryFn: () => getFeaturedAlbums(),
  staleTime: 5 * 60 * 1000,
});
const newReleasesQO = queryOptions({
  queryKey: ["browse-new"],
  queryFn: () => getNewReleases(),
  staleTime: 5 * 60 * 1000,
});
const trendingQO = queryOptions({
  queryKey: ["browse-trending"],
  queryFn: () => getTrendingSongs(),
  staleTime: 5 * 60 * 1000,
});
const topArtistsQO = queryOptions({
  queryKey: ["browse-artists"],
  queryFn: () => getTopArtists(),
  staleTime: 5 * 60 * 1000,
});
const recentAlbumsQO = queryOptions({
  queryKey: ["browse-recent-albums"],
  queryFn: () => getRecentAlbums(),
  staleTime: 5 * 60 * 1000,
});
const playlistsQO = queryOptions({
  queryKey: ["browse-playlists"],
  queryFn: () => getPublicPlaylists(),
  staleTime: 5 * 60 * 1000,
});
const genresQO = queryOptions({
  queryKey: ["browse-genres"],
  queryFn: () => getGenres(),
  staleTime: 10 * 60 * 1000,
});
const genreSongsQO = (genre: string) =>
  queryOptions({
    queryKey: ["browse-genre-songs", genre],
    queryFn: () => getSongsByGenre({ data: { genre, limit: 24 } }),
    staleTime: 5 * 60 * 1000,
    enabled: !!genre,
  });

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse — Wesu+" },
      {
        name: "description",
        content: "Discover and stream the best Zambian and African music on Wesu+.",
      },
      { property: "og:url", content: "https://www.wesuplusly.com/browse" },
    ],
    links: [{ rel: "canonical", href: "https://www.wesuplusly.com/browse" }],
  }),
  validateSearch: (search: Record<string, unknown>): { genre?: string } =>
    typeof search.genre === "string" ? { genre: search.genre } : {},
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(featuredQO);
    context.queryClient.ensureQueryData(newReleasesQO);
    context.queryClient.ensureQueryData(trendingQO);
    context.queryClient.ensureQueryData(topArtistsQO);
    context.queryClient.ensureQueryData(recentAlbumsQO);
    context.queryClient.ensureQueryData(playlistsQO);
    context.queryClient.ensureQueryData(genresQO);
  },
  component: BrowseRoute,
});

function BrowseRoute() {
  const platform = usePlatform();
  return platform === "native" ? <MobileBrowse /> : <BrowsePage />;
}

function BrowsePage() {
  const { data: featured } = useSuspenseQuery(featuredQO);
  const { data: newReleases } = useSuspenseQuery(newReleasesQO);
  const { data: trending } = useSuspenseQuery(trendingQO);
  const { data: topArtists } = useSuspenseQuery(topArtistsQO);
  const { data: recentAlbums } = useSuspenseQuery(recentAlbumsQO);
  const { data: playlists } = useSuspenseQuery(playlistsQO);
  const { data: genres } = useSuspenseQuery(genresQO);
  const { genre: activeGenre } = Route.useSearch();
  const setTrack = usePlayer((s) => s.setTrack);
  const { user } = useAuth();
  const recentlyPlayedFn = useServerFn(getRecentlyPlayed);
  const { data: recentlyPlayed } = useQuery({
    queryKey: ["recently-played", user?.id],
    queryFn: () => recentlyPlayedFn(),
    enabled: !!user && !activeGenre,
    staleTime: 60_000,
  });

  const empty =
    featured.length === 0 &&
    newReleases.length === 0 &&
    trending.length === 0 &&
    topArtists.length === 0 &&
    recentAlbums.length === 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="lg:max-w-[calc(100vw-16rem)] lg:ml-auto px-4 md:px-6 py-6 md:py-8 space-y-10">
        <header className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Browse</h1>
            <p className="text-muted-foreground mt-1">
              New music, top charts, artists and moods — updated live from Wesu+.
            </p>
          </div>
          {genres.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide max-w-full">
              <Link
                to="/browse"
                search={{} as never}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  !activeGenre
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                All
              </Link>
              {genres.slice(0, 10).map((g) => (
                <Link
                  key={g.genre}
                  to="/browse"
                  search={{ genre: g.genre } as never}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    activeGenre === g.genre
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {g.genre}
                </Link>
              ))}
            </div>
          )}
        </header>

        {activeGenre ? (
          <GenreView genre={activeGenre} />
        ) : (
          <>
            {user && recentlyPlayed && recentlyPlayed.length > 0 && (
              <HorizontalShelf title="Jump back in" showAllLink="/library">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {recentlyPlayed.map((s: any) => (
                    <TrackCard key={s.id} song={s} />
                  ))}
                </div>
              </HorizontalShelf>
            )}

            {featured.length > 0 && (
              <HorizontalShelf title="Must-Have Albums" showAllLink="/must-have">
                <div className="grid grid-flow-col auto-cols-[10rem] md:auto-cols-[12rem] gap-4 min-w-max">
                  {featured.map((al) => (
                    <AlbumTile key={al.id} album={al} />
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

            {genres.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-2xl font-bold tracking-tight">Categories</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {genres.slice(0, 12).map((g, i) => (
                    <GenreTile key={g.genre} genre={g.genre} index={i} />
                  ))}
                </div>
              </section>
            )}

            {topArtists.length > 0 && (
              <HorizontalShelf title="Artists You Should Know" showAllLink="/artists">
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
                  <h2 className="text-2xl font-bold tracking-tight">Hot Tracks</h2>
                  <Link
                    to="/hot-tracks"
                    className="text-sm text-primary hover:text-primary/80 font-medium cursor-pointer"
                  >
                    See All
                  </Link>
                </div>
                <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                  {trending.map((s, i) => (
                    <TrackListRow
                      key={s.id}
                      index={i + 1}
                      song={s}
                      onPlay={() =>
                        setTrack({
                          id: s.id,
                          title: s.title,
                          artistName:
                            (s.artist as { name?: string } | null)?.name ?? "Unknown",
                          coverUrl: s.cover_url,
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {recentAlbums.length > 0 && (
              <HorizontalShelf title="Recently Added Albums" showAllLink="/recently-added">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {recentAlbums.map((al) => (
                    <AlbumTile key={al.id} album={al} />
                  ))}
                </div>
              </HorizontalShelf>
            )}

            {playlists.length > 0 && (
              <HorizontalShelf title="Editorial Playlists" showAllLink="/playlists">
                <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
                  {playlists.map((p) => (
                    <PlaylistTile key={p.id} playlist={p} />
                  ))}
                </div>
              </HorizontalShelf>
            )}
          </>
        )}

        {empty && !activeGenre && (
          <p className="text-center text-muted-foreground py-12">
            No music yet. Check back soon.
          </p>
        )}
      </div>
    </div>
  );
}

function GenreView({ genre }: { genre: string }) {
  const { data: songs } = useSuspenseQuery(genreSongsQO(genre));
  if (songs.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No {genre} songs yet.
      </p>
    );
  }
  return (
    <section>
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-2xl font-bold tracking-tight">{genre}</h2>
        <span className="text-sm text-muted-foreground">
          {songs.length} track{songs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {songs.map((s) => (
          <TrackCard key={s.id} song={s} />
        ))}
      </div>
    </section>
  );
}

function TrackListRow({
  index,
  song,
  onPlay,
}: {
  index: number;
  song: {
    id: string;
    title: string;
    cover_url: string | null;
    play_count?: number | null;
    artist?: { id: string; name: string } | null;
  };
  onPlay: () => void;
}) {
  return (
    <div className="w-full flex items-center gap-4 p-2 rounded-lg hover:bg-white/5 transition-colors group">
      <span className="w-6 text-sm text-muted-foreground tabular-nums">{index}</span>
      <button onClick={onPlay} className="shrink-0 cursor-pointer" aria-label={`Play ${song.title}`}>
        <StorageImage
          bucket="album-art"
          path={song.cover_url}
          alt={song.title}
          className="size-11 rounded-md overflow-hidden bg-card object-cover"
        />
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onPlay} className="text-left w-full cursor-pointer">
          <p className="text-sm font-semibold truncate">{song.title}</p>
        </button>
        {song.artist?.id ? (
          <Link
            to="/artists/$id"
            params={{ id: song.artist.id }}
            className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline cursor-pointer"
          >
            {song.artist.name}
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground truncate">Unknown</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {(song.play_count ?? 0).toLocaleString()} plays
      </span>
    </div>
  );
}
