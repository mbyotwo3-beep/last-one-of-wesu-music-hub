import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Play, Pause, Shuffle, Music2, ArrowLeft, Clock } from "lucide-react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { usePlayer } from "@/stores/player";
import { supabase } from "@/integrations/supabase/client";
import { StorageImage } from "@/components/StorageImage";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";

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

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTotalRuntime(seconds: number) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const totalDuration = safeLikedSongs.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);

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

  const handleShuffle = () => {
    if (safeLikedSongs.length === 0) return;
    const shuffled = [...songTracks].sort(() => Math.random() - 0.5);
    player.setQueue(shuffled, 0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/10 to-background flex items-center justify-center">
        <div className="text-center">
          <Music2 className="size-12 text-muted-foreground animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading liked songs…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
      {/* Back navigation */}
      <button
        onClick={() => navigate({ to: "/library" })}
        className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 cursor-pointer transition-colors group"
      >
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Library
      </button>

      {/* Apple Music 2-Column Layout on Desktop */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8 lg:gap-12">
        {/* Left Column: Sticky Cover & Liked Songs Meta */}
        <div className="w-full max-w-sm lg:w-80 lg:shrink-0 lg:sticky lg:top-8 flex flex-col items-center lg:items-start text-center lg:text-left">
          {/* Cover Art with purple-to-primary gradient & ambient glow shadow */}
          <div className="relative w-60 h-60 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/20 bg-gradient-to-br from-primary via-purple-600 to-indigo-700 ring-1 ring-border/50 mb-6 shrink-0 flex items-center justify-center">
            <Heart className="size-24 sm:size-28 lg:size-32 text-white fill-white drop-shadow-lg" />
          </div>

          {/* Badge & Title */}
          <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1.5">
            Auto Playlist
          </p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight mb-2 break-words leading-tight">
            Liked Songs
          </h1>

          {/* Metadata */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-6">
            <span>{safeLikedSongs.length} {safeLikedSongs.length === 1 ? "song" : "songs"}</span>
            {totalDuration > 0 && <span>• {formatTotalRuntime(totalDuration)}</span>}
            <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Personal
            </span>
          </div>

          {/* Primary Action Buttons (Apple Music style) */}
          <div className="w-full flex items-center gap-3">
            {/* Play All button */}
            <button
              onClick={handlePlayAll}
              disabled={safeLikedSongs.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:brightness-110 active:scale-[0.98] transition-all shadow-md cursor-pointer disabled:opacity-40"
            >
              {isLikedSongsPlaying ? (
                <><Pause className="size-4 fill-current" /> Pause</>
              ) : (
                <><Play className="size-4 fill-current ml-0.5" /> Play</>
              )}
            </button>

            {/* Shuffle button */}
            <button
              onClick={handleShuffle}
              disabled={safeLikedSongs.length === 0}
              className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-secondary hover:bg-accent text-foreground font-medium border border-border transition-colors cursor-pointer disabled:opacity-40"
              title="Shuffle"
              aria-label="Shuffle liked songs"
            >
              <Shuffle className="size-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Tracklist */}
        <div className="flex-1 w-full min-w-0">
          {/* Table Header */}
          <div className="flex items-center gap-3 sm:gap-4 px-3 pb-3 mb-2 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="w-8 text-center shrink-0">#</span>
            <span className="size-10 shrink-0" />
            <span className="flex-1">Title</span>
            <span className="hidden sm:inline-block w-16 text-right shrink-0">
              <Clock className="size-3.5 inline mr-1" />
            </span>
            <span className="w-24 text-right shrink-0">Actions</span>
          </div>

          {/* Tracklist Rows */}
          {safeLikedSongs.length === 0 ? (
            <div className="text-center py-20 bg-card/40 border border-dashed border-border rounded-2xl">
              <Heart className="size-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-1">No liked songs yet</h2>
              <p className="text-xs text-muted-foreground mb-6">
                Tap the heart icon on any track to add it here.
              </p>
              <Link
                to="/browse"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-full hover:brightness-110 transition-all cursor-pointer"
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
  const { isSaved, toggle } = useSavedTrack(song.id);
  const player = usePlayer();

  const isCurrentTrack = player.track?.id === song.id;
  const isPlayingThisTrack = player.playing && isCurrentTrack;

  const handlePlay = () => {
    if (isPlayingThisTrack) {
      player.togglePlay();
      return;
    }
    player.setQueue(songTracks, index);
  };

  return (
    <div
      className={`w-full flex items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-xl transition-all group cursor-pointer ${
        isCurrentTrack ? "bg-primary/10 text-primary" : "hover:bg-accent/40 text-foreground"
      }`}
      onClick={handlePlay}
    >
      {/* Index or Play / Pause state */}
      <div className="w-8 shrink-0 flex items-center justify-center">
        {isPlayingThisTrack ? (
          <div className="flex items-center gap-0.5">
            <span className="w-1 h-3.5 bg-primary rounded-full animate-pulse" />
            <span className="w-1 h-5 bg-primary rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2.5 bg-primary rounded-full animate-pulse delay-150" />
          </div>
        ) : isCurrentTrack ? (
          <Play className="size-4 fill-current text-primary" />
        ) : (
          <>
            <span className="text-xs font-semibold text-muted-foreground group-hover:hidden">{index + 1}</span>
            <Play className="size-4 fill-current hidden group-hover:block text-foreground" />
          </>
        )}
      </div>

      {/* Thumbnail */}
      <StorageImage
        bucket="album-art"
        path={song.cover_url}
        alt=""
        className="size-10 rounded-lg object-cover bg-muted shrink-0"
      />

      {/* Title & Artist */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isCurrentTrack ? "text-primary" : "text-foreground"}`}>
          {song.title}
        </p>
        <Link
          to="/artists/$id"
          params={{ id: song.artist_id ?? "" }}
          className="text-xs text-muted-foreground truncate hover:underline hover:text-foreground inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          {song.artists?.name ?? "Unknown"}
        </Link>
      </div>

      {/* Duration */}
      <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline-block">
        {formatDuration(song.duration)}
      </span>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {Number(song.price ?? 0) <= 0 && <DownloadButton songId={song.id} />}

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={`p-1.5 rounded-full transition-colors cursor-pointer ${
            isSaved ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
          }`}
          title={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
          aria-label={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
        >
          <Heart className={`size-4 ${isSaved ? "fill-current" : ""}`} />
        </button>

        <ShareMenu
          songId={song.id}
          songTitle={song.title}
          artistId={song.artist_id}
          artistName={song.artists?.name}
          type="song"
          className="relative z-20 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
  );
}
