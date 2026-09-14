import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { Play, Pause, X, Shuffle, ListMusic, Clock, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicAudioUrl, getPreviewAudioUrl } from "@/lib/listener.functions";
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
  const skipNext = usePlayer((s) => s.skipNext);
  const skipPrev = usePlayer((s) => s.skipPrev);
  const setTrack = usePlayer((s) => s.setTrack);
  const setIsPreview = usePlayer((s) => s.setIsPreview);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const getPreviewFn = useServerFn(getPreviewAudioUrl);
  const getPublicFn = useServerFn(getPublicAudioUrl);

  const playTrack = async (index: number) => {
    const queueTrack = queue[index];
    if (!queueTrack) return;

    try {
      const isPaid = queueTrack.price && Number(queueTrack.price) > 0;
      
      if (isPaid) {
        const { url } = await getPreviewFn({ data: { song_id: queueTrack.id } });
        setTrack({
          id: queueTrack.id,
          title: queueTrack.title,
          artistName: queueTrack.artistName,
          coverUrl: queueTrack.coverUrl,
          audioUrl: url,
          durationSeconds: queueTrack.durationSeconds,
        });
        setIsPreview(true);
        toast.info(`🎵 Previewing "${queueTrack.title}" (15s)`);
      } else {
        const { url } = await getPublicFn({ data: { song_id: queueTrack.id } });
        setTrack({
          id: queueTrack.id,
          title: queueTrack.title,
          artistName: queueTrack.artistName,
          coverUrl: queueTrack.coverUrl,
          audioUrl: url,
          durationSeconds: queueTrack.durationSeconds,
        });
        setIsPreview(false);
      }
      setQueue(queue, index);
    } catch (error) {
      toast.error(`Failed to play: ${(error as Error).message}`);
    }
  };

  if (queue.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <ListMusic className="size-16 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Your queue is empty</h1>
          <p className="text-muted-foreground">Add songs to your queue to listen to them later</p>
          <Link
            to="/browse"
            className="px-6 py-2 rounded-full bg-primary text-primary-foreground font-semibold"
          >
            Browse Music
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 rounded-full bg-secondary hover:bg-accent transition"
          >
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
            {repeat === "all" && <Clock className="size-5" />}
            {repeat === "one" && <ListMusic className="size-5" />}
            {repeat === "off" && <Clock className="size-5" />}
          </button>
        </div>
      </div>

      {/* Queue list */}
      <div className="space-y-2">
        {queue.map((queueTrack, index) => (
          <div
            key={queueTrack.id}
            className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${
              queueIndex === index ? "bg-primary/10 border border-primary/20" : "bg-card border border-border hover:bg-accent/50"
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
              <button
                onClick={() => playTrack(index)}
                className="text-left w-full cursor-pointer"
              >
                <p className={`font-medium truncate ${queueIndex === index ? "text-primary" : "text-foreground"}`}>
                  {queueTrack.title}
                </p>
                <p className="text-sm text-muted-foreground truncate">{queueTrack.artistName}</p>
              </button>
            </div>

            {/* Duration */}
            <span className="text-sm text-muted-foreground hidden sm:block">
              {queueTrack.durationSeconds ? `${Math.floor(queueTrack.durationSeconds / 60)}:${String(Math.floor(queueTrack.durationSeconds % 60)).padStart(2, "0")}` : "--:--"}
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
        ))}
      </div>

      {/* Bottom controls */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 pb-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={skipPrev}
            className="p-2 rounded-full hover:bg-accent transition"
            title="Previous"
          >
            <SkipBack className="size-5" />
          </button>

          <button
            onClick={togglePlay}
            className="p-3 rounded-full bg-primary text-primary-foreground hover:brightness-110 transition"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={skipNext}
            className="p-2 rounded-full hover:bg-accent transition"
            title="Next"
          >
            <SkipForward className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
