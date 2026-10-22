import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Smartphone, Download, ArrowLeft, Music2, WifiOff, CheckCircle2 } from "lucide-react";
import { getSiteConfig } from "@/lib/pricing.functions";
import { openExternalUrl } from "@/lib/external-url";
import { RouteError as SharedRouteError } from "@/components/RouteError";
import { GetTheApp } from "@/components/GetTheApp";
import { useIsNative } from "@/hooks/use-platform";

const siteQO = queryOptions({
  queryKey: ["site-config"],
  queryFn: () => getSiteConfig(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/get-app")({
  head: () => ({
    meta: [
      { title: "Get the Wesu+ App — Wesu+" },
      {
        name: "description",
        content:
          "Get the Wesu+ mobile app for Google Play or the App Store — offline listening, background play and more.",
      },
    ],
  }),
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(siteQO);
  },
  component: GetAppPage,
  errorComponent: SharedRouteError,
  notFoundComponent: () => (
    <div className="max-w-lg mx-auto px-6 py-16 text-center">Page not found</div>
  ),
});

const features = [
  {
    icon: Download,
    title: "Offline downloads.",
    body: "Save bought and free songs to your phone. Encrypted and playable only in Wesu+.",
  },
  {
    icon: WifiOff,
    title: "Listen with no data.",
    body: "Your downloads keep playing on the bus, in flight mode, anywhere.",
  },
  {
    icon: Music2,
    title: "Background play.",
    body: "Music keeps going with your screen off, from the lock screen.",
  },
];

function GetAppPage() {
  const { data: site } = useSuspenseQuery(siteQO);
  const isNative = useIsNative();

  // Admin-configured store links take priority (set in /superadmin → Settings).
  // INSTALLS GO THROUGH THE STORES — this page offers Google Play and the App
  // Store and nothing else. It used to fall back to the direct sideload APK
  // with "install unknown apps" instructions and a USB-transfer card, which
  // buried every page in Android talk. The APK is still HOSTED for testers at
  // /wesuplus.apk, it is just never offered here: paste each link in Settings
  // and its button appears below.
  const androidStoreUrl = site?.mobile_app_url?.trim() || "";
  const iosUrl = site?.ios_app_url?.trim() || "";
  const hasAnyStore = !!(androidStoreUrl || iosUrl);

  function openExternalInShell(e: React.MouseEvent<HTMLAnchorElement>, url: string) {
    if (isNative) {
      e.preventDefault();
      void openExternalUrl(url);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-10 transition-colors"
        >
          <ArrowLeft className="size-4" /> Back home
        </Link>

        {/* The install panel (PWA prompt + iOS Add to Home Screen guidance).
            It moved here from /downloads, which is now the plain list of a
            listener's music: people landing there from a player notice want
            their songs, not install options. This page is where they arrive
            already asking, so both install routes — this panel and the store
            buttons below — belong side by side. The panel hides itself inside
            the installed app. */}
        <GetTheApp />

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-lg">
            <img src="/images/wesu-logo.png" alt="Wesu+" className="h-14 w-auto" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-3">Take Wesu+ anywhere</h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-md mx-auto">
            Get the mobile app for offline listening, background play, and a native music experience
            — on Google Play and the App Store.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid gap-3 mb-10">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="shrink-0 flex size-10 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="size-5 text-primary" />
              </div>
              <p className="text-sm">
                <span className="font-semibold">{title}</span>{" "}
                <span className="text-muted-foreground">{body}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Download buttons — the stores only, no APK on this page. When no
            store link is published yet, say so plainly; never fall back to
            offering the sideload APK: installs decide once, and every install
            afterwards needs the store's update path. Testers keep the direct
            APK by private link. */}
        {hasAnyStore ? (
          <div className="flex flex-col gap-3 mb-8">
            {androidStoreUrl && (
              <a
                href={androidStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => openExternalInShell(e, androidStoreUrl)}
                className="group relative inline-flex items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-4 font-bold text-primary-foreground hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
              >
                <Smartphone className="size-5" />
                <span>Get it on Google Play</span>
              </a>
            )}
            {iosUrl && (
              <a
                href={iosUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => openExternalInShell(e, iosUrl)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-4 font-bold hover:bg-accent transition-all"
              >
                <Smartphone className="size-5" />
                Get it on the App Store
              </a>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5 mb-8 text-center">
            <p className="text-sm font-semibold mb-1">Wesu+ is coming to the app stores</p>
            <p className="text-sm text-muted-foreground">
              Find it on Google Play and the App Store once each release is live — the install
              buttons appear here as they go public.
            </p>
          </div>
        )}

        {/* Already-installed nudge */}
        <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary shrink-0" />
          Already have the app? Sign in with your same Wesu+ account.
        </div>
      </div>
    </div>
  );
}
