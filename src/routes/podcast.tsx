import { createFileRoute } from "@tanstack/react-router";
import { Mic2, Sparkles, Radio } from "lucide-react";

export const Route = createFileRoute("/podcast")({
  head: () => ({
    meta: [
      { title: "Podcasts — Wesu+" },
      { name: "description", content: "Listen to Zambian and African podcasts on Wesu+." },
    ],
  }),
  component: PodcastPage,
});

function PodcastPage() {
  return (
    <div className="min-h-screen bg-background pb-32 flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center p-8 sm:p-10 rounded-3xl bg-card/70 backdrop-blur-2xl border border-border shadow-2xl space-y-6">
        <div className="size-20 mx-auto rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
          <Mic2 className="size-10" />
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/25">
          <Sparkles className="size-3.5" /> Coming Soon
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            Podcasts on Wesu+
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We are preparing exclusive Zambian and African podcasts, creator interviews, and culture talk shows. Stay tuned for our audio shows lineup!
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50 text-left">
            <Radio className="size-5 text-primary mb-2" />
            <p className="text-xs font-semibold text-foreground">Creator Stories</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Interviews with rising and legend artists</p>
          </div>
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50 text-left">
            <Sparkles className="size-5 text-primary mb-2" />
            <p className="text-xs font-semibold text-foreground">Music Talk</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Deep-dives into African sounds and trends</p>
          </div>
        </div>
      </div>
    </div>
  );
}
