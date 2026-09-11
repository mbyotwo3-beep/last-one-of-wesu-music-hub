import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Shuffle, Trash2, ListMusic, ArrowLeft, Lock, Heart, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { removeFromPlaylist } from "@/lib/listener.functions";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { toast } from "sonner";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";
import { useAuth } from "@/hooks/use-auth";
import { useSavedTrack } from "@/hooks/use-saved-track";

export const Route = createFileRoute("/playlists/$id")({
  head: () => ({ meta: [{ title: "Playlist — Wesu+" }] }),
  component: Page,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Playlist not found</div>,
});

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

// Extracted into its own component so useSavedTrack is called at component level (not inside .map)
interface SongRowProps {
  song: any;
  index: number;
  isOwner: boolean;
  playlistId: string;
  currentTrackId: string | undefined;
  playing: boolean;
  onPlay: (index: number) => void;
  onRemove: (songId: string) => void;
}

function SongRow({ song: s, index: i, isOwner, currentTrackId, playing, onPlay, onRemove }: SongRowProps) {
  const { isSaved, toggle } = useSavedTrack(s.id);
  const isCurrentTrack = currentTrackId === s.id;
  const isPlayingThisTrack = playing && isCurrentTrack;

  return (
    <div
      className={`w-full flex items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-xl transition-all group cursor-pointer ${
        isCurrentTrack ? "bg-primary/10 text-primary" : "hover:bg-accent/40 text-foreground"
      }`}
      onClick={() => onPlay(i)}
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
            <span className="text-xs font-semibold text-muted-foreground group-hover:hidden">{i + 1}</span>
            <Play className="size-4 fill-current hidden group-hover:block text-foreground" />
          </>
        )}
      </div>

      {/* Thumbnail */}
      <StorageImage
        bucket="album-art"
        path={s.cover_url}
        alt=""
        className="size-10 rounded-lg object-cover bg-muted shrink-0"
      />

      {/* Title & Artist */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isCurrentTrack ? "text-primary" : "text-foreground"}`}>
          {s.title}
        </p>
        <Link
          to="/artists/$id"
          params={{ id: s.artist?.id ?? "" }}
          className="text-xs text-muted-foreground truncate hover:underline hover:text-foreground inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          {s.artist?.name ?? "Unknown"}
        </Link>
      </div>

      {/* Duration */}
      <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline-block">
        {formatDuration(s.duration)}
      </span>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {Number(s.price ?? 0) <= 0 && <DownloadButton songId={s.id} />}

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
          songId={s.id}
          songTitle={s.title}
          artistId={s.artist?.id}
          artistName={s.artist?.name}
          type="song"
          className="relative z-20 opacity-0 group-hover:opacity-100 transition-opacity"
        />

        {isOwner && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(s.id);
            }}
            className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
            aria-label="Remove from playlist"
            title="Remove from playlist"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setQueue = usePlayer((s) => s.setQueue);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);
  const removeFn = useServerFn(removeFromPlaylist);
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["playlist", id],
    queryFn: async () => {
      const { data: pl } = await supabase
        .from("playlists")
        .select("*, playlist_songs(position, song:songs(id,title,duration,price,cover_url,artist:artists(id,name)))")
        .eq("id", id)
        .maybeSingle();
      return pl;
    },
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const remove = useMutation({
    mutationFn: removeFn,
    onMutate: async (variables: any) => {
      await qc.cancelQueries({ queryKey: ["playlist", id] });
      const prev = qc.getQueryData<any>(["playlist", id]);
      if (prev) {
        const updated = {
          ...prev,
          playlist_songs: (prev.playlist_songs ?? []).filter((ps: any) => ps.song_id !== variables.data.song_id),
        };
        qc.setQueryData(["playlist", id], updated);
      }
      return { prev };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["playlist", id], ctx.prev);
      toast.error(`Failed to remove: ${(error as Error).message}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist", id] });
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      qc.invalidateQueries({ queryKey: ["my-playlists-sidebar"] });
      toast.success("Removed from playlist");
    },
  });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-12 text-center">Playlist not found</div>;

  const songs = ((data as any).playlist_songs ?? [])
    .slice()
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((ps: any) => ps.song)
    .filter(Boolean);
  const isOwner = (data as any).user_id === user?.id;
  const isPublic = (data as any).is_public === true;

  // Build the queue tracks array (shared between playAll and playSong)
  const queueTracks = songs.map((s: any) => ({
    id: s.id,
    title: s.title,
    artistName: s.artist?.name ?? "Unknown",
    coverUrl: s.cover_url,
    durationSeconds: s.duration,
  }));

  // True when any song from this playlist is currently active
  const isPlaylistActive = playing && songs.some((s: any) => s.id === currentTrackId);
  const totalDuration = songs.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);
  const firstCover = songs.find((s: any) => s?.cover_url)?.cover_url;

  function playAll() {
    if (!songs.length) return;
    if (isPlaylistActive) {
      togglePlay();
      return;
    }
    const currentIndexInPlaylist = songs.findIndex((s: any) => s.id === currentTrackId);
    if (currentIndexInPlaylist !== -1) {
      togglePlay();
      return;
    }
    setQueue(queueTracks, 0);
  }

  function playShuffle() {
    if (!songs.length) return;
    const shuffled = [...queueTracks].sort(() => Math.random() - 0.5);
    setQueue(shuffled, 0);
  }

  function playSong(index: number) {
    if (!songs.length) return;
    const clickedSong = songs[index];
    if (currentTrackId === clickedSong?.id) {
      togglePlay();
      return;
    }
    setQueue(queueTracks, index);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
      {/* Back navigation */}
      <button
        onClick={() => navigate({ to: "/playlists" })}
        className="text-sm font-medium text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 cursor-pointer transition-colors group"
      >
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Playlists
      </button>

      {/* Apple Music 2-Column Layout on Desktop */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8 lg:gap-12">
        {/* Left Column: Sticky Cover & Playlist Meta */}
        <div className="w-full max-w-sm lg:w-80 lg:shrink-0 lg:sticky lg:top-8 flex flex-col items-center lg:items-start text-center lg:text-left">
          {/* Cover Art with subtle ambient glow shadow */}
          <div className="relative w-60 h-60 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-2xl overflow-hidden shadow-2xl shadow-primary/20 bg-card ring-1 ring-border/50 mb-6 shrink-0 flex items-center justify-center">
            {firstCover ? (
              <StorageImage
                bucket="album-art"
                path={firstCover}
                alt={(data as any).name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/30 to-purple-600/30 flex items-center justify-center">
                <ListMusic className="size-20 text-primary" />
              </div>
            )}
          </div>

          {/* Badge & Title */}
          <p className="text-xs uppercase tracking-widest font-bold text-primary mb-1.5">
            Playlist
          </p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight mb-2 break-words leading-tight">
            {(data as any).name}
          </h1>

          {/* Description */}
          {(data as any).description && (
            <p className="text-xs sm:text-sm text-muted-foreground mb-3 line-clamp-3">
              {(data as any).description}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-6">
            <span>{songs.length} {songs.length === 1 ? "song" : "songs"}</span>
            {totalDuration > 0 && <span>• {formatTotalRuntime(totalDuration)}</span>}
            {!isPublic ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-secondary px-2 py-0.5 rounded-full">
                <Lock className="size-3" /> Private
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                Public
              </span>
            )}
          </div>

          {/* Primary Action Buttons (Apple Music style) */}
          <div className="w-full flex items-center gap-3">
            {/* Play All button */}
            <button
              onClick={playAll}
              disabled={songs.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-primary text-primary-foreground font-semibold hover:brightness-110 active:scale-[0.98] transition-all shadow-md cursor-pointer disabled:opacity-40"
            >
              {isPlaylistActive ? (
                <><Pause className="size-4 fill-current" /> Pause</>
              ) : (
                <><Play className="size-4 fill-current ml-0.5" /> Play</>
              )}
            </button>

            {/* Shuffle button */}
            <button
              onClick={playShuffle}
              disabled={songs.length === 0}
              className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-secondary hover:bg-accent text-foreground font-medium border border-border transition-colors cursor-pointer disabled:opacity-40"
              title="Shuffle"
              aria-label="Shuffle playlist"
            >
              <Shuffle className="size-4" />
            </button>

            {/* Share */}
            {isPublic && (
              <ShareMenu
                playlistId={id}
                playlistName={(data as any).name}
                type="playlist"
                className="p-3 rounded-full bg-secondary border border-border hover:bg-accent text-foreground transition-colors cursor-pointer"
              />
            )}
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
          {songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card/40 border border-dashed border-border rounded-2xl">
              <ListMusic className="size-10 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No songs in this playlist yet.</p>
              <p className="text-xs text-muted-foreground/80 mt-1">Add songs from any track or album page.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {songs.map((s: any, i: number) => (
                <SongRow
                  key={s.id}
                  song={s}
                  index={i}
                  isOwner={isOwner}
                  playlistId={id}
                  currentTrackId={currentTrackId}
                  playing={playing}
                  onPlay={playSong}
                  onRemove={(songId) => remove.mutate({ data: { playlist_id: id, song_id: songId } })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
