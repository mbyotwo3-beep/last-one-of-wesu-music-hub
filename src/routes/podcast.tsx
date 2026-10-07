import { createFileRoute, Link } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { Mic, Radio, Sparkles, ArrowLeft, Headphones } from "lucide-react";

export const Route = createFileRoute("/podcast")({
  head: () => ({
    meta: [
      { title: "Podcasts — Coming Soon — Wesu+" },
      {
        name: "description",
        content: "Zambian and African podcasts coming soon to Wesu+.",
      },
    ],
  }),
  component: PodcastPage,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function PodcastPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="size-4" /> Back to Home
        </Link>

        <div className="relative mx-auto size-24 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
          <Mic className="size-12 text-primary animate-pulse" />
          <div className="absolute -top-1 -right-1 size-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow">
            <Radio className="size-3.5" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="size-3" /> Coming Soon
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Wesu+ Podcasts</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We are curating the finest Zambian and African podcasts, conversations, and cultural
            talk shows. Stay tuned as we launch stories and audio discussions.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/60 text-left space-y-2">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Headphones className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Are you a podcaster?</p>
              <p className="text-xs text-muted-foreground">
                Distribute your show on Wesu+ to thousands of listeners across Zambia and beyond.
              </p>
            </div>
          </div>
          <div className="pt-2 text-center">
            <Link to="/contact" className="text-xs font-medium text-primary hover:underline">
              Get in touch with our partnerships team &rarr;
            </Link>
          </div>
        </div>

        <div className="pt-2">
          <Link
            to="/browse"
            className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 active:scale-95 transition-all shadow-md"
          >
            Explore Music Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
