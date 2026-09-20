import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Navbar } from "../components/Navbar";
import { PlayerBar } from "../components/PlayerBar";
import { AppleMusicSidebar } from "../components/AppleMusicSidebar";
import { ThemeProvider, themeInitScript } from "../hooks/use-theme";
import { usePlatform } from "../hooks/use-platform";
import { BottomTabBar } from "../components/mobile/BottomTabBar";
import { MiniPlayer } from "../components/mobile/MiniPlayer";
import { NowPlayingSheet } from "../components/mobile/NowPlayingSheet";
import { StatusBarInit } from "../components/mobile/StatusBarInit";
import { ThemeToggle } from "../components/ThemeToggle";
import { registerDeepLinkHandler } from "../integrations/supabase/auth-deep-link";
import { usePlayer } from "../stores/player";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#fbf7ee" },
      { title: "Wesu+ — Music Streaming" },
      {
        name: "description",
        content:
          "Stream Zambian and African music. Free & Premium tiers with Mobile Money payments.",
      },
      { name: "author", content: "Wesu+" },
      { property: "og:title", content: "Wesu+ — Music Streaming" },
      {
        property: "og:description",
        content:
          "Stream Zambian and African music. Free & Premium tiers with Mobile Money payments.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Wesu+" },
      { property: "og:image", content: "/images/wesu-logo-full.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@wesuplus" },
      { name: "twitter:title", content: "Wesu+ — Music Streaming" },
      {
        name: "twitter:description",
        content:
          "Wesu+ Music is a free and premium music streaming platform with song/album purchases and artist tools.",
      },
      { name: "twitter:image", content: "/images/wesu-logo-full.png" },
    ],
    links: [
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/images/wesu-icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans bg-background text-foreground" suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const platform = usePlatform();
  // MiniPlayer reserves ~4rem above the 4rem tab bar only when a track is
  // loaded — don't leave dead whitespace on track-less pages.
  const hasTrack = usePlayer((s) => !!s.track);

  // Register deep link auth handler on native platforms (Req 18.3)
  useEffect(() => {
    if (platform === "native") {
      const cleanup = registerDeepLinkHandler();
      return cleanup;
    }
  }, [platform]);

  // STABILITY: single stable tree — Outlet + audio engine never unmount on
  // resize/rotate. Responsive switching is CSS-only (hidden lg:*) so upload
  // File objects, form state, and playback survive breakpoint changes.
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <StatusBarInit />
        <div className="flex min-h-screen">
          <div className="hidden lg:block shrink-0">
            <AppleMusicSidebar />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="hidden lg:block">
              <Navbar />
            </div>
            {/* Mobile top bar — CSS-only, never unmounts Outlet */}
            <header className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] pb-2 bg-background/95 backdrop-blur border-b border-border">
              <Link to="/" aria-label="Wesu+ home" className="flex items-center gap-2">
                <img src="/images/wesu-logo.png" alt="Wesu+" className="h-10 w-auto" />
              </Link>
              <ThemeToggle />
            </header>
            <main className={`flex-1 pt-[calc(env(safe-area-inset-top)+3.25rem)] lg:pt-0 lg:pb-0 ${hasTrack ? "pb-[calc(env(safe-area-inset-bottom)+8rem)]" : "pb-[calc(env(safe-area-inset-bottom)+4rem)]"}`}>
              <Outlet />
            </main>
            {/* Single audio engine + desktop UI. Stays mounted at all
                breakpoints (CSS-hidden on mobile) so playback + queue survive
                resize/rotate. Mobile MiniPlayer/Sheet are UI-only and share
                the same window.__wesuAudio singleton. */}
            <div className="hidden lg:block">
              <PlayerBar />
            </div>
            {/* Mobile UI — CSS-only, never unmounts Outlet */}
            <div className="lg:hidden">
              <MiniPlayer />
              <NowPlayingSheet />
              <BottomTabBar />
            </div>
          </div>
        </div>
        <Toaster position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
