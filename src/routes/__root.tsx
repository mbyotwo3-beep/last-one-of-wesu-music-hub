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

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Navbar } from "../components/Navbar";
import { PlayerBar } from "../components/PlayerBar";
import { AppleMusicSidebar } from "../components/AppleMusicSidebar";
import { ThemeProvider, themeInitScript } from "../hooks/use-theme";
import { usePlatform } from "../hooks/use-platform";
import { MobileShell } from "../components/mobile/MobileShell";
import { useBelowLg } from "../hooks/use-below-lg";
import { registerDeepLinkHandler } from "../integrations/supabase/auth-deep-link";

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
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { property: "og:image", content: "https://www.wesuplusly.com/images/wesu-logo-full.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@wesuplus" },
      { name: "twitter:title", content: "Wesu+ — Music Streaming" },
      { name: "description", content: "Wesu+ Music is a free and premium music streaming platform with song/album purchases and artist tools." },
      { property: "og:description", content: "Wesu+ Music is a free and premium music streaming platform with song/album purchases and artist tools." },
      { name: "twitter:description", content: "Wesu+ Music is a free and premium music streaming platform with song/album purchases and artist tools." },
      { name: "twitter:image", content: "https://www.wesuplusly.com/images/wesu-logo-full.png" },
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
  const isSmallScreen = useBelowLg();
  const useMobileLayout = platform === "native" || isSmallScreen;

  // Register deep link auth handler on native platforms (Req 18.3)
  useEffect(() => {
    if (platform === "native") {
      registerDeepLinkHandler();
    }
  }, [platform]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {useMobileLayout ? (
          <MobileShell>
            <Outlet />
          </MobileShell>
        ) : (
          <div className="flex min-h-screen">
            <AppleMusicSidebar />
            <div className="flex-1 flex flex-col">
              <Navbar />
              <main className="flex-1">
                <Outlet />
              </main>
              <PlayerBar />
            </div>
          </div>
        )}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
