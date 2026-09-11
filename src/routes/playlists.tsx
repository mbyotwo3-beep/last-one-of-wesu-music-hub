import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, Plus, Trash2, Play, Pause } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { createPlaylist, deletePlaylist } from "@/lib/listener.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/use-roles";
import { ShareMenu } from "@/components/ShareMenu";
import { StorageImage } from "@/components/StorageImage";
import { usePlayer } from "@/stores/player";

export const Route = createFileRoute("/playlists")({
  head: () => ({ meta: [{ title: "My Playlists — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const { user } = useAuth();
  const { isAdmin } = useUserRoles();
  const qc = useQueryClient();
  const player = usePlayer();
  const createFn = useServerFn(createPlaylist);
  const deleteFn = useServerFn(deletePlaylist);

  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState({ name: "", description: "", make_public: false });

  // Fetch Playlists with songs for playback
  const { data: playlists, isLoading } = useQuery({
    queryKey: ["my-playlists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("playlists")
        .select("*, playlist_songs(position, song:songs(id,title,duration,price,cover_url,artist:artists(id,name)))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      qc.invalidateQueries({ queryKey: ["my-playlists-sidebar"] });
      setShowCreate(false);
      setNewPlaylist({ name: "", description: "", make_public: false });
      toast.success("Playlist created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create playlist: ${error.message}`);
    },
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      qc.invalidateQueries({ queryKey: ["my-playlists-sidebar"] });
      toast.success("Playlist deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete playlist: ${error.message}`);
    },
  });

  const handlePlayPlaylist = (playlist: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const rawSongs = playlist.playlist_songs ?? [];
    const songs = rawSongs
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

    if (songs.length === 0) {
      toast.error("This playlist has no songs yet");
      return;
    }

    const isThisPlaylistActive = player.playing && songs.some((s: any) => s.id === player.track?.id);
    if (isThisPlaylistActive) {
      player.togglePlay();
      return;
    }

    const currentIdx = songs.findIndex((s: any) => s.id === player.track?.id);
    if (currentIdx !== -1) {
      player.togglePlay();
    } else {
      const tracks = songs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artistName: s.artist?.name || s.artists?.name || "Unknown",
        coverUrl: s.cover_url,
        durationSeconds: s.duration,
      }));
      player.setQueue(tracks, 0);
    }
  };

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ListMusic className="size-6 text-primary" />
          <h1 className="text-3xl font-bold">My Playlists</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold hover:brightness-110 hover:scale-105 transition-all cursor-pointer"
        >
          <Plus className="size-4" /> Create Playlist
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-4">Create new playlist</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createM.mutate({ data: newPlaylist });
            }}
            className="space-y-4"
          >
            <input
              required
              placeholder="Playlist name"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              value={newPlaylist.name}
              onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })}
            />
            <textarea
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              value={newPlaylist.description}
              onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })}
            />
            {isAdmin ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newPlaylist.make_public}
                  onChange={(e) => setNewPlaylist({ ...newPlaylist, make_public: e.target.checked })}
                />
                Publish as an editorial playlist
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your playlist will be private. Only Wesu+ staff can publish editorial playlists.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createM.isPending}
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold cursor-pointer"
              >
                {createM.isPending ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-full bg-secondary text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-3">
        {/* User Playlists */}
        {!playlists || playlists.length === 0 ? (
          <div className="text-center py-10 bg-card/50 border border-dashed border-border rounded-xl">
            <ListMusic className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No custom playlists yet. Click "Create Playlist" above to start!</p>
          </div>
        ) : (
          playlists.map((playlist: any) => {
            const songs = (playlist.playlist_songs ?? [])
              .slice()
              .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
              .map((ps: any) => {
                let s = ps.song ?? ps.songs;
                if (Array.isArray(s)) s = s[0];
                return s;
              })
              .filter(Boolean);
            const songCount = songs.length;
            const firstCover = songs.find((s: any) => s?.cover_url)?.cover_url;
            const isThisPlaylistActive = player.playing && songs.some((s: any) => s.id === player.track?.id);

            return (
              <div
                key={playlist.id}
                className={`bg-card border rounded-xl p-4 flex items-center gap-4 group transition-all hover:bg-accent/20 ${
                  isThisPlaylistActive ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                {/* Playlist Thumbnail */}
                <Link to="/playlists/$id" params={{ id: playlist.id }} className="relative shrink-0">
                  {firstCover ? (
                    <StorageImage
                      bucket="album-art"
                      path={firstCover}
                      alt={playlist.name}
                      className="size-14 rounded-lg object-cover bg-muted"
                    />
                  ) : (
                    <div className="size-14 rounded-lg bg-secondary/80 border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                      <ListMusic className="size-6" />
                    </div>
                  )}
                </Link>

                {/* Playlist Info */}
                <Link
                  to="/playlists/$id"
                  params={{ id: playlist.id }}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {playlist.name}
                    </p>
                    {isThisPlaylistActive && (
                      <span className="shrink-0 flex items-center gap-1 text-[10px] uppercase font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                        Playing
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    <span className={playlist.is_public ? "text-primary font-medium" : ""}>
                      {playlist.is_public ? "Editorial • Public" : "Personal • Shareable"}
                    </span>
                    {" • "}
                    {songCount} {songCount === 1 ? "song" : "songs"}
                    {playlist.description ? ` • ${playlist.description}` : ""}
                  </p>
                </Link>

                {/* Play Button & Action Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => handlePlayPlaylist(playlist, e)}
                    disabled={songCount === 0}
                    className={`size-10 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer ${
                      songCount === 0
                        ? "bg-secondary text-muted-foreground opacity-50 cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:brightness-110 hover:scale-105"
                    }`}
                    title={isThisPlaylistActive ? "Pause" : "Play playlist"}
                    aria-label={isThisPlaylistActive ? "Pause playlist" : "Play playlist"}
                  >
                    {isThisPlaylistActive ? (
                      <Pause className="size-4 fill-current" />
                    ) : (
                      <Play className="size-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    onClick={() => deleteM.mutate({ data: { id: playlist.id } })}
                    className="text-destructive hover:text-destructive/80 p-2 hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                    aria-label="Delete playlist"
                    title="Delete playlist"
                  >
                    <Trash2 className="size-4" />
                  </button>

                  <ShareMenu
                    playlistId={playlist.id}
                    playlistName={playlist.name}
                    type="playlist"
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground relative z-20"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
