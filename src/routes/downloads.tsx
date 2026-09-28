import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { DownloadsSection } from "@/components/DownloadsSection";

/**
 * Offline downloads — intentionally PUBLIC (no RoleGate). A listener with
 * an expired session and no connectivity must still reach the music stored
 * on their own device; everything on this page reads local IndexedDB only.
 */
export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "Downloads — Wesu+" },
      {
        name: "description",
        content: "Your downloaded songs. Play offline, only in Wesu+.",
      },
    ],
  }),
  component: DownloadsPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function DownloadsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-12">
      <Link
        to="/"
        className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <DownloadsSection />
    </div>
  );
}
