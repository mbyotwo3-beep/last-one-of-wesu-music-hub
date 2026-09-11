import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Trash2, ListMusic, ArrowLeft, Lock, Heart } from "lucide-react";
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

function SongRow({ song: s, index: i, isOwner, playlistId, currentTrackId, playing, onPlay, onRemove }: SongRowProps) {
  const { isSaved, toggle } = useSavedTrack(s.id);
  const isCurrentTrack = currentTrackId === s.id;
  const isPlayingThisTrack = playing && isCurrentTrack;

  return (
    <div
      key={s.id}
      className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 cursor-pointer group transition-colors ${isCurrentTrack ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent"}`}
      onClick={() => onPlay(i)}
    >
      {isPlayingThisTrack ? (
        <Pause className="size-4 text-primary fill-current w-6 shrink-0" />
      ) : (
        <>
          <span className={`text-sm w-6 text-right group-hover:hidden shrink-0 ${isCurrentTrack ? "text-primary font-bold" : "text-muted-foreground"}`}>{i + 1}</span>
          <Play className="size-4 text-primary fill-current hidden group-hover:block w-6 shrink-0" />
        </>
      )}
      <StorageImage bucket="album-art" path={s.cover_url} alt="" className="size-10 rounded object-cover shrink-0" />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium truncate group-hover:text-primary transition-colors ${isCurrentTrack ? "text-primary" : ""}`}>{s.title}</div>
        <Link
          to="/artists/$id"
          params={{ id: s.artist?.id ?? "" }}
          className="text-xs text-muted-foreground truncate hover:underline cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {s.artist?.name ?? "Unknown"}
        </Link>
      </div>
      {Number(s.price ?? 0) <= 0 && <DownloadButton songId={s.id} />}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Heart
          className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        />
      </button>
      <ShareMenu
        songId={s.id}
        songTitle={s.title}
        artistId={s.artist?.id}
        artistName={s.artist?.name}
        type="song"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground relative z-20"
      />
      {isOwner && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(s.id);
          }}
          className="text-muted-foreground hover:text-destructive p-2 cursor-pointer transition-colors"
          aria-label="Remove"
        >
          <Trash2 className="size-4" />
        </button>
      )}
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

  function playAll() {
    if (!songs.length) return;
    // If this playlist is already active, just toggle play/pause
    if (isPlaylistActive) {
      togglePlay();
      return;
    }
    // If current track is in this playlist but paused, resume
    const currentIndexInPlaylist = songs.findIndex((s: any) => s.id === currentTrackId);
    if (currentIndexInPlaylist !== -1) {
      togglePlay();
      return;
    }
    // Start from the beginning
    setQueue(queueTracks, 0);
  }

  function playSong(index: number) {
    if (!songs.length) return;
    const clickedSong = songs[index];
    // If tapping the currently playing song → toggle pause/resume
    if (currentTrackId === clickedSong?.id) {
      togglePlay();
      return;
    }
    setQueue(queueTracks, index);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-32">
      <button
        onClick={() => navigate({ to: "/playlists" })}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 cursor-pointer transition-colors group"
      >
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" /> Back
      </button>
      <div className="flex items-end gap-6 mb-8">
        <div className="size-48 bg-gradient-to-br from-primary/40 to-primary/10 rounded-lg flex items-center justify-center">
          <ListMusic className="size-16 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground uppercase">Playlist</p>
          <h1 className="text-5xl font-bold mb-2">{(data as any).name}</h1>
          {(data as any).description && (
            <p className="text-muted-foreground mb-2">{(data as any).description}</p>
          )}
          <p className="text-sm text-muted-foreground">{songs.length} songs</p>
          {!isPublic && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Private playlist
            </p>
          )}
        </div>
      </div>

      <button
        onClick={playAll}
        disabled={!songs.length}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-obsidian font-bold hover:brightness-110 hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer mb-6"
      >
        {isPlaylistActive ? (
          <><Pause className="size-5 fill-current" /> Pause</>
        ) : (
          <><Play className="size-5 fill-current" /> Play</>
        )}
      </button>
      {isPublic && (
        <ShareMenu
          playlistId={id}
          playlistName={(data as any).name}
          type="playlist"
          className="ml-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-3 text-sm font-bold transition-colors hover:bg-accent relative z-20"
        />
      )}

      {songs.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No songs yet. Add from any song page.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
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
  );
}
