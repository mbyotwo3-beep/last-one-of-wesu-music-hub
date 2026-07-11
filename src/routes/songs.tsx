import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/songs")({
  head: () => ({ meta: [{ title: "Songs — Wesu+" }] }),
  component: () => <Navigate to="/browse" />,
});
