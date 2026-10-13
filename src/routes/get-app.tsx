import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Smartphone,
  Download,
  ArrowLeft,
  Music2,
  WifiOff,
  CheckCircle2,
  Package,
} from "lucide-react";
import { getSiteConfig } from "@/lib/pricing.functions";
import { isNativeShell, openExternalUrl } from "@/lib/external-url";
import { RouteError as SharedRouteError } from "@/components/RouteError";
import { useIsMobile, useIsNative } from "@/hooks/use-platform";

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
          "Download the Wesu+ Android app for offline listening, background play and more.",
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

/** Direct APK hosted in /public — always available as a fallback. */
const DIRECT_APK_URL = "/wesuplus.apk";
const APK_VERSION = "1.0"; // bump this when you ship a new APK

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
  const isMobile = useIsMobile();

  // Admin-configured store links take priority (set in /admin → Settings).
  // Fall back to the direct APK hosted in /public when they are not set yet.
  const androidStoreUrl = site?.mobile_app_url?.trim() || "";
  const iosUrl = site?.ios_app_url?.trim() || "";

  // Use store link if available, otherwise the direct APK
  const androidUrl = androidStoreUrl || DIRECT_APK_URL;
  const usingDirectApk = !androidStoreUrl;

  function handleAndroidClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isNative) {
      e.preventDefault();
      void openExternalUrl(androidUrl);
    }
  }

  function handleIosClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isNative) {
      e.preventDefault();
      void openExternalUrl(iosUrl);
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

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-lg">
            <img src="/images/wesu-logo.png" alt="Wesu+" className="h-14 w-auto" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-3">
            Take Wesu+ anywhere
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-md mx-auto">
            Download the Android app for offline listening, background play, and a
            native music experience.
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

        {/* Download buttons */}
        <div className="flex flex-col gap-3 mb-8">
          {/* Android / APK */}
          <a
            href={androidUrl}
            download={usingDirectApk ? `wesuplus-v${APK_VERSION}.apk` : undefined}
            onClick={handleAndroidClick}
            className="group relative inline-flex items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-4 font-bold text-primary-foreground hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/25"
          >
            <Smartphone className="size-5" />
            <span>
              {usingDirectApk
                ? `Download APK (v${APK_VERSION} · Android)`
                : "Get it on Google Play"}
            </span>
            {usingDirectApk && (
              <span className="absolute -top-2 -right-2 text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full shadow">
                FREE
              </span>
            )}
          </a>

          {/* Direct APK secondary if store link is set */}
          {!usingDirectApk && (
            <a
              href={DIRECT_APK_URL}
              download={`wesuplus-v${APK_VERSION}.apk`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-3.5 text-sm font-semibold hover:bg-accent transition-all"
            >
              <Package className="size-4" />
              Direct APK download (v{APK_VERSION})
            </a>
          )}

          {/* iOS */}
          {iosUrl && (
            <a
              href={iosUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleIosClick}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-4 font-bold hover:bg-accent transition-all"
            >
              <Smartphone className="size-5" />
              Download for iPhone
            </a>
          )}
        </div>

        {/* Install instructions (only show for direct APK on mobile browser) */}
        {usingDirectApk && isMobile && !isNative && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 mb-6">
            <p className="text-sm font-semibold text-amber-200 mb-2">
              How to install the APK
            </p>
            <ol className="space-y-1.5 text-sm text-amber-200/80 list-decimal list-inside">
              <li>Tap the button above to download the APK</li>
              <li>Open your Downloads folder and tap the file</li>
              <li>
                If prompted, allow <strong>Install unknown apps</strong> for your
                browser in Settings
              </li>
              <li>Tap Install — it takes a few seconds</li>
              <li>Sign in with your Wesu+ account</li>
            </ol>
          </div>
        )}

        {/* Desktop info card */}
        {!isMobile && !isNative && (
          <div className="rounded-2xl border border-border bg-card p-5 mb-6">
            <p className="text-sm font-semibold mb-1">Downloading on a computer?</p>
            <p className="text-sm text-muted-foreground">
              Transfer the APK to your Android phone via USB or Google Drive, then
              install it from your Downloads folder. Alternatively, open this page on
              your phone to install directly.
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
