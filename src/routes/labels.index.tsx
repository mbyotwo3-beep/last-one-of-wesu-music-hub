import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listApprovedLabels } from "@/lib/labels.functions";

const labelsQuery = queryOptions({
  queryKey: ["labels-public"],
  queryFn: () => listApprovedLabels(),
});

export const Route = createFileRoute("/labels/")({
  head: () => ({
    meta: [
      { title: "Record Labels — Wesu+" },
      { name: "description", content: "Discover record labels and their artists on Wesu+." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(labelsQuery),
  component: LabelsPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function LabelsPage() {
  const { data: labels } = useSuspenseQuery(labelsQuery);
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Record Labels</h1>
      <p className="text-muted-foreground mb-8">
        Independent and major labels publishing on Wesu+.
      </p>
      {labels.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">
            No labels yet.{" "}
            <Link to="/apply-label" className="text-primary underline">
              Apply to start one
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {labels.map((l: any) => (
            <Link
              key={l.id}
              to="/labels/$slug"
              params={{ slug: l.slug }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary transition"
            >
              <div className="size-16 rounded-xl bg-secondary mb-3 overflow-hidden">
                {l.logo_url && (
                  <img src={l.logo_url} alt={l.name} className="w-full h-full object-cover" />
                )}
              </div>
              <p className="font-semibold">{l.name}</p>
              {l.bio && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{l.bio}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
