import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Play, Pause, Music2 } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { usePlayer } from "@/stores/player";
import { supabase } from "@/integrations/supabase/client";
import { StorageImage } from "@/components/StorageImage";

export const Route = createFileRoute("/liked-songs")({
  head: () => ({ meta: [{ title: "Liked Songs — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <LikedSongsRoute />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function LikedSongsRoute() {
  return <Page />;
}

function hasId(value: unknown): value is { id: string } {
  if (!value || typeof value !== "object") return false;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0;
}

function Page() {
  const { user } = useAuth();
  const player = usePlayer();

  const { data: likedSongs, isLoading } = useQuery({
    queryKey: ["liked-songs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("saved_tracks")
        .select("id, created_at, song_id, songs:song_id(id,title,cover_url,artist_id,album_id,duration,price,artists:artist_id(id,name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []).map((item: any) => item.songs).filter(hasId);
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const safeLikedSongs = (likedSongs ?? []).filter(hasId);

  const songTracks = safeLikedSongs.map((song: any) => ({
    id: song.id,
    title: song.title,
    artistName: song.artists?.name ?? "Unknown",
    coverUrl: song.cover_url,
    durationSeconds: song.duration,
  }));

  const isLikedSongsPlaying = player.playing && safeLikedSongs.some((s) => s.id === player.track?.id);

  const handlePlayAll = () => {
    if (safeLikedSongs.length === 0) {
      toast.error("No liked songs to play");
      return;
    }
    if (isLikedSongsPlaying) {
      player.togglePlay();
      return;
    }
    const currentIndex = safeLikedSongs.findIndex((s) => s.id === player.track?.id);
    if (currentIndex !== -1) {
      player.togglePlay();
    } else {
      player.setQueue(songTracks, 0);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/20 to-background flex items-center justify-center">
        <div className="text-center">
          <Music2 className="size-12 text-muted-foreground animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading liked songs…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/20 to-background">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <div className="flex items-end gap-6 mb-8">
          <div className="w-48 h-48 sm:w-56 sm:h-56 bg-gradient-to-br from-primary to-purple-600 rounded-lg shadow-2xl flex items-center justify-center">
            <Heart className="size-20 sm:size-24 text-white fill-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Playlist</p>
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">Liked Songs</h1>
            <p className="text-muted-foreground mb-4">
              {safeLikedSongs.length} song{safeLikedSongs.length !== 1 ? "s" : ""}
            </p>
            {safeLikedSongs.length > 0 && (
              <button
                onClick={handlePlayAll}
                className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl hover:scale-105 transform transition-transform cursor-pointer"
                aria-label={isLikedSongsPlaying ? "Pause" : "Play"}
              >
                {isLikedSongsPlaying ? (
                  <Pause className="size-6 fill-current" />
                ) : (
                  <Play className="size-6 fill-current ml-1" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Songs List */}
        {safeLikedSongs.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="size-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No liked songs yet</h2>
            <p className="text-muted-foreground mb-6">
              Like songs to add them to your collection
            </p>
            <Link
              to="/browse"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Music2 className="size-4" />
              Browse Music
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {safeLikedSongs.map((song: any, index: number) => (
              <LikedSongRow
                key={song.id}
                song={song}
                index={index}
                songTracks={songTracks}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LikedSongRow({
  song,
  index,
  songTracks,
}: {
  song: any;
  index: number;
  songTracks: any[];
}) {
  const { isSaved, toggle, loading } = useSavedTrack(song.id);
  const player = usePlayer();

  const isPlaying = player.playing && player.track?.id === song.id;

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) {
      player.togglePlay();
      return;
    }
    player.setQueue(songTracks, index);
  };

  return (
    <div className="group flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors">
      <div className="w-8 text-center text-muted-foreground text-sm font-medium">
        {isPlaying ? (
          <Pause className="size-4 mx-auto text-primary" />
        ) : (
          index + 1
        )}
      </div>
      <StorageImage
        bucket="album-art"
        path={song.cover_url}
        alt={song.title}
        className="size-12 rounded object-cover bg-muted"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-foreground">{song.title}</p>
        <Link
          to="/artists/$id"
          params={{ id: song.artist_id }}
          className="text-sm text-muted-foreground truncate hover:text-foreground hover:underline block cursor-pointer"
        >
          {song.artists?.name ?? "Unknown"}
        </Link>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        disabled={loading}
        className="size-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
        title={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
      >
        <Heart 
          className={`size-4 ${isSaved ? "fill-red-500 text-red-500" : "text-foreground"}`} 
        />
      </button>
      <button
        onClick={handlePlay}
        className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl opacity-0 group-hover:opacity-100 cursor-pointer"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 fill-current ml-0.5" />
        )}
      </button>
    </div>
  );
}
