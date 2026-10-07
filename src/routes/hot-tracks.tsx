import { createFileRoute } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { Play } from "lucide-react";
import { getTrendingSongs } from "@/lib/music.functions";
import { useOfflineList } from "@/hooks/use-offline-list";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";

export const Route = createFileRoute("/hot-tracks")({
  head: () => ({ meta: [{ title: "Hot Tracks — Wesu+" }] }),
  component: Page,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

function Page() {
  const { data, isLoading, error } = useOfflineList("lists:trending", {
    queryKey: ["trending"],
    queryFn: () => getTrendingSongs(),
    staleTime: 60_000,
  });
  const setQueue = usePlayer((s) => s.setQueue);
  const songs = (data ?? []) as any[];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Hot Tracks</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-destructive">Failed to load hot tracks.</p>
      ) : songs.length === 0 ? (
        <p className="text-muted-foreground">No trending tracks yet.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {songs.map((s, i) => (
            <div
              key={s.id}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border last:border-b-0"
            >
              <button
                type="button"
                onClick={() =>
                  setQueue(
                    songs.map((t) => ({
                      id: t.id,
                      title: t.title,
                      artistName: t.artist?.name ?? "Unknown",
                      coverUrl: t.cover_url,
                      durationSeconds: t.duration,
                      price: t.price,
                    })),
                    i,
                  )
                }
                className="min-w-0 flex-1 flex items-center gap-3 text-left"
                aria-label={`Play ${s.title}`}
              >
                <span className="text-sm text-muted-foreground w-6 text-right">{i + 1}</span>
                <StorageImage
                  bucket="album-art"
                  path={s.cover_url}
                  alt=""
                  className="size-12 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.artist?.name ?? "Unknown"}
                  </div>
                </div>
                <Play className="size-4 text-muted-foreground" />
              </button>
              <DownloadButton
                songId={s.id}
                title={s.title}
                artistName={s.artist?.name}
                coverUrl={s.cover_url}
              />
              <ShareMenu
                songId={s.id}
                songTitle={s.title}
                coverUrl={s.cover_url}
                artistId={s.artist?.id}
                artistName={s.artist?.name}
                type="song"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
