import { createFileRoute, Link } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, Plus, Trash2, Play, Pause } from "lucide-react";
import { createPlaylist, deletePlaylist } from "@/lib/listener.functions";
import { getPublicPlaylists } from "@/lib/music.functions";
import { useOfflineList } from "@/hooks/use-offline-list";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShareMenu } from "@/components/ShareMenu";
import { PlaylistCover } from "@/components/PlaylistCover";
import { usePlayer } from "@/stores/player";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/playlists")({
  head: () => ({
    meta: [
      { title: "Playlists — Wesu+" },
      { name: "description", content: "Browse editorial playlists on Wesu+." },
    ],
  }),
  // Deliberately NOT role-gated. This required a signed-in user, so an
  // anonymous visitor tapping "Playlists" in the nav was bounced to sign-in
  // for a page of editorial playlists they need no account to see — Spotify
  // shows these to everyone. Own playlists still need an account; that is
  // handled per-section inside the page.
  component: Page,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const player = usePlayer();
  const createFn = useServerFn(createPlaylist);
  const deleteFn = useServerFn(deletePlaylist);

  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState({ name: "", description: "", make_public: false });

  // Fetch Playlists with songs for playback
  const {
    data: playlists,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my-playlists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("playlists")
        .select(
          "*, playlist_songs(position, song:songs(id,title,duration,price,cover_url,artist:artists(id,name)))",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      qc.invalidateQueries({ queryKey: ["my-playlists-sidebar"] });
      qc.invalidateQueries({ queryKey: ["my-playlist-names"] });
      // The dashboard counts playlists from its own query with no staleTime, so
      // without this its stat and its 'No playlists yet' copy stay stale.
      qc.invalidateQueries({ queryKey: ["my-overview"] });
      setShowCreate(false);
      setNewPlaylist({ name: "", description: "", make_public: false });
      // RLS only lets staff publish. Saying so is the difference between
      // "your playlist is private" and a silent no-op.
      if (res?.publish_requested_but_denied) {
        toast.success("Playlist created as private — only Wesu+ staff can publish playlists");
      } else {
        toast.success("Playlist created successfully");
      }
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
      qc.invalidateQueries({ queryKey: ["my-playlist-names"] });
      // The dashboard counts playlists from its own query with no staleTime, so
      // without this its stat and its 'No playlists yet' copy stay stale.
      qc.invalidateQueries({ queryKey: ["my-overview"] });
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

    const isThisPlaylistActive =
      player.playing && songs.some((s: any) => s.id === player.track?.id);
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

  // Editorial playlists: public, browsable, no account needed. These were
  // the playlists visitors actually expect (Spotify's equivalents) and they
  // used to be unreachable from this page entirely — the route required
  // sign-in and then listed only YOUR playlists.
  const { data: editorial = [] } = useOfflineList("lists:editorial-playlists", {
    queryKey: ["editorial-playlists"],
    queryFn: () => getPublicPlaylists(),
    staleTime: 5 * 60 * 1000,
  });

  // Anonymous visitors have no "my playlists" to show. Say so and point at
  // the catalogue instead of rendering an empty account-shaped page.
  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pb-32">
        <div className="flex items-center gap-3 mb-2">
          <ListMusic className="size-6 text-primary" />
          <h1 className="text-3xl font-bold">Playlists</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Curated playlists from Wesu+. Create your own once you sign in.
        </p>

        {editorial.length === 0 ? (
          <div className="py-16 border border-dashed border-border rounded-2xl text-center text-muted-foreground">
            No public playlists yet — browse the catalogue in the meantime.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {editorial.map((pl: any) => (
              <Link
                key={pl.id}
                to="/playlists/$id"
                params={{ id: pl.id }}
                className="group block min-w-0"
              >
                <PlaylistCover
                  covers={pl.cover_url ? [pl.cover_url] : (pl.mosaic ?? [])}
                  alt={pl.name}
                  className="aspect-square w-full rounded-xl"
                />
                <p className="mt-2 text-sm font-semibold truncate group-hover:text-primary transition-colors">
                  {pl.name}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {pl.description || "Wesu+ editorial"}
                </p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10">
          <Link
            to="/browse"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            Browse music
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (isError)
    return (
      <div className="p-12 text-center">
        <p className="text-destructive mb-2">
          Couldn't load playlists. {friendlyError(error, "Try again in a moment.")}
        </p>
        <button
          onClick={() => refetch()}
          className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    );

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
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newPlaylist.make_public}
                onChange={(e) => setNewPlaylist({ ...newPlaylist, make_public: e.target.checked })}
              />
              Public — shareable with anyone who has the link. Only Wesu+ staff can publish
              editorial playlists, so yours will be private.
            </label>
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

      {editorial.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Editorial Playlists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {editorial.map((pl: any) => (
              <Link
                key={pl.id}
                to="/playlists/$id"
                params={{ id: pl.id }}
                className="group block min-w-0"
              >
                <PlaylistCover
                  covers={pl.cover_url ? [pl.cover_url] : (pl.mosaic ?? [])}
                  alt={pl.name}
                  className="aspect-square w-full rounded-xl"
                />
                <p className="mt-2 text-sm font-semibold truncate group-hover:text-primary transition-colors">
                  {pl.name}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {pl.description || "Wesu+ editorial"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3">
        {/* User Playlists */}
        {!playlists || playlists.length === 0 ? (
          <div className="text-center py-10 bg-card/50 border border-dashed border-border rounded-xl">
            <ListMusic className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No custom playlists yet. Click "Create Playlist" above to start!
            </p>
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
            const isThisPlaylistActive =
              player.playing && songs.some((s: any) => s.id === player.track?.id);

            return (
              <div
                key={playlist.id}
                className={`bg-card border rounded-xl p-4 flex items-center gap-4 group transition-all hover:bg-accent/20 ${
                  isThisPlaylistActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                {/* Playlist Thumbnail (cover or song mosaic) */}
                <Link
                  to="/playlists/$id"
                  params={{ id: playlist.id }}
                  className="relative shrink-0"
                >
                  <PlaylistCover
                    covers={
                      playlist.cover_url
                        ? [playlist.cover_url]
                        : songs.map((s: any) => s?.cover_url)
                    }
                    alt={playlist.name}
                    className="size-14 rounded-lg"
                  />
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
                    onClick={() => {
                      if (window.confirm(`Delete "${playlist.name}"? This can't be undone.`)) {
                        deleteM.mutate({ data: { id: playlist.id } });
                      }
                    }}
                    disabled={deleteM.isPending}
                    className="text-destructive hover:text-destructive/80 p-2 hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
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
