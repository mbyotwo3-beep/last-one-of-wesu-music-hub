import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getFeaturedAlbums } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";

export const Route = createFileRoute("/must-have")({
  head: () => ({ meta: [{ title: "Must-Have Albums — Wesu+" }] }),
  component: Page,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

function Page() {
  const { data, isLoading } = useQuery({ queryKey: ["featured-albums"], queryFn: () => getFeaturedAlbums() });
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Must-Have Albums</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {((data ?? []) as any[]).map((a) => (
            <Link key={a.id} to="/albums/$id" params={{ id: a.id }} className="group">
              <StorageImage bucket="album-art" path={a.cover_url} alt={a.title} className="w-full aspect-square rounded-lg object-cover mb-2 group-hover:opacity-90" />
              <div className="text-sm font-medium truncate">{a.title}</div>
              <div className="text-xs text-muted-foreground truncate">{a.artist?.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
