import { createFileRoute } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";

/**
 * Subtree shell for the playlists routes.
 *
 * WHY THIS FILE HAS NO PAGE — this exact emptiness is the bug fix. The
 * playlists index used to render here, directly, with no `<Outlet/>` in its
 * tree. A parent component renders AROUND its children in TanStack Router,
 * so `/playlists/$id` matched — head and all — while the page on screen was
 * still this slot's index content: the detail page never drew. Editorial
 * playlists were unreachable for listeners through SSR and browser alike.
 *
 * A component-less route renders its child directly. The index now lives in
 * `playlists.index.tsx`; the detail page stays in `playlists.$id.tsx` and
 * finally lands inside this shell's outlet.
 *
 * Playlists themselves are not for sale and cannot be purchased as a bundle:
 * play is open to everyone (anonymous included), and a paid track plays as a
 * 15-second preview with its buy prompt instead of an entitlement wall.
 */
export const Route = createFileRoute("/playlists")({
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Playlist not found</div>,
});
