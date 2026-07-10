import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listArtists } from "@/lib/music.functions";
import { CheckCircle2, User } from "lucide-react";

const artistsQO = queryOptions({ queryKey: ["artists"], queryFn: () => listArtists() });

export const Route = createFileRoute("/artists/")({
  head: () => ({
    meta: [
      { title: "Artists — Wesu+" },
      { name: "description", content: "Browse every artist on Wesu+." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(artistsQO),
  component: ArtistsPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function ArtistsPage() {
  const { data: artists } = useSuspenseQuery(artistsQO);

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
                className="text-center group"
              >
                <div className="aspect-square rounded-full overflow-hidden bg-card ring-1 ring-white/5 mb-3 flex items-center justify-center">
                  {a.avatar_url ? (
                    <img
                      src={a.avatar_url}
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
