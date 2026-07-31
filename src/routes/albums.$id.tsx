import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getAlbumWithSongs } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { useCurrency } from "@/stores/currency";
import { Play } from "lucide-react";

const albumQO = (id: string) =>
  queryOptions({
    queryKey: ["album", id],
    queryFn: () => getAlbumWithSongs({ data: { id } }),
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

function AlbumPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(albumQO(id));
  const setTrack = usePlayer((s) => s.setTrack);
  const album = data.album!;
  const artist = (album as { artist?: { id: string; name: string; avatar_url?: string | null } | null }).artist ?? null;

  const playFirst = () => {
    const first = data.songs[0];
    if (!first) return;
    setTrack({
      id: first.id,
      title: first.title,
      artistName: artist?.name ?? "Unknown",
      coverUrl: album.cover_url,
      durationSeconds: first.duration,
    });
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
        <button
          onClick={playFirst}
          disabled={data.songs.length === 0}
          className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 transition-transform disabled:opacity-40 mb-8"
          aria-label="Play album"
        >
          <Play className="size-6 fill-current ml-0.5" />
        </button>

        {data.songs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No songs in this album yet.</p>
        ) : (
          <div className="space-y-1">
            {data.songs.map((s, i) => (
              <button
                key={s.id}
                onClick={() =>
                  setTrack({
                    id: s.id,
                    title: s.title,
                    artistName: artist?.name ?? "Unknown",
                    coverUrl: album.cover_url,
                    durationSeconds: s.duration,
                  })
                }
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors text-left cursor-pointer group"
              >
                <span className="w-6 text-sm text-muted-foreground group-hover:hidden">{i + 1}</span>
                <Play className="w-6 size-4 fill-current hidden group-hover:block text-primary" />
                <div className="flex-1">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">{s.title}</p>
                </div>
                <span className="text-primary text-sm font-bold">
                  {useCurrency.getState().formatPrice(s.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
