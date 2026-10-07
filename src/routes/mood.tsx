import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Play, Sparkles, Loader2 } from "lucide-react";
import { recommendByMood } from "@/lib/mood.functions";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/mood")({
  head: () => ({
    meta: [
      { title: "Mood Mix — AI song picks | Wesu+" },
      {
        name: "description",
        content: "Describe your mood and get matching songs from the Wesu+ catalog.",
      },
      { property: "og:title", content: "Mood Mix — AI song picks | Wesu+" },
      {
        property: "og:description",
        content: "Describe your mood and get matching songs from the Wesu+ catalog.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MoodPage,
});

const SUGGESTIONS = [
  "Chill evening, slow Zambian love songs",
  "Hyped for the gym, upbeat amapiano",
  "Sunday morning, gospel and calm vibes",
  "Party with friends tonight",
];

function MoodPage() {
  const [prompt, setPrompt] = useState("");
  const setQueue = usePlayer((s) => s.setQueue);
  const m = useMutation({ mutationFn: (p: string) => recommendByMood({ data: { prompt: p } }) });
  const picks = m.data?.picks ?? [];
  const queue = picks.map((t) => ({
    id: t.id,
    title: t.title,
    artistName: t.artist?.name ?? "Unknown",
    coverUrl: t.cover_url ?? undefined,
    price: t.price ?? undefined,
  }));

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="size-6 text-primary" />
        <h1 className="text-3xl font-bold">Mood Mix</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Tell us how you feel and what you like — we'll pick songs from Wesu+ to match.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim().length >= 3) m.mutate(prompt.trim());
        }}
        className="space-y-3"
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="e.g. Feeling nostalgic, want mellow kalindula and R&B"
          aria-label="Describe your mood"
        />
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-secondary"
            >
              {s}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={m.isPending || prompt.trim().length < 3}>
          {m.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {m.isPending ? "Finding songs…" : "Get my mix"}
        </Button>
      </form>

      {m.error && <p className="mt-6 text-destructive">{(m.error as Error).message}</p>}

      {m.data && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-muted-foreground">{m.data.summary}</p>
            {picks.length > 0 && (
              <Button variant="secondary" onClick={() => setQueue(queue, 0)}>
                <Play className="size-4" /> Play all
              </Button>
            )}
          </div>
          {picks.length === 0 ? (
            <p className="text-muted-foreground">
              No matching songs found — try describing it differently.
            </p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {picks.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-accent"
                >
                  <button
                    type="button"
                    onClick={() => setQueue(queue, i)}
                    aria-label={`Play ${t.title}`}
                    className="shrink-0"
                  >
                    <StorageImage
                      bucket="album-art"
                      path={t.cover_url}
                      alt={t.title}
                      className="size-12 rounded object-cover"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/songs/$id"
                      params={{ id: t.id }}
                      className="font-medium truncate block hover:underline"
                    >
                      {t.title}
                    </Link>
                    {t.artist && (
                      <Link
                        to="/artists/$id"
                        params={{ id: t.artist.id }}
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        {t.artist.name}
                      </Link>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{t.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
