import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getNewReleases } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";

export const Route = createFileRoute("/new-music")({
  head: () => ({ meta: [{ title: "New Music — Wesu+" }] }),
  component: Page,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

function Page() {
  const { data, isLoading } = useQuery({ queryKey: ["new-releases"], queryFn: () => getNewReleases() });
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">New Music</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {(data ?? []).map((s: any) => (
            <Link key={s.id} to="/artists/$id" params={{ id: s.artist?.id ?? "" }} className="group">
              <StorageImage bucket="album-art" path={s.cover_url} alt={s.title} className="w-full aspect-square rounded-lg object-cover mb-2 group-hover:opacity-90" />
              <div className="text-sm font-medium truncate">{s.title}</div>
              <div className="text-xs text-muted-foreground truncate">{s.artist?.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
