import { createFileRoute } from "@tanstack/react-router";
import { NowPlayingScreen } from "@/components/mobile/screens/NowPlayingScreen";

/**
 * Modal route for the full-screen Now Playing view.
 * Navigated to by tapping the MiniPlayer track info area.
 *
 * Feature: wesu-plus-completion
 */
export const Route = createFileRoute("/now-playing")({
  head: () => ({
    meta: [
      { title: "Now Playing — Wesu+" },
      {
        name: "description",
        content: "See what's playing now, control playback and jump to the artist or album.",
      },
      { property: "og:title", content: "Now Playing — Wesu+" },
      {
        property: "og:description",
        content: "See what's playing now, control playback and jump to the artist or album.",
      },
      { property: "og:type", content: "music.song" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NowPlayingScreen,
  errorComponent: ({ error }) => (
    <div className="p-12 text-center text-muted-foreground">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});
