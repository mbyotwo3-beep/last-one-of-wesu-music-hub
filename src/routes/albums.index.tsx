import { createFileRoute, Link } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { queryOptions } from "@tanstack/react-query";
import { listAlbums } from "@/lib/music.functions";
import { useOfflineList } from "@/hooks/use-offline-list";
import { loaderGraceful } from "@/lib/loader-graceful";
import { Disc } from "lucide-react";
import { StorageImage } from "@/components/StorageImage";
import { useCurrency } from "@/stores/currency";

const albumsQO = queryOptions({
  queryKey: ["albums"],
  queryFn: () => listAlbums(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/albums/")({
  head: () => ({
    meta: [
      { title: "Albums & Singles — Wesu+" },
      { name: "description", content: "Browse every album and single available on Wesu+." },
    ],
  }),
  loader: async ({ context }) => {
    // Awaited, and no .catch(() => {}) swallowing the failure.
    //
    // Fire-and-forget meant the loader returned before the query resolved, so
    // the server rendered an empty Albums grid and the releases only appeared
    // after hydration. That was the reason to await, and it still holds: nothing
    // in the HTML for a crawler or a first paint otherwise.
    //
    // The failure is now caught, which the comment above used to argue against.
    // That argument was right when the app could not boot offline at all, where
    // swallowing meant a silently empty grid with no error anywhere. Now that the
    // shell caches and the app starts with the data off, a thrown rejection
    // replaced this route with an error screen — and this route reads through
    // useOfflineList, which renders the last snapshot offline. Catching here is
    // what lets that fallback run instead of being overridden.
    return loaderGraceful(context.queryClient.ensureQueryData(albumsQO), []);
  },
  component: AlbumsPage,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function AlbumsPage() {
  const { data: albums = [] } = useOfflineList("lists:albums", {
    queryKey: ["albums"],
    queryFn: () => listAlbums(),
    staleTime: 5 * 60 * 1000,
  });
  const formatPrice = useCurrency((s) => s.formatPrice);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Albums &amp; Singles</h1>

        {albums.length === 0 ? (
          <div className="p-12 border border-dashed border-white/10 rounded-2xl text-center text-muted-foreground">
            No albums yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {albums.map((a) => (
              <Link key={a.id} to="/albums/$id" params={{ id: a.id }} className="group">
                <div className="aspect-square rounded-xl overflow-hidden bg-card ring-1 ring-white/5 mb-3 flex items-center justify-center">
                  <StorageImage
                    bucket="album-art"
                    path={a.cover_url}
                    alt={a.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <p className="font-semibold text-sm truncate">{a.title}</p>
                {/* Single line: artist • N songs. The old layout spent three
                    rows on artist + price, so on a phone only one tile fit
                    above the fold. */}
                <p className="text-xs text-muted-foreground truncate">
                  {(a.artist as { name?: string } | null)?.name ?? "Unknown"}
                  {a.track_count ? ` • ${a.track_count} song${a.track_count === 1 ? "" : "s"}` : ""}
                </p>
                <p className="text-xs text-primary font-bold mt-1">
                  {formatPrice(a.effective_price ?? a.price)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
