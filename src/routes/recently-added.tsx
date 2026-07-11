import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/recently-added")({
  head: () => ({ meta: [{ title: "Recently Added — Wesu+" }] }),
  component: () => <Navigate to="/new-music" />,
});
