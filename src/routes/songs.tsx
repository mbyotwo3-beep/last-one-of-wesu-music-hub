import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/songs")({
  head: () => ({ meta: [{ title: "Songs — Wesu+" }] }),
  // Render <Outlet /> so nested routes like /songs/$id are displayed.
  // The bare /songs path is intentionally unused (no navigation goes there).
  component: () => <Outlet />,
});
