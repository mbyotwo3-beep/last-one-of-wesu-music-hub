import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getAlbumWithSongs } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";
import { Play, Pause, Shuffle, ShoppingBag, Heart, Clock, ArrowLeft } from "lucide-react";
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

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTotalRuntime(seconds: number) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

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
    <div
      className={`w-full flex items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-xl transition-all group cursor-pointer ${
        isCurrentTrack ? "bg-primary/10 text-primary" : "hover:bg-accent/40 text-foreground"
      }`}
      onClick={() => onPlaySong(s, i)}
    >
      {/* Index or Play / Pause state */}
      <div className="w-8 shrink-0 flex items-center justify-center">
        {isPlayingThisTrack ? (
          <div className="flex items-center gap-0.5">
            <span className="w-1 h-3.5 bg-primary rounded-full animate-pulse" />
            <span className="w-1 h-5 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2.5 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        ) : isCurrentTrack ? (
          <Play className="size-4 fill-current text-primary" />
        ) : (
          <>
            <span className="text-xs font-semibold text-muted-foreground group-hover:hidden">{i + 1}</span>
            <Play className="size-4 fill-current hidden group-hover:block text-foreground" />
          </>
        )}
      </div>

      {/* Song title & Artist name */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isCurrentTrack ? "text-primary" : "text-foreground"}`}>
          {s.title}
        </p>
        {artist && (
          <p className="text-xs text-muted-foreground truncate sm:hidden">{artist.name}</p>
        )}
      </div>

      {/* Duration */}
      <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline-block">
        {formatDuration(s.duration)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {Number(s.price ?? 0) > 0 && (
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full mr-1">
            {useCurrency.getState().formatPrice(s.price)}
          </span>
        )}

        <DownloadButton songId={s.id} />

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={`p-1.5 rounded-full transition-colors cursor-pointer ${
            isSaved ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
          }`}
          title={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
          aria-label={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
        >
          <Heart className={`size-4 ${isSaved ? "fill-current" : ""}`} />
        </button>

        <ShareMenu
          songId={s.id}
          songTitle={s.title}
          albumId={albumTracks[i]?.id}
          artistId={artist?.id}
          artistName={artist?.name}
          type="song"
          className="relative z-20 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
  );
}

function AlbumPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
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
  const totalDuration = data.songs.reduce((acc, s) => acc + (s.duration || 0), 0);

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

  const playShuffle = () => {
    if (data.songs.length === 0) return;
    const shuffled = [...albumTracks].sort(() => Math.random() - 0.5);
    setQueue(shuffled, 0);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
      {/* Back navigation */}
      <button
        onClick={() => navigate({ to: "/albums" })}
        className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 cursor-pointer transition-colors group"
      >
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Albums
      </button>

      {/* Apple Music 2-Column Layout on Desktop */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8 lg:gap-12">
        {/* Left Column: Sticky Cover & Album Meta */}
        <div className="w-full max-w-sm lg:w-80 lg:shrink-0 lg:sticky lg:top-8 flex flex-col items-center lg:items-start text-center lg:text-left">
          {/* Cover Art with subtle ambient glow shadow */}
          <div className="relative w-60 h-60 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-2xl overflow-hidden shadow-2xl shadow-primary/20 bg-card ring-1 ring-border/50 mb-6 shrink-0">
            <StorageImage
              bucket="album-art"
              path={album.cover_url}
              alt={album.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Badge & Title */}
          <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1.5">
            Album
          </p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight mb-2 break-words leading-tight">
            {album.title}
          </h1>

          {/* Artist link */}
          {artist && (
            <Link
              to="/artists/$id"
              params={{ id: artist.id }}
              className="text-base sm:text-lg font-semibold text-foreground/90 hover:text-primary transition-colors mb-2 inline-block"
            >
              {artist.name}
            </Link>
          )}

          {/* Metadata */}
          <p className="text-xs text-muted-foreground font-medium mb-6">
            {data.songs.length} {data.songs.length === 1 ? "song" : "songs"}
            {totalDuration > 0 ? ` • ${formatTotalRuntime(totalDuration)}` : ""}
            {album.release_date ? ` • ${new Date(album.release_date).getFullYear()}` : ""}
          </p>

          {/* Primary Action Buttons (Apple Music style) */}
          <div className="w-full flex flex-col gap-3">
            <div className="flex items-center gap-3 w-full">
              {/* Play All button */}
              <button
                onClick={playFirst}
                disabled={data.songs.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:brightness-110 active:scale-[0.98] transition-all shadow-md cursor-pointer disabled:opacity-40"
              >
                {isAlbumPlaying ? (
                  <><Pause className="size-4 fill-current" /> Pause</>
                ) : (
                  <><Play className="size-4 fill-current ml-0.5" /> Play</>
                )}
              </button>

              {/* Shuffle button */}
              <button
                onClick={playShuffle}
                disabled={data.songs.length === 0}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-secondary hover:bg-accent text-foreground font-medium border border-border transition-colors cursor-pointer disabled:opacity-40"
                title="Shuffle"
                aria-label="Shuffle album"
              >
                <Shuffle className="size-4" />
              </button>

              {/* Share */}
              <ShareMenu
                albumId={album.id}
                albumTitle={album.title}
                artistId={artist?.id}
                artistName={artist?.name}
                type="album"
                className="p-3 rounded-full bg-secondary border border-border hover:bg-accent text-foreground transition-colors cursor-pointer"
              />
            </div>

            {/* Buy Album button if priced */}
            {Number(album.price) > 0 && (
              <Link
                to="/checkout"
                search={{ item: "album", id: album.id }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-6 rounded-full bg-secondary hover:bg-accent border border-border text-sm font-semibold transition-colors cursor-pointer"
              >
                <ShoppingBag className="size-4 text-primary" />
                Buy Album — {useCurrency.getState().formatPrice(album.price)}
              </Link>
            )}
          </div>
        </div>

        {/* Right Column: Tracklist */}
        <div className="flex-1 w-full min-w-0">
          {/* Table Header */}
          <div className="flex items-center gap-3 sm:gap-4 px-3 pb-3 mb-2 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="w-8 text-center shrink-0">#</span>
            <span className="flex-1">Title</span>
            <span className="hidden sm:inline-block w-16 text-right shrink-0">
              <Clock className="size-3.5 inline mr-1" />
            </span>
            <span className="w-24 text-right shrink-0">Actions</span>
          </div>

          {/* Tracklist Rows */}
          {data.songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">No songs in this album yet.</p>
            </div>
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
    </div>
  );
}
