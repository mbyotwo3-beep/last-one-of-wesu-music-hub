import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installViewTransitionNoiseFilter } from "./lib/view-transition-noise";

export const getRouter = () => {
  // Chromium skips View Transitions that it cannot run (hidden tab, a new
  // transition aborting the old one) and the router's lifecycle promises turn
  // that skip into an unhandled rejection. Install the benign filter BEFORE
  // the first navigation can start a transition. SSR no-ops it via the window
  // guard.
  installViewTransitionNoiseFilter();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Cross-fade route changes the way the phone apps do.
    //
    // Without this every navigation is a hard swap: the new page appears in a
    // single frame, which reads as a flicker on a phone because everything
    // between top bar and bottom bar blinks at once. `defaultViewTransition`
    // asks the platform to snapshot the old content and cross-fade to the new,
    // while everything OUTSIDE the named region stays perfectly still.
    //
    // It is safe to turn on for old WebViews: the router feature-detects
    // `document.startViewTransition` and falls back to the plain render it
    // always did (verified in router-core 1.170.x). The named region and the
    // motion-respecting keyframes that scope it are in src/styles.css.
    defaultViewTransition: true,
    // Preloaded route data stays fresh for 30s: hovering the same link
    // repeatedly no longer refetches on every intent.
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
