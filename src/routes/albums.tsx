import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/albums")({
  head: () => ({
    meta: [
      { title: "Albums & Singles — Wesu+" },
      { name: "description", content: "Browse every album and single available on Wesu+." },
    ],
  }),
  // Pure layout — renders child routes (/albums/$id) via Outlet.
  // The album listing page has been moved to albums.index.tsx
  component: () => <Outlet />,
});
