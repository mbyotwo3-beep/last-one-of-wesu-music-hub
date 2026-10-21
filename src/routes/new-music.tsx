import { createFileRoute } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { getNewReleases } from "@/lib/music.functions";
import { useOfflineList } from "@/hooks/use-offline-list";
import { TrackCard } from "@/components/discover/TrackCard";

export const Route = createFileRoute("/new-music")({
  head: () => ({ meta: [{ title: "New Music — Wesu+" }] }),
  component: Page,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12">Not found</div>,
});

function Page() {
  const { data, isLoading, error, refetch } = useOfflineList("lists:new-releases", {
    queryKey: ["new-releases"],
    queryFn: () => getNewReleases(),
    staleTime: 60_000,
  });
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">New Music</h1>
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : error ? (
        <div>
          <p className="text-destructive mb-3">Failed to load new music.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No new releases yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {(data ?? []).map((s: any) => (
            <TrackCard key={s.id} song={s} />
          ))}
        </div>
      )}
    </div>
  );
}
