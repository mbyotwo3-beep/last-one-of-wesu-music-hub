import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Navbar } from "../components/Navbar";
import { PlayerBar } from "../components/PlayerBar";
import { AppleMusicSidebar } from "../components/AppleMusicSidebar";
import { ThemeProvider, themeInitScript } from "../hooks/use-theme";
import { usePlatform } from "../hooks/use-platform";
import { BottomTabBar } from "../components/mobile/BottomTabBar";
import { OfflineLifecycle } from "../components/OfflineLifecycle";
import { OfflineChip } from "../components/OfflineChip";
import { ensureShellCache, shellCacheSupported } from "../lib/offline-shell";
import { resumeRefreshDecision } from "../lib/resume-recovery";
import { LAST_ROUTE_KEY, routeRestoreDecision } from "../lib/route-restore";
import { OfflineRouteNotice } from "../components/OfflineRouteNotice";
import { isOfflineTransportFailure } from "../lib/loader-graceful";
import { errorReference } from "../components/RouteError";
import { DeviceSetupNudge } from "../components/DeviceSetupNudge";
import { MiniPlayer } from "../components/mobile/MiniPlayer";
import { NowPlayingSheet } from "../components/mobile/NowPlayingSheet";
import { StatusBarInit } from "../components/mobile/StatusBarInit";
import { ThemeToggle } from "../components/ThemeToggle";
import { registerDeepLinkHandler } from "../integrations/supabase/auth-deep-link";
import { usePlayer } from "../stores/player";
import { useCurrency } from "../stores/currency";
// TEMP DIAGNOSTIC (launch sweep): native-only pause-stack overlay — remove once
// the mid-play pause is proven fixed.
import { getLastNativeTimeUpdateAt, getLastNativeCommandAt } from "../lib/native-audio";
import { useServerFn } from "@tanstack/react-start";
import { FX_STALE_MS, getFxRate } from "../lib/fx.functions";

/**
 * TEMP DIAGNOSTIC (launch sweep): every store `playing` flip, attributed to the
 * store action or direct setState that caused it, with a capped stack and the
 * ages of the last native position tick / native command. Native-only, zero
 * effect on the open web. Remove once the mid-play pause is proven fixed.
 */
function PauseStackOverlay() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const anyWin = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    if (!anyWin.Capacitor?.isNativePlatform || !anyWin.Capacitor.isNativePlatform()) return;
    const push = (line: string, stack: string) => {
      const frames = (stack || "")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("Error"))
        .slice(1, 4)
        .map((s) => s.replace(/^at /, "").replace(/\?.*$/, "").slice(0, 110))
        .join(" <- ");
      setLines((prev) => [...prev.slice(-5), `${line} :: ${frames}`]);
    };
    const store = usePlayer as unknown as {
      setState: (patch: unknown, replace?: unknown) => unknown;
    };
    const origSet = store.setState.bind(store);
    let t0 = Date.now();
    const age = () =>
      `tickAge=${Date.now() - getLastNativeTimeUpdateAt()} cmdAge=${Date.now() - getLastNativeCommandAt()}`;
    // Wrap store actions so flips inside store code name the action.
    const state = usePlayer.getState() as unknown as Record<string, unknown>;
    for (const key of Object.keys(state)) {
      const orig = state[key];
      if (typeof orig !== "function" || (orig as { __wesuWrapped?: boolean }).__wesuWrapped) continue;
      const wrapped = (...args: unknown[]) => {
        const before = usePlayer.getState().playing;
        const out = (orig as (...a: unknown[]) => unknown).apply(usePlayer.getState(), args);
        const after = usePlayer.getState().playing;
        if (before !== after) {
          push(`t+${((Date.now() - t0) / 1000).toFixed(2)}s ${before}->${after} ${key}() ${age()}`, new Error().stack || "");
          if (after === true) t0 = Date.now();
        }
        return out;
      };
      (wrapped as { __wesuWrapped?: boolean }).__wesuWrapped = true;
      origSet({ [key]: wrapped });
    }
    // Wrap direct setState calls (reconciler adoption, external-pause sync…).
    store.setState = (patch: unknown, replace?: unknown) => {
      const before = usePlayer.getState().playing;
      const out = origSet(patch, replace);
      const after = usePlayer.getState().playing;
      if (before !== after) {
        push(`t+${((Date.now() - t0) / 1000).toFixed(2)}s ${before}->${after} setState ${age()}`, new Error().stack || "");
        if (after === true) t0 = Date.now();
      }
      return out;
    };
    // Catch-all: async flips that bypass both wrappers.
    let lastFlip = 0;
    const unsub = usePlayer.subscribe((s, prev) => {
      if (s.playing !== prev.playing) {
        if (Date.now() - lastFlip > 50) {
          push(`t+${((Date.now() - t0) / 1000).toFixed(2)}s ${prev.playing}->${s.playing} ASYNC ${age()}`, "");
        }
        lastFlip = Date.now();
        if (s.playing === true) t0 = Date.now();
      }
    });
    return () => {
      unsub();
      store.setState = origSet;
    };
  }, []);
  if (lines.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed", top: 2, left: 2, right: 2, zIndex: 2147483647,
        background: "rgba(0,0,0,0.88)", color: "#6f6", fontSize: 9, lineHeight: "12px",
        padding: 3, maxHeight: 150, overflow: "hidden", pointerEvents: "none",
        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all",
      }}
    >
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

/**
 * Hydrates the currency store with the live USD→ZMW rate once per session.
 * USD stays display-only — every charge settles in Kwacha; this only keeps
 * the "$x.xx" estimates at the real market rate instead of a stale guess.
 */
function FxRateHydrator() {
  const fxFn = useServerFn(getFxRate);
  const setZmwPerUsd = useCurrency((s) => s.setZmwPerUsd);
  const { data } = useQuery({
    queryKey: ["fx-rate"],
    queryFn: () => fxFn(),
    staleTime: FX_STALE_MS,
    gcTime: FX_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (data && typeof data.zmwPerUsd === "number") {
      setZmwPerUsd(data.zmwPerUsd);
    }
  }, [data, setZmwPerUsd]);
  return null;
}

/**
 * Viewport width below Tailwind's `lg` breakpoint. Starts as `true` so the
 * server render matches the first client render (a phone-sized toast set); a
 * desktop visitor gets one layout shift instead, which is harmless.
 */
function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isPhone;
}

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

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // TEMP DIAGNOSTIC (launch sweep): the root boundary is the last catch-all and
  // its screenshot carried no identity — every cause then has to be guessed at
  // (the RouteError header documents how many wrong guesses that costs). Stand
  // the same short reference the route card shows THIS high, plus a capped
  // one-line description, so an on-device report reads back the real cause.
  // Remove once the native boot path is proven clean.
  const diag = rootErrorDiagnostics(error);

  // The root boundary catches failures no route claimed, so it is the LAST place
  // a connectivity error can surface. Without this, losing signal on an
  // unrouted URL showed "Something went wrong on our end" — blaming us for the
  // listener's data plan.
  if (isOfflineTransportFailure(error)) {
    return <OfflineRouteNotice what="this page" />;
  }

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
        {/* TEMP DIAGNOSTIC (launch sweep): read the failure out on-device. */}
        <p className="mt-4 text-[11px] font-mono text-muted-foreground/80 break-words">{diag}</p>
      </div>
    </div>
  );
}

/**
 * TEMP DIAGNOSTIC (launch sweep): a short stable reference plus a capped
 * one-line description of whatever escaped every route boundary. Same
 * reference scheme the route card uses, so reports read back consistently.
 * Remove once the native boot path is proven clean.
 */
function rootErrorDiagnostics(error: unknown): string {
  let ref = "??????";
  try {
    ref = errorReference(error);
  } catch {
    /* the description below still carries the raw facts */
  }
  const e = error as {
    name?: unknown;
    code?: unknown;
    digest?: unknown;
    message?: unknown;
    stack?: unknown;
    constructor?: { name?: string };
  } | null;
  const part = (v: unknown, max: number) => {
    const s = typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
    return s.replace(/\s+/g, " ").trim().slice(0, max);
  };
  // Stack first lines identify the module and exact call position (file URLs
  // survive in ESM), which turns "which line threw" into a lookup rather than
  // a guess.
  const stackPart = part(typeof e?.stack === "string" ? e.stack : "", 560).replace(/\n/g, " || ");
  const bits = [
    `ref ${ref}`,
    part(e?.name, 40),
    part(e?.code, 20),
    part(e?.digest, 20),
    part(e?.message, 220),
  ].filter(Boolean);
  if (stackPart) bits.push(`stack ${stackPart}`);
  return bits.join(" | ");
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // interactive-widget=resizes-content: the keyboard resizes the layout
        // viewport (instead of overlaying it) so focused inputs stay reachable
        // and no phantom space appears. Ignored where unsupported.
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { name: "theme-color", content: "#fbf7ee" },
      { title: "Wesu+ — Music Streaming" },
      {
        name: "description",
        content:
          "Stream Zambian and African music. Buy songs and albums with Mobile Money or card.",
      },
      { name: "author", content: "Wesu+" },
      { property: "og:title", content: "Wesu+ — Music Streaming" },
      {
        property: "og:description",
        content:
          "Stream Zambian and African music. Buy songs and albums with Mobile Money or card.",
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
      // iOS home-screen app metadata. These are <meta> tags; listing them under
      // links rendered invalid <link> elements and broke hydration on every page.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Wesu+" },
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
  const router = useRouter();
  // Where the listener was: recorded on every navigation so a process-kill
  // relaunch resumes there instead of the app opening at home every time.
  const fullPath = useRouterState({
    // searchStr is the string form; location.search is a parsed object that
    // cannot be string-concatenated (hard-crashes SSR renders).
    select: (s) => s.location.pathname + (s.location.searchStr ?? ""),
  });
  useEffect(() => {
    if (platform !== "native") return;
    try {
      localStorage.setItem(LAST_ROUTE_KEY, fullPath);
    } catch {
      /* best-effort: private mode just opens home, the pre-fix behaviour */
    }
  }, [platform, fullPath]);
  // Restore it ONCE at native boot. Recording above cannot run first in the
  // same paint, so the initial value of fullPath is the booted location ("/")
  // — restoring pushes history and the NEXT paint's write records real routes.
  useEffect(() => {
    if (platform !== "native") return;
    try {
      const stored = localStorage.getItem(LAST_ROUTE_KEY);
      const decision = routeRestoreDecision({
        isNative: platform === "native",
        currentPath: router.state.location.pathname,
        stored,
      });
      if (decision.action === "restore" && decision.to) router.history.push(decision.to);
    } catch {
      /* private mode: open home */
    }
    // Once per boot, deliberately narrow deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  // MiniPlayer reserves ~4rem above the 4rem tab bar only when a track is
  // loaded — don't leave dead whitespace on track-less pages.
  const hasTrack = usePlayer((s) => !!s.track);

  // Install the offline shell cache.
  //
  // Without this the app cannot start with the data off at all: it is SSR, so
  // there is no document to load, and every offline feature (the encrypted
  // vault, offline mode, the list snapshots) lives inside the React tree that
  // never boots. The same is true of a desktop browser tab: an offline F5 or
  // reload could not render without this shell. Spotify-style offline is
  // supposed to look the same everywhere, so this registers on the open web
  // too, not only in the APK. Registering is deferred until after load so it
  // never competes with first paint, and a failure is deliberately swallowed
  // — the app must still boot online if a worker will not register.
  useEffect(() => {
    if (!shellCacheSupported()) return;
    const go = () => void ensureShellCache();
    if (document.readyState === "complete") {
      go();
      return;
    }
    window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, []);

  // Register deep link auth handler on native platforms (Req 18.3)
  useEffect(() => {
    if (platform === "native") {
      const cleanup = registerDeepLinkHandler();
      return cleanup;
    }
  }, [platform]);

  // Resume from a long background: doze froze autoRefreshToken, so the next
  // burst of server calls would otherwise race the silent token refresh and
  // lose with 401-class route errors. One refresh fires the moment the app
  // becomes visible again, BEFORE any query needs the token. Pure rule in
  // resume-recovery; failures here are silent because the route error
  // surface can still heal the burst it causes.
  useEffect(() => {
    if (platform !== "native") return;
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenForMs = hiddenAt ? Date.now() - hiddenAt : 0;
      if (resumeRefreshDecision({ hiddenForMs, online: navigator.onLine !== false }) !== "refresh") {
        return;
      }
      import("@/lib/session-resume")
        .then(({ refreshSessionIfStale }) => refreshSessionIfStale())
        .catch(() => {
          /* the route error surface heals what it causes; nothing to report */
        });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [platform]);

  // Password-recovery deep links (native): route to the reset form once the
  // session lands. The flag backs navigation if the event fires early.
  const navigate = useNavigate();
  useEffect(() => {
    if (platform !== "native") return;
    const goReset = () => navigate({ to: "/reset-password" });
    window.addEventListener("wesu:recovery", goReset);
    try {
      if (sessionStorage.getItem("recovery_pending") === "1") {
        sessionStorage.removeItem("recovery_pending");
        goReset();
      }
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("wesu:recovery", goReset);
  }, [platform, navigate]);

  // STABILITY: single stable tree — Outlet + audio engine never unmount on
  // resize/rotate. Responsive switching is CSS-only (hidden lg:*) so upload
  // File objects, form state, and playback survive breakpoint changes.
  // (Toast placement is the one exception — it needs a JS media query because
  // Sonner takes a `position` prop, not a class.)
  const isPhone = useIsPhone();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <StatusBarInit />
        <PauseStackOverlay />
        <FxRateHydrator />
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
              {/* Offline is a status, not a notification. It lives in the bar
                  and never pushes the page down — see OfflineChip. */}
              <div className="flex items-center gap-2">
                <OfflineChip />
                <ThemeToggle />
              </div>
            </header>
            <main
              className={`flex-1 pt-[calc(env(safe-area-inset-top)+3.25rem)] lg:pt-0 lg:pb-0 ${hasTrack ? "pb-[calc(env(safe-area-inset-bottom)+8rem)]" : "pb-[calc(env(safe-area-inset-bottom)+4rem)]"}`}
            >
              <OfflineLifecycle />
              <DeviceSetupNudge />
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
        {/* Bottom-centre on phones: at top-right a ~356px toast covered the
            logo and theme toggle for its whole lifetime. Desktop keeps the
            corner placement. */}
        <Toaster position={isPhone ? "bottom-center" : "top-right"} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
