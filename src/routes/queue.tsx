import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { Play, Pause, X, Shuffle, ListMusic, Repeat, Repeat1, Trash2, Disc } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { IncrementalList } from "@/components/IncrementalList";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/queue")({
  head: () => ({
    meta: [
      { title: "Queue — Wesu+" },
      { name: "description", content: "View and manage your playback queue on Wesu+." },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const navigate = useNavigate();
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const playing = usePlayer((s) => s.playing);
  const track = usePlayer((s) => s.track);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const setQueue = usePlayer((s) => s.setQueue);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const shuffle = usePlayer((s) => s.shuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const repeat = usePlayer((s) => s.repeat);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const { user } = useAuth();

  // Empty queue falls back to owned music (purchased +
  // liked). Previously empty queue was a dead end with only "Browse Music".
  const { data: fallbackTracks } = useQuery({
    queryKey: ["queue-fallback", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const [purchased, liked] = await Promise.all([
        supabase
          .from("purchases")
          .select("songs(id,title,duration,price,cover_url,artist:artists(name))")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .is("album_id", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("saved_tracks")
          .select("songs(id,title,duration,price,cover_url,artist:artists(name))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const seen = new Set<string>();
      const out: any[] = [];
      for (const row of [...(purchased.data ?? []), ...(liked.data ?? [])]) {
        const s: any = (row as any).songs;
        if (s?.id && !seen.has(s.id)) {
          seen.add(s.id);
          out.push(s);
        }
      }
      return out.slice(0, 50);
    },
    enabled: !!user?.id && queue.length === 0,
    staleTime: 60_000,
  });

  const playFallback = () => {
    if (!fallbackTracks || fallbackTracks.length === 0) {
      navigate({ to: "/browse" });
      return;
    }
    const tracks = fallbackTracks.map((s: any) => ({
      id: s.id,
      title: s.title,
      artistName: s.artist?.name ?? "Unknown",
      coverUrl: s.cover_url,
      durationSeconds: s.duration,
      price: s.price,
    }));
    setQueue(tracks, 0);
    toast.success(`▶️ Playing ${tracks.length} song(s) from your library`);
  };

  const playTrack = (index: number) => {
    if (!queue[index]) return;
    // The PlayerBar engine resolves signed-first when authed (full track for
    // owners/purchasers) and falls back to preview otherwise. Resolving here
    // as well caused double fetches, forced previews for entitled owners,
    // and "requires purchase" dead-ends when the queue entry lacked a price.
    setQueue(queue, index);
  };

  if (queue.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <ListMusic className="size-16 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Your queue is empty</h1>
          <p className="text-muted-foreground">
            {fallbackTracks && fallbackTracks.length > 0
              ? `Start with the ${fallbackTracks.length} song(s) you've bought or liked to keep your music going.`
              : "Add songs to your queue to listen to them later"}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {fallbackTracks && fallbackTracks.length > 0 && (
              <button
                onClick={playFallback}
                className="px-6 py-2 rounded-full bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <Disc className="size-4" /> Play my music
              </button>
            )}
            <Link
              to="/browse"
              className="px-6 py-2 rounded-full bg-secondary border border-border font-semibold"
            >
              Browse Music
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 rounded-full bg-secondary hover:bg-accent transition">
            <X className="size-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Queue</h1>
            <p className="text-sm text-muted-foreground">{queue.length} songs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShuffle}
            className={`p-2 rounded-full ${shuffle ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"} transition`}
            title="Shuffle"
          >
            <Shuffle className="size-5" />
          </button>
          <button
            onClick={cycleRepeat}
            className={`p-2 rounded-full ${repeat !== "off" ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"} transition`}
            title={`Repeat: ${repeat}`}
          >
            {repeat === "all" && <Repeat className="size-5" />}
            {repeat === "one" && <Repeat1 className="size-5" />}
            {repeat === "off" && <Repeat className="size-5 opacity-60" />}
          </button>
        </div>
      </div>

      {/* Queue list — windowed so 100+ track queues stay fast on low-end devices */}
      <IncrementalList
        items={queue}
        className="space-y-2"
        keyFor={(queueTrack, index) => `${queueTrack.id}-${index}`}
        renderItem={(queueTrack, index) => (
          <div
            className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${
              queueIndex === index
                ? "bg-primary/10 border border-primary/20"
                : "bg-card border border-border hover:bg-accent/50"
            }`}
          >
            {/* Track number or playing indicator */}
            <div className="w-8 text-center">
              {queueIndex === index && playing ? (
                <div className="flex items-center gap-0.5">
                  <div className="w-1 h-3 bg-primary rounded-full animate-pulse" />
                  <div className="w-1 h-3 bg-primary rounded-full animate-pulse delay-75" />
                  <div className="w-1 h-3 bg-primary rounded-full animate-pulse delay-150" />
                </div>
              ) : queueIndex === index ? (
                <button
                  onClick={togglePlay}
                  className="text-primary hover:text-primary/80 cursor-pointer"
                >
                  <Play className="size-4 fill-current" />
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">{index + 1}</span>
              )}
            </div>

            {/* Album art */}
            <StorageImage
              bucket="album-art"
              path={queueTrack.coverUrl}
              alt={queueTrack.title}
              className="size-12 rounded-lg overflow-hidden bg-secondary"
            />

            {/* Track info */}
            <div className="flex-1 min-w-0">
              <button onClick={() => playTrack(index)} className="text-left w-full cursor-pointer">
                <p
                  className={`font-medium truncate ${queueIndex === index ? "text-primary" : "text-foreground"}`}
                >
                  {queueTrack.title}
                </p>
                <p className="text-sm text-muted-foreground truncate">{queueTrack.artistName}</p>
              </button>
            </div>

            {/* Duration */}
            <span className="text-sm text-muted-foreground hidden sm:block">
              {queueTrack.durationSeconds
                ? `${Math.floor(queueTrack.durationSeconds / 60)}:${String(Math.floor(queueTrack.durationSeconds % 60)).padStart(2, "0")}`
                : "--:--"}
            </span>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeFromQueue(index);
              }}
              className="p-2 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition"
              title="Remove from queue"
            >
              <Trash2 className="size-4" />
            </button>

            {/* Play button */}
            <button
              onClick={() => playTrack(index)}
              className="p-2 rounded-full hover:bg-white/10 transition"
              title="Play this track"
            >
              {queueIndex === index && playing ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </button>
          </div>
        )}
      />
    </div>
  );
}
