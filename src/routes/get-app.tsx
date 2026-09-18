import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Smartphone, Download, ArrowLeft, Music2, WifiOff } from "lucide-react";
import { getSiteConfig } from "@/lib/pricing.functions";

const siteQO = queryOptions({
  queryKey: ["site-config"],
  queryFn: () => getSiteConfig(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/get-app")({
  head: () => ({
    meta: [
      { title: "Get the Wesu+ app — Wesu+" },
      {
        name: "description",
        content: "Download the Wesu+ mobile app for offline listening.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(siteQO);
  },
  component: GetAppPage,
});

function GetAppPage() {
  const { data: site } = useSuspenseQuery(siteQO);
  const androidUrl = site?.mobile_app_url?.trim() || "";
  const iosUrl = site?.ios_app_url?.trim() || "";
  const hasLinks = !!(androidUrl || iosUrl);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-6 py-12 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="size-4" /> Back home
        </Link>

        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl bg-primary/10">
          <img src="/images/wesu-logo.png" alt="Wesu+" className="h-12 w-auto" />
        </div>

        <h1 className="text-3xl font-black tracking-tight">Take Wesu+ anywhere</h1>
        <p className="mt-3 text-muted-foreground">
          Downloads, offline listening, and background play live in the Wesu+ mobile app.
          Anything you download plays only inside the Wesu+ app.
        </p>

        <div className="mt-6 grid gap-3 text-left">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Download className="size-5 shrink-0 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">Offline downloads.</span>{" "}
              <span className="text-muted-foreground">
                Save bought and free songs to your phone, encrypted and playable only in Wesu+.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <WifiOff className="size-5 shrink-0 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">Listen with no data.</span>{" "}
              <span className="text-muted-foreground">
                Your downloads keep playing on the bus, in flight mode, anywhere.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Music2 className="size-5 shrink-0 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">Background play.</span>{" "}
              <span className="text-muted-foreground">
                Music keeps going with your screen off, from the lock screen.
              </span>
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {androidUrl && (
            <a
              href={androidUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 font-bold text-primary-foreground hover:brightness-110 transition-all"
            >
              <Smartphone className="size-5" /> Download for Android
            </a>
          )}
          {iosUrl && (
            <a
              href={iosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-6 py-4 font-bold hover:bg-accent transition-all"
            >
              <Smartphone className="size-5" /> Download for iPhone
            </a>
          )}
          {!hasLinks && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              The mobile app is coming soon. Your library, purchases, and liked songs will be
              waiting when it lands.
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Already have it? Open the app and sign in with this same account.
        </p>
      </div>
    </div>
  );
}
