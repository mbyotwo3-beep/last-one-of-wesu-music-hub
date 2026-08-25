import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions — Wesu+" },
      { name: "description", content: "Subscriptions are not currently available on Wesu+." },
    ],
  }),
  component: SubscriptionsPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function SubscriptionsPage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-3xl font-bold">Subscriptions are not available yet</h1>
        <p className="mt-3 text-muted-foreground">
          Wesu+ currently supports individual song and album purchases only.
        </p>
        <Link
          to="/browse"
          className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
        >
          Browse music
        </Link>
      </div>
    </div>
  );
}
