import { createFileRoute, Link } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { getFeaturedAlbums } from "@/lib/music.functions";
import { useOfflineList } from "@/hooks/use-offline-list";
import { StorageImage } from "@/components/StorageImage";

export const Route = createFileRoute("/must-have")({
  head: () => ({ meta: [{ title: "Must-Have Albums — Wesu+" }] }),
  component: Page,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

function Page() {
  const { data, isLoading, error, refetch } = useOfflineList("lists:featured-albums", {
    queryKey: ["featured-albums"],
    queryFn: () => getFeaturedAlbums(),
    staleTime: 5 * 60 * 1000,
  });
  const albums = ((data ?? []) as any[]).filter((a) => a?.id);
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Must-Have Albums</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : error ? (
        <div>
          <p className="text-destructive mb-3">Failed to load albums.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : albums.length === 0 ? (
        <p className="text-muted-foreground">No featured albums yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {albums.map((a) => (
            <Link key={a.id} to="/albums/$id" params={{ id: a.id }} className="group">
              <StorageImage
                bucket="album-art"
                path={a.cover_url}
                alt={a.title}
                className="w-full aspect-square rounded-lg object-cover mb-2 group-hover:opacity-90"
              />
              <div className="text-sm font-medium truncate">{a.title}</div>
              <div className="text-xs text-muted-foreground truncate">{a.artist?.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
