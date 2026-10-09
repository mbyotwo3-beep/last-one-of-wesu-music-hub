import { createFileRoute, Link } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { ArrowLeft } from "lucide-react";
import { DownloadsSection } from "@/components/DownloadsSection";
import { GetTheApp } from "@/components/GetTheApp";
import { OfflineDiagnostics } from "@/components/OfflineDiagnostics";

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
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function DownloadsPage() {
  return (
    // pb-32 on lg: the desktop PlayerBar is fixed at bottom-3 h-20 (~92px) and
    // downloads carried no bottom clearance, so the last row's delete button
    // sat underneath it — on the very page the player links to when a
    // download can't be streamed.
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-12 lg:pb-32">
      <Link
        to="/"
        className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      {/* Listeners arrive here specifically asking for an app, because they
          believe downloads only exist inside one. The APK has been downloadable
          for a while and nothing on the site linked to it, so this was a support
          conversation every time. */}
      <GetTheApp />
      {/* "My downloads are not being kept" is the report, and it has five
          possible causes that look identical from outside. This names which. */}
      <div className="mb-6">
        <OfflineDiagnostics />
      </div>
      <DownloadsSection />
    </div>
  );
}
