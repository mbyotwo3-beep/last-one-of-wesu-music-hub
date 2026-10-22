import { createFileRoute } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { DownloadsSection } from "@/components/DownloadsSection";

/**
 * Downloaded songs — intentionally PUBLIC (no RoleGate). A listener with
 * an expired session and no connectivity must still reach the music stored
 * on their own device; everything on this page reads local IndexedDB only.
 *
 * This page is a plain list of what is on the device, the way Spotify treats
 * downloaded music. It used to stack three things above the listener's songs:
 * a "← Back" link that framed the page as a detour, an app-install promo that
 * pushed the music below the fold, and an "Offline status — 2 thing(s) not
 * ready" diagnostics teaser that labelled NORMAL states (no connection yet,
 * zero downloads) as failures. A person whose phone just lost signal was being
 * handed a fault report instead of their music.
 *
 * Offline is not an error, so the surface no longer reads like one. The
 * diagnostics stay where they answer a question about something genuinely
 * broken: OfflineRouteNotice, the screen someone reaches when a route could
 * not be served at all. The install promo lives on /get-app, where people
 * arrive deliberately asking for the app.
 */
export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "Downloaded — Wesu+" },
      {
        name: "description",
        content: "Songs saved on this device. They play here with no internet.",
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
      <DownloadsSection />
    </div>
  );
}
