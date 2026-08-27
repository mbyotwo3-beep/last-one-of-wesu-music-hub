import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { getTrendingSongs } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { DownloadButton } from "@/components/DownloadButton";

export const Route = createFileRoute("/hot-tracks")({
  head: () => ({ meta: [{ title: "Hot Tracks — Wesu+" }] }),
  component: Page,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

function Page() {
  const { data, isLoading } = useQuery({ queryKey: ["trending"], queryFn: () => getTrendingSongs() });
  const setQueue = usePlayer((s) => s.setQueue);
  const songs = (data ?? []) as any[];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Hot Tracks</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
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
                    })),
                    i,
                  )
                }
                className="min-w-0 flex-1 flex items-center gap-3 text-left"
                aria-label={`Play ${s.title}`}
              >
                <span className="text-sm text-muted-foreground w-6 text-right">{i + 1}</span>
                <StorageImage bucket="album-art" path={s.cover_url} alt="" className="size-12 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.artist?.name ?? "Unknown"}</div>
                </div>
                <Play className="size-4 text-muted-foreground" />
              </button>
              {Number(s.price ?? 0) <= 0 && <DownloadButton songId={s.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
