import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getAlbumWithSongs } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";
import { Play, Pause, ShoppingBag, Heart } from "lucide-react";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";
import { useSavedTrack } from "@/hooks/use-saved-track";

const albumQO = (id: string) =>
  queryOptions({
    queryKey: ["album", id],
    queryFn: () => getAlbumWithSongs({ data: { id } }),
    staleTime: 0, // Always refetch to ensure immediate updates
  });

export const Route = createFileRoute("/albums/$id")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(albumQO(params.id));
    if (!data.album) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.album?.title ?? "Album"} — Wesu+` },
      { name: "description", content: `Listen to ${loaderData?.album?.title ?? "this album"} on Wesu+.` },
    ],
  }),
  component: AlbumPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Album not found.</div>,
});

// Extracted into its own component so useSavedTrack is called at component level (not inside .map)
interface SongRowProps {
  song: any;
  index: number;
  artist: { id: string; name: string; avatar_url?: string | null } | null;
  albumTracks: any[];
  currentTrackId: string | undefined;
  playing: boolean;
  onPlaySong: (song: any, index: number) => void;
}

function SongRow({ song: s, index: i, artist, albumTracks, currentTrackId, playing, onPlaySong }: SongRowProps) {
  const { isSaved, toggle } = useSavedTrack(s.id);
  const isCurrentTrack = currentTrackId === s.id;
  const isPlayingThisTrack = playing && isCurrentTrack;

  return (
    <div className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group">
      <button
        onClick={() => onPlaySong(s, i)}
        className="flex items-center gap-4 flex-1 text-left cursor-pointer"
      >
        {isPlayingThisTrack ? (
          <Pause className="w-6 size-4 fill-current text-primary" />
        ) : (
          <>
            <span className="w-6 text-sm text-muted-foreground group-hover:hidden">{i + 1}</span>
            <Play className="w-6 size-4 fill-current hidden group-hover:block text-primary" />
          </>
        )}
        <div className="flex-1">
          <p className="font-semibold text-sm group-hover:text-primary transition-colors">{s.title}</p>
        </div>
      </button>
      <div className="flex items-center gap-2 relative z-10">
        <span className="text-primary text-sm font-bold">
          {useCurrency.getState().formatPrice(s.price)}
        </span>
        <DownloadButton songId={s.id} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Heart
            className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          />
        </button>
        <ShareMenu
          songId={s.id}
          songTitle={s.title}
          albumId={albumTracks[i]?.id}
          artistId={artist?.id}
          artistName={artist?.name}
          type="song"
          className="relative z-20"
        />
      </div>
    </div>
  );
}

function AlbumPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(albumQO(id));
  const setQueue = usePlayer((s) => s.setQueue);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);
  const album = data.album!;
  const artist = (album as { artist?: { id: string; name: string; avatar_url?: string | null } | null }).artist ?? null;

  const albumTracks = data.songs.map((s) => ({
    id: s.id,
    title: s.title,
    artistName: artist?.name ?? "Unknown",
    coverUrl: album.cover_url,
    durationSeconds: s.duration,
  }));

  const isAlbumPlaying = playing && data.songs.some((s) => s.id === currentTrackId);

  const playFirst = () => {
    if (data.songs.length === 0) return;
    if (isAlbumPlaying) {
      togglePlay();
      return;
    }
    const currentIndexInAlbum = data.songs.findIndex((s) => s.id === currentTrackId);
    if (currentIndexInAlbum !== -1) {
      togglePlay();
    } else {
      setQueue(albumTracks, 0);
    }
  };

  const handlePlaySong = (song: any, index: number) => {
    const isCurrentTrack = currentTrackId === song.id;
    if (isCurrentTrack) {
      togglePlay();
      return;
    }
    setQueue(albumTracks, index);
  };

  return (
    <div className="min-h-screen pb-24">
      <div className="bg-gradient-to-b from-primary/30 to-background pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row gap-6 items-end">
          <StorageImage
            bucket="album-art"
            path={album.cover_url}
            alt={album.title}
            className="size-48 md:size-60 rounded-xl overflow-hidden bg-card ring-1 ring-white/10 shadow-2xl object-cover"
          />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Album</p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">{album.title}</h1>
            {artist && (
              <Link
                to="/artists/$id"
                params={{ id: artist.id }}
                className="text-sm font-semibold hover:underline"
              >
                {artist.name}
              </Link>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {data.songs.length} song{data.songs.length === 1 ? "" : "s"}
              {album.release_date ? ` · ${new Date(album.release_date).getFullYear()}` : ""}
              {" · "}{useCurrency.getState().formatPrice(album.price)}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={playFirst}
            disabled={data.songs.length === 0}
            className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 transition-transform disabled:opacity-40 cursor-pointer"
            aria-label={isAlbumPlaying ? "Pause album" : "Play album"}
          >
            {isAlbumPlaying ? (
              <Pause className="size-6 fill-current" />
            ) : (
              <Play className="size-6 fill-current ml-0.5" />
            )}
          </button>
          {Number(album.price) > 0 && (
            <Link
              to="/checkout"
              search={{ item: "album", id: album.id }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-secondary border border-border hover:bg-accent transition-colors cursor-pointer"
            >
              <ShoppingBag className="size-4" />
              Buy Album — {useCurrency.getState().formatPrice(album.price)}
            </Link>
          )}
          <ShareMenu
            albumId={album.id}
            albumTitle={album.title}
            artistId={artist?.id}
            artistName={artist?.name}
            type="album"
            className="relative z-20"
          />
        </div>

        {data.songs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No songs in this album yet.</p>
        ) : (
          <div className="space-y-1">
            {data.songs.map((s, i) => (
              <SongRow
                key={s.id}
                song={s}
                index={i}
                artist={artist}
                albumTracks={albumTracks}
                currentTrackId={currentTrackId}
                playing={playing}
                onPlaySong={handlePlaySong}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
