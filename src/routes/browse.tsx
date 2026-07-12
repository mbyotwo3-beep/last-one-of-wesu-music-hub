import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { usePlatform } from "@/hooks/use-platform";
import { MobileBrowse } from "@/components/mobile/screens/MobileBrowse";
import { HorizontalShelf } from "@/components/HorizontalShelf";
import { StorageImage } from "@/components/StorageImage";
import { Play } from "lucide-react";
import { usePlayer } from "@/stores/player";
import {
  getFeaturedAlbums,
  getNewReleases,
  getTrendingSongs,
} from "@/lib/music.functions";

const featuredQO = queryOptions({
  queryKey: ["featured-albums"],
  queryFn: () => getFeaturedAlbums(),
  staleTime: 5 * 60 * 1000,
});
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
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(featuredQO);
    context.queryClient.ensureQueryData(newReleasesQO);
    context.queryClient.ensureQueryData(trendingQO);
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
  const setTrack = usePlayer((s) => s.setTrack);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="lg:max-w-[calc(100vw-16rem)] lg:ml-auto px-4 md:px-6 py-6 md:py-8">
        {/* Featured albums (Must-Have) */}
        {featured.length > 0 && (
          <HorizontalShelf title="Must-Have Albums" showAllLink="/must-have">
            <div className="grid grid-flow-col auto-cols-[10rem] md:auto-cols-[12rem] gap-4 min-w-max">
              {featured.map((al) => (
                <AlbumTile key={al.id} album={al} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {/* New Music from real songs */}
        {newReleases.length > 0 && (
          <HorizontalShelf title="New Music" showAllLink="/new-music">
            <div className="grid grid-flow-col auto-cols-[9rem] md:auto-cols-[11rem] gap-4 min-w-max">
              {newReleases.map((s) => (
                <SongTile key={s.id} song={s} onPlay={() => setTrack({
                  id: s.id,
                  title: s.title,
                  artistName: (s.artist as any)?.name ?? "Unknown",
                  coverUrl: s.cover_url,
                  durationSeconds: s.duration,
                })} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {/* Hot Tracks - list */}
        {trending.length > 0 && (
          <HorizontalShelf title="Hot Tracks" showAllLink="/hot-tracks">
            <div className="w-full space-y-1">
              {trending.map((s, i) => (
                <TrackListRow key={s.id} index={i + 1} song={s} onPlay={() => setTrack({
                  id: s.id,
                  title: s.title,
                  artistName: (s.artist as any)?.name ?? "Unknown",
                  coverUrl: s.cover_url,
                })} />
              ))}
            </div>
          </HorizontalShelf>
        )}

        {featured.length === 0 && newReleases.length === 0 && trending.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            No music yet. Check back soon.
          </p>
        )}
      </div>
    </div>
  );
}

function AlbumTile({ album }: { album: any }) {
  return (
    <Link to="/albums/$id" params={{ id: album.id }} className="group block">
      <StorageImage
        bucket="album-art"
        path={album.cover_url}
        alt={album.title}
        className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover"
      />
      <p className="mt-2 text-sm font-semibold truncate">{album.title}</p>
      <p className="text-xs text-muted-foreground truncate">
        {(album.artist as any)?.name ?? "Various"}
      </p>
    </Link>
  );
}

function SongTile({ song, onPlay }: { song: any; onPlay: () => void }) {
  return (
    <button onClick={onPlay} className="group text-left">
      <div className="relative">
        <StorageImage
          bucket="album-art"
          path={song.cover_url}
          alt={song.title}
          className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 object-cover"
        />
        <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
            <Play className="size-5 fill-current ml-0.5" />
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold truncate">{song.title}</p>
      <p className="text-xs text-muted-foreground truncate">
        {(song.artist as any)?.name ?? "Unknown"}
      </p>
    </button>
  );
}

function TrackListRow({ index, song, onPlay }: { index: number; song: any; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
    >
      <span className="w-6 text-sm text-muted-foreground group-hover:hidden">{index}</span>
      <Play className="w-6 text-sm hidden group-hover:block size-4 fill-current" />
      <StorageImage
        bucket="album-art"
        path={song.cover_url}
        alt={song.title}
        className="size-10 rounded-md overflow-hidden bg-card object-cover"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{song.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {(song.artist as any)?.name ?? "Unknown"}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">
        {(song.play_count ?? 0).toLocaleString()} plays
      </span>
    </button>
  );
}
