import { createFileRoute, Link } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { queryOptions } from "@tanstack/react-query";
import { listArtists } from "@/lib/music.functions";
import { useOfflineList } from "@/hooks/use-offline-list";
import { loaderGraceful } from "@/lib/loader-graceful";
import { CheckCircle2, User } from "lucide-react";
import { StorageImage } from "@/components/StorageImage";

const artistsQO = queryOptions({
  queryKey: ["artists"],
  queryFn: () => listArtists(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/artists/")({
  head: () => ({
    meta: [
      { title: "Artists — Wesu+" },
      { name: "description", content: "Browse every artist on Wesu+." },
    ],
  }),
  loader: async ({ context }) => {
    // Awaited rather than fire-and-forget, so the shelf is in the server HTML.
    // Caught for the same reason as /albums: offline this cannot succeed, and an
    // unhandled rejection replaced the route with an error screen, while the
    // component below already reads from an offline snapshot.
    return loaderGraceful(context.queryClient.ensureQueryData(artistsQO), []);
  },
  component: ArtistsPage,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function ArtistsPage() {
  const { data: artists = [] } = useOfflineList("lists:artists", {
    queryKey: ["artists"],
    queryFn: () => listArtists(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Artists</h1>

        {artists.length === 0 ? (
          <div className="p-12 border border-dashed border-white/10 rounded-2xl text-center text-muted-foreground">
            No artists yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {artists.map((a) => (
              <Link
                key={a.id}
                to="/artists/$id"
                params={{ id: a.id }}
                className="text-center group cursor-pointer"
              >
                <div className="aspect-square rounded-full overflow-hidden bg-card ring-1 ring-white/5 mb-3 flex items-center justify-center transition-transform group-hover:scale-[1.03] group-hover:ring-primary/40">
                  {a.avatar_url ? (
                    <StorageImage
                      bucket="artist-images"
                      path={a.avatar_url}
                      alt={a.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <User className="size-10 text-muted-foreground" />
                  )}
                </div>
                <p className="font-semibold text-sm truncate flex items-center justify-center gap-1">
                  {a.name}
                  {a.verified && <CheckCircle2 className="size-3 text-primary" />}
                </p>
                <p className="text-xs text-muted-foreground truncate">{a.genre ?? "—"}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
