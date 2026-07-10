import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listAlbums } from "@/lib/music.functions";
import { Disc } from "lucide-react";

const albumsQO = queryOptions({ queryKey: ["albums"], queryFn: () => listAlbums() });

export const Route = createFileRoute("/albums")({
  head: () => ({
    meta: [
      { title: "Albums & Singles — Wesu+" },
      { name: "description", content: "Browse every album and single available on Wesu+." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(albumsQO),
  component: AlbumsPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function AlbumsPage() {
  const { data: albums } = useSuspenseQuery(albumsQO);

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Albums & Singles</h1>

        {albums.length === 0 ? (
          <div className="p-12 border border-dashed border-white/10 rounded-2xl text-center text-muted-foreground">
            No albums yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {albums.map((a) => (
              <Link key={a.id} to="/albums" className="group">
                <div className="aspect-square rounded-xl overflow-hidden bg-card ring-1 ring-white/5 mb-3 flex items-center justify-center">
                  {a.cover_url ? (
                    <img
                      src={a.cover_url}
                      alt={a.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <Disc className="size-10 text-muted-foreground" />
                  )}
                </div>
                <p className="font-semibold text-sm truncate">{a.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {(a.artist as { name?: string } | null)?.name ?? "Unknown"}
                </p>
                <p className="text-xs text-primary font-bold mt-1">
                  K{Number(a.price ?? 0).toFixed(2)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
