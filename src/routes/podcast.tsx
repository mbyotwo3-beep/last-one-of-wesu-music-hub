import { createFileRoute } from "@tanstack/react-router";
import { Mic, Clock } from "lucide-react";

export const Route = createFileRoute("/podcast")({
  head: () => ({
    meta: [
      { title: "Podcasts — Wesu+" },
      {
        name: "description",
        content: "Discover and listen to podcasts on Wesu+. Coming soon.",
      },
      { property: "og:title", content: "Podcasts — Wesu+" },
      {
        property: "og:description",
        content: "Discover and listen to podcasts on Wesu+. Coming soon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PodcastPage,
});

function PodcastPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 py-8 pb-36">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Mic className="size-12 text-primary" />
          </div>
          
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Podcasts
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-md">
            Discover and listen to your favorite podcasts
          </p>
          
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-primary/10 border border-primary/20 rounded-full">
            <Clock className="size-5 text-primary animate-pulse" />
            <span className="text-primary font-semibold">Coming Soon</span>
          </div>
          
          <p className="text-sm text-muted-foreground mt-6 max-w-sm">
            We're working hard to bring you an amazing podcast experience. Stay tuned!
          </p>
        </div>
      </div>
    </div>
  );
}
