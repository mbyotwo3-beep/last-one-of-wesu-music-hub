import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getLabelBySlug } from "@/lib/labels.functions";

const labelQuery = (slug: string) =>
  queryOptions({
    queryKey: ["label", slug],
    queryFn: async () => {
      const data = await getLabelBySlug({ data: { slug } });
      if (!data) throw notFound();
      return data;
    },
  });

export const Route = createFileRoute("/labels/$slug")({
  head: (ctx: any) => ({
    meta: [
      { title: ctx?.loaderData?.label ? `${ctx.loaderData.label.name} — Wesu+` : "Label — Wesu+" },
      { name: "description", content: ctx?.loaderData?.label?.bio ?? "Record label on Wesu+." },
    ],
  }),
  loader: ({ context, params }: any) =>
    context.queryClient.ensureQueryData(labelQuery(params.slug)),
  component: LabelPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Label not found</div>,
});

function LabelPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(labelQuery(slug));
  const { label, roster } = data as any;
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="flex items-center gap-6 mb-8">
        <div className="size-24 rounded-2xl bg-secondary overflow-hidden">
          {label.logo_url && (
            <img src={label.logo_url} alt={label.name} className="w-full h-full object-cover" />
          )}
        </div>
        <div>
          <h1 className="text-3xl font-bold">{label.name}</h1>
          {label.bio && <p className="text-muted-foreground mt-1 max-w-2xl">{label.bio}</p>}
        </div>
      </div>
      <h2 className="text-lg font-semibold mb-4">Roster</h2>
      {roster.length === 0 ? (
        <p className="text-muted-foreground text-sm">No artists yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {roster.map((a: any) => (
            <Link
              key={a.id}
              to="/artists/$id"
              params={{ id: a.id }}
              className="bg-card border border-border rounded-2xl p-4 text-center hover:border-primary transition"
            >
              <div className="size-24 mx-auto rounded-full bg-secondary mb-3 overflow-hidden">
                {a.avatar_url && (
                  <img src={a.avatar_url} alt={a.name} className="w-full h-full object-cover" />
                )}
              </div>
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(a.monthly_listeners ?? 0).toLocaleString()} listeners
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
