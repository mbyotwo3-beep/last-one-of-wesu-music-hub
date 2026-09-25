import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Play, Pause, Shuffle, Trash2, ListMusic, ArrowLeft, Lock, Heart, Clock, LockKeyhole, ChevronUp, ChevronDown, Download, Loader2, Pencil, Plus, Check, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlaylistWithSongs,
  removeFromPlaylist,
  getPlaylistAccess,
  updatePlaylist,
  movePlaylistSong,
  togglePlaylistFollow,
  isFollowingPlaylist,
  getPlaylistFollowerCount,
  getDownloadAudioUrl,
} from "@/lib/listener.functions";
import { PlaylistCover } from "@/components/PlaylistCover";
import { downloadSongToVault } from "@/lib/offline-vault";
import { touchVaultQueries } from "@/components/DownloadButton";
import { useIsNative, useIsMobile } from "@/hooks/use-platform";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { toast } from "sonner";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";
import { IncrementalList } from "@/components/IncrementalList";
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
  onMove?: (songId: string, dir: "up" | "down") => void;
  isFirst?: boolean;
  isLast?: boolean;
}

function SongRow({ song: s, index: i, isOwner, currentTrackId, playing, onPlay, onRemove, onMove, isFirst, isLast }: SongRowProps) {
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
        {s.artist?.id ? (
          <Link
            to="/artists/$id"
            params={{ id: s.artist.id }}
            className="text-xs text-muted-foreground truncate hover:underline hover:text-foreground inline-block"
            onClick={(e) => e.stopPropagation()}
          >
            {s.artist?.name ?? "Unknown"}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground truncate inline-block">
            {s.artist?.name ?? "Unknown"}
          </span>
        )}
      </div>

      {/* Duration */}
      <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline-block">
        {formatDuration(s.duration)}
      </span>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {Number(s.price ?? 0) <= 0 && (
          <DownloadButton songId={s.id} title={s.title} artistName={s.artist?.name} coverUrl={s.cover_url} />
        )}

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

        {isOwner && onMove && (
          <span className="flex flex-col shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(s.id, "up");
              }}
              disabled={isFirst}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
              aria-label="Move up"
              title="Move up"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(s.id, "down");
              }}
              disabled={isLast}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
              aria-label="Move down"
              title="Move down"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </span>
        )}
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
  const getPlaylistFn = useServerFn(getPlaylistWithSongs);
  const removeFn = useServerFn(removeFromPlaylist);
  const getAccessFn = useServerFn(getPlaylistAccess);
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["playlist", id],
    queryFn: async () => {
      // 1. Try server function which bypasses RLS and formats songs cleanly
      try {
        const res = await getPlaylistFn({ data: { id } });
        if (res?.playlist) {
          return {
            ...res.playlist,
            songs: res.songs ?? [],
          };
        }
      } catch (err) {
        console.warn("getPlaylistWithSongs serverFn failed, falling back to client query:", err);
      }

      // 2. Fallback to client query
      const { data: pl } = await supabase
        .from("playlists")
        .select("*, playlist_songs(position, song_id, song:songs(id,title,duration,price,cover_url,artist:artists(id,name)))")
        .eq("id", id)
        .maybeSingle();

      if (!pl) return null;

      const rawPs = (pl as any).playlist_songs ?? [];
      const extractedSongs = rawPs
        .slice()
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((ps: any) => {
          let s = ps.song ?? ps.songs;
          if (Array.isArray(s)) s = s[0];
          if (!s || !s.id) return null;
          let art = s.artist ?? s.artists;
          if (Array.isArray(art)) art = art[0];
          return {
            ...s,
            artist: art ? { id: art.id, name: art.name } : null,
          };
        })
        .filter(Boolean);

      return {
        ...pl,
        songs: extractedSongs,
      };
    },
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: removeFn,
    onMutate: async (variables: any) => {
      await qc.cancelQueries({ queryKey: ["playlist", id] });
      const prev = qc.getQueryData<any>(["playlist", id]);
      if (prev) {
        const updated = {
          ...prev,
          songs: (prev.songs ?? []).filter((s: any) => s.id !== variables.data.song_id),
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

  const songs = (((data as any)?.songs) ?? []) as any[];
  const isOwner = (data as any)?.user_id === user?.id;
  const isPublic = (data as any)?.is_public === true;

  // Private (non-editorial) playlists require sign-in — anonymous visitors
  // are sent to /auth and return here afterwards.
  useEffect(() => {
    if (!isLoading && data && !user && !isPublic) {
      navigate({
        to: "/auth",
        search: { redirect: window.location.pathname + window.location.search },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, data, user, isPublic]);

  // Ownership / unlock state for signed-in viewers of shared playlists.
  const { data: access } = useQuery({
    queryKey: ["playlist-access", id, user?.id],
    queryFn: () => getAccessFn({ data: { playlist_id: id } }),
    enabled: !!user && !!data,
    staleTime: 30_000,
  });
  const showUnlockPanel =
    !!user && !!access && !access.isOwner && !access.unlocked && access.missing.length > 0;

  // Playlist extras: edit (owner), follow (viewers), bulk download.
  const updateFn = useServerFn(updatePlaylist);
  const moveFn = useServerFn(movePlaylistSong);
  const followFn = useServerFn(togglePlaylistFollow);
  const followingFn = useServerFn(isFollowingPlaylist);
  const followerCountFn = useServerFn(getPlaylistFollowerCount);
  const downloadFn = useServerFn(getDownloadAudioUrl);
  const isNative = useIsNative();
  const isMobileWeb = useIsMobile() && !isNative;

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPublic, setEditPublic] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  const { data: followState } = useQuery({
    queryKey: ["playlist-following", id, user?.id],
    queryFn: () => followingFn({ data: { playlist_id: id } }),
    enabled: !!user && !!data && (data as any)?.user_id !== user?.id,
    staleTime: 30_000,
  });
  const { data: followerCount } = useQuery({
    queryKey: ["playlist-followers", id],
    queryFn: () => followerCountFn({ data: { playlist_id: id } }),
    enabled: !!data,
    staleTime: 60_000,
  });

  const updateM = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["playlist", id] });
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      toast.success("Playlist updated");
    },
    onError: (e) => toast.error(`Update failed: ${(e as Error).message}`),
  });

  const moveM = useMutation({
    mutationFn: moveFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist", id] });
    },
    onError: (e) => toast.error(`Reorder failed: ${(e as Error).message}`),
  });

  const followM = useMutation({
    mutationFn: followFn,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["playlist-following", id] });
      qc.invalidateQueries({ queryKey: ["playlist-followers", id] });
      qc.invalidateQueries({ queryKey: ["followed-playlists"] });
      toast.success(res?.following ? "Saved to your library" : "Removed from your library");
    },
    onError: (e) => toast.error(`Failed: ${(e as Error).message}`),
  });

  async function downloadAll() {
    if (bulkProgress) return;
    const list = songs;
    if (list.length === 0) {
      toast.error("This playlist has no songs yet");
      return;
    }
    let done = 0;
    let skipped = 0;
    let failed = 0;
    for (const s of list) {
      setBulkProgress(`${done + skipped + failed + 1}/${list.length}`);
      try {
        await downloadSongToVault(
          async (songId) => {
            const r = await downloadFn({ data: { song_id: songId } });
            return { url: r.url, filename: r.filename };
          },
          {
            songId: s.id,
            title: s.title,
            artistName: s.artist?.name,
            coverUrl: s.cover_url,
          },
        );
        done += 1;
        // Refresh per track so progress is visible immediately.
        touchVaultQueries(qc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Unbought paid tracks are skipped, never fatal; storage/quota and
        // other errors are reported separately (not as "buy first").
        if (/purchase|buy|entitl|unlock|payment|402|403/i.test(msg)) skipped += 1;
        else failed += 1;
      }
    }
    setBulkProgress(null);
    touchVaultQueries(qc);
    if (done === 0 && failed > 0 && skipped === 0) {
      toast.error("Downloads failed — check your connection and storage space");
    } else if (done === 0) {
      toast.error("Nothing downloadable — paid songs need to be bought first");
    } else if (skipped > 0 || failed > 0) {
      const parts = [`Downloaded ${done} song${done === 1 ? "" : "s"}`];
      if (skipped > 0) parts.push(`${skipped} need purchase`);
      if (failed > 0) parts.push(`${failed} failed`);
      toast.success(`${parts.join(", ")}`);
    } else {
      toast.success(`Downloaded ${done} song${done === 1 ? "" : "s"} for offline listening`);
    }
  }

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-12 text-center">Playlist not found</div>;
  if (!user && !isPublic) {
    return <div className="p-12 text-center text-muted-foreground">Redirecting to sign in…</div>;
  }

  // Build the queue tracks array (shared between playAll and playSong)
  const queueTracks = songs.map((s: any) => ({
    id: s.id,
    title: s.title,
    artistName: s.artist?.name || s.artists?.name || "Unknown",
    coverUrl: s.cover_url,
    durationSeconds: s.duration,
  }));

  // True when any song from this playlist is currently active
  const isPlaylistActive = playing && songs.some((s: any) => s.id === currentTrackId);
  const totalDuration = songs.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);

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
          {/* Cover Art: custom cover, else song mosaic */}
          <div className="relative w-60 h-60 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-2xl overflow-hidden shadow-2xl shadow-primary/20 bg-card ring-1 ring-border/50 mb-6 shrink-0 flex items-center justify-center">
            {(data as any).cover_url ? (
              <StorageImage
                bucket="album-art"
                path={(data as any).cover_url}
                alt={(data as any).name}
                className="w-full h-full object-cover"
              />
            ) : (
              <PlaylistCover
                covers={songs.map((s: any) => s?.cover_url)}
                alt={(data as any).name}
                className="w-full h-full"
              />
            )}
          </div>

          {/* Badge & Title (+ owner edit) */}
          <div className="w-full flex items-center justify-center lg:justify-start gap-2 mb-1.5">
            <p className="text-xs uppercase tracking-widest font-bold text-primary">
              Playlist
            </p>
            {isOwner && !editing && (
              <button
                onClick={() => {
                  setEditName((data as any).name ?? "");
                  setEditDesc((data as any).description ?? "");
                  setEditPublic(isPublic);
                  setEditing(true);
                }}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                aria-label="Edit playlist"
                title="Edit name, description and visibility"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
          {isOwner && editing ? (
            <div className="w-full bg-card border border-border rounded-2xl p-4 mb-4 space-y-3 text-left">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Playlist name"
                maxLength={120}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border font-semibold"
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                maxLength={1000}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPublic}
                  onChange={(e) => setEditPublic(e.target.checked)}
                />
                <Globe className="size-4 text-muted-foreground" />
                Public — anyone with the link can open it, followers welcome
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    updateM.mutate({
                      data: { id, name: editName, description: editDesc, is_public: editPublic },
                    })
                  }
                  disabled={updateM.isPending || !editName.trim()}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Check className="size-4" /> Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-full bg-secondary text-sm cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight mb-2 break-words leading-tight">
                {(data as any).name}
              </h1>

              {/* Description */}
              {(data as any).description && (
                <p className="text-xs sm:text-sm text-muted-foreground mb-3 line-clamp-3">
                  {(data as any).description}
                </p>
              )}
            </>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs text-muted-foreground font-medium mb-6">
            <span>{songs.length} {songs.length === 1 ? "song" : "songs"}</span>
            {totalDuration > 0 && <span>• {formatTotalRuntime(totalDuration)}</span>}
            {(followerCount?.count ?? 0) > 0 && (
              <span>• {followerCount!.count} follower{followerCount!.count === 1 ? "" : "s"}</span>
            )}
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

            {/* Share (Owner or Public) */}
            {(isOwner || isPublic) && (
              <ShareMenu
                playlistId={id}
                playlistName={(data as any).name}
                type="playlist"
                className="p-3 rounded-full bg-secondary border border-border hover:bg-accent text-foreground transition-colors cursor-pointer"
              />
            )}
          </div>

          {/* Follow (non-owners) + Download all */}
          <div className="w-full flex flex-wrap items-center gap-2 mt-3">
            {!isOwner && !!user && (
              <button
                onClick={() => followM.mutate({ data: { playlist_id: id } })}
                disabled={followM.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Plus className="size-4" />
                {followState?.following ? "Following" : "Follow"}
              </button>
            )}
            {!!user && !isMobileWeb && (
              <button
                onClick={downloadAll}
                disabled={bulkProgress !== null || songs.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                title="Download every entitled song for offline listening"
              >
                {bulkProgress !== null ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {bulkProgress !== null ? `Downloading ${bulkProgress}…` : "Download all"}
              </button>
            )}
            {!!user && isMobileWeb && (
              <Link
                to="/get-app"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary border border-border text-sm font-semibold hover:bg-accent transition-colors cursor-pointer"
                title="Bulk downloads live in the Wesu+ app"
              >
                <Download className="size-4" />
                Download all
              </Link>
            )}
          </div>
        </div>

        {/* Right Column: Tracklist */}
        <div className="flex-1 w-full min-w-0">
          {/* Shared-playlist unlock: one payment for every song the viewer
              doesn't own yet. Owners and fully-unlocked viewers never see this. */}
          {showUnlockPanel && (
            <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-1">
                <LockKeyhole className="size-4 text-primary" />
                <h2 className="font-bold">Unlock this shared playlist</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {access!.missing.length} song{access!.missing.length === 1 ? "" : "s"} in this
                playlist {access!.missing.length === 1 ? "isn't" : "aren't"} in your library yet.
                Pay once below — free songs and tracks you already own are never charged —
                then play everything in full.
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-4">
                {access!.missing.map((m: any) => (
                  <div key={m.song_id} className="flex items-center gap-3">
                    <StorageImage
                      bucket="album-art"
                      path={m.cover_url}
                      alt={m.title}
                      className="size-9 rounded-lg object-cover bg-muted shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.artist_name}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">
                      ZMW {Number(m.price).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/checkout"
                  search={{ item: "playlist", id }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground hover:brightness-110 transition-all"
                >
                  Continue to checkout — ZMW {Number(access!.total).toFixed(2)}
                </Link>
                <span className="text-xs text-muted-foreground">
                  You can still preview every track before paying.
                </span>
              </div>
            </div>
          )}

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
            <IncrementalList
              items={songs}
              className="space-y-1"
              keyFor={(s: any) => s.id}
              renderItem={(s: any, i: number) => (
                <SongRow
                  song={s}
                  index={i}
                  isOwner={isOwner}
                  playlistId={id}
                  currentTrackId={currentTrackId}
                  playing={playing}
                  onPlay={playSong}
                  onRemove={(songId) => remove.mutate({ data: { playlist_id: id, song_id: songId } })}
                  onMove={
                    isOwner
                      ? (songId, dir) =>
                          moveM.mutate({ data: { playlist_id: id, song_id: songId, direction: dir } })
                      : undefined
                  }
                  isFirst={i === 0}
                  isLast={i === songs.length - 1}
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
