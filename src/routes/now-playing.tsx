import { createFileRoute } from "@tanstack/react-router";
import { NowPlayingScreen } from "@/components/mobile/screens/NowPlayingScreen";

/**
 * Modal route for the full-screen Now Playing view.
 * Navigated to by tapping the MiniPlayer track info area.
 *
 * Feature: wesu-plus-completion
 */
export const Route = createFileRoute("/now-playing")({
  component: NowPlayingScreen,
  errorComponent: ({ error }) => (
    <div className="p-12 text-center text-muted-foreground">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});
