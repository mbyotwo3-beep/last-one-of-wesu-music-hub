import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Music2, Play, Pause, ShoppingBag, Heart, ArrowLeft } from "lucide-react";
import { getSongById } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";
import { useSavedTrack } from "@/hooks/use-saved-track";

const songQO = (id: string) =>
  queryOptions({
    queryKey: ["song", id],
    queryFn: () => getSongById({ data: { id } }),
    staleTime: 0, // Always refetch to ensure immediate updates
  });

export const Route = createFileRoute("/songs/$id")({
  loader: async ({ context, params }) => {
    const song = await context.queryClient.ensureQueryData(songQO(params.id));
    if (!song) throw notFound();
    return song;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Song"} — Wesu+"` },
      {
        name: "description",
        content: `Listen to ${loaderData?.title ?? "music"} on Wesu+`,
      },
    ],
  }),
  component: SongPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Song not found.</div>,
});

function SongPage() {
  const { id } = Route.useParams();
  const { data: song } = useSuspenseQuery(songQO(id));
  const setTrack = usePlayer((state) => state.setTrack);
  const togglePlay = usePlayer((state) => state.togglePlay);
  const playing = usePlayer((state) => state.playing);
  const currentTrackId = usePlayer((state) => state.track?.id);
  const artist = song!.artist as { id: string; name: string } | null;
  const isFree = Number(song!.price ?? 0) <= 0;
  const { isSaved, toggle } = useSavedTrack(id);

  const isCurrentTrack = currentTrackId === song!.id;
  const isPlayingThisTrack = playing && isCurrentTrack;

  const play = () => {
    if (isCurrentTrack) {
      togglePlay();
      return;
    }

    setTrack({
      id: song!.id,
      title: song!.title,
      artistName: artist?.name ?? "Unknown",
      coverUrl: song!.cover_url,
      durationSeconds: song!.duration,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 pb-32">
      <button
        onClick={() => window.history.back()}
        className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 cursor-pointer transition-colors group"
      >
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" /> Back
      </button>

      <div className="rounded-3xl bg-gradient-to-br from-primary/30 via-card to-background p-6 md:p-10 shadow-2xl shadow-primary/10 border border-border/50">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-7">
          <StorageImage
            bucket="album-art"
            path={song!.cover_url}
            alt={song!.title}
            className="size-56 rounded-2xl overflow-hidden bg-card shadow-2xl object-cover shrink-0"
          />
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">Song</p>
            <h1 className="mt-2 text-4xl md:text-6xl font-black tracking-tight break-words">{song!.title}</h1>
            {artist ? (
              <Link
                to="/artists/$id"
                params={{ id: artist.id }}
                className="mt-3 inline-block text-lg text-muted-foreground hover:text-foreground hover:underline"
              >
                {artist.name}
              </Link>
            ) : (
              <p className="mt-3 text-lg text-muted-foreground">Unknown artist</p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              {song!.genre ?? "Music"}
              {song!.explicit ? " · Explicit" : ""}
              {song!.duration ? ` · ${Math.floor(song!.duration / 60)}:${String(song!.duration % 60).padStart(2, "0")}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={play}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground transition-transform hover:scale-105"
          >
            {isPlayingThisTrack ? (
              <Pause className="size-5 fill-current" />
            ) : (
              <Play className="size-5 fill-current" />
            )}
            {isPlayingThisTrack ? "Pause" : "Play"}
          </button>
          {isFree ? (
            <DownloadButton songId={song!.id} label="Download" />
          ) : (
            <Link
              to="/checkout"
              search={{ item: "song", id: song!.id }}
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-bold hover:bg-accent"
            >
              <ShoppingBag className="size-5" /> Buy {useCurrency.getState().formatPrice(song!.price)}
            </Link>
          )}
          <button
            onClick={toggle}
            className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-bold hover:bg-accent transition-colors"
          >
            <Heart
              className={`size-5 ${isSaved ? "fill-primary text-primary" : ""}`}
            />
            {isSaved ? "Liked" : "Like"}
          </button>
          <ShareMenu
            songId={song!.id}
            songTitle={song!.title}
            albumId={song!.album_id ?? undefined}
            artistId={artist?.id}
            artistName={artist?.name}
            type="song"
            className="relative z-20"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
        <Music2 className="size-5 text-primary" />
        {(song!.play_count ?? 0).toLocaleString()} plays
      </div>
    </div>
  );
}
