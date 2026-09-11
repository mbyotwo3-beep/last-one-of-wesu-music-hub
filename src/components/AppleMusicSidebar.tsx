import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Search, Play, Pause, Grid, Clock, Disc, Music, ListMusic, Heart, Mic2, Plus } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer } from "@/stores/player";
import { toast } from "sonner";

export function AppleMusicSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const player = usePlayer();
  const [searchQuery, setSearchQuery] = useState("");

  const mainNav = [
    { to: "/", label: "Listen Now", icon: Play },
    { to: "/browse", label: "Browse", icon: Grid, highlight: true },
    { to: "/podcast", label: "Podcasts", icon: Mic2 },
  ];

  const libraryNav = [
    { to: "/new-music", label: "Recently Added", icon: Clock },
    { to: "/artists", label: "Artists", icon: Disc },
    { to: "/albums", label: "Albums", icon: Music },
    { to: "/hot-tracks", label: "Songs", icon: ListMusic },
  ];

  // Dynamically fetch user playlists with songs for instant playback
  const { data: userPlaylists } = useQuery({
    queryKey: ["my-playlists-sidebar", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("playlists")
        .select("id, name, playlist_songs(position, song:songs(id,title,duration,price,cover_url,artist:artists(id,name)))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  // Fetch Liked Songs for sidebar playback
  const { data: likedSongs } = useQuery({
    queryKey: ["liked-songs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("saved_tracks")
        .select("songs(*, artists(name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []).map((item: any) => item.songs).filter(Boolean);
    },
    enabled: !!user?.id,
    staleTime: 0,
  });

  const safeLikedSongs = likedSongs ?? [];
  const isLikedSongsPlaying = player.playing && safeLikedSongs.some((s: any) => s.id === player.track?.id);

  const handlePlayLikedSongs = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (safeLikedSongs.length === 0) {
      toast.error("No liked songs to play");
      return;
    }
    if (isLikedSongsPlaying) {
      player.togglePlay();
      return;
    }
    const currentIdx = safeLikedSongs.findIndex((s: any) => s.id === player.track?.id);
    if (currentIdx !== -1) {
      player.togglePlay();
    } else {
      const tracks = safeLikedSongs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artistName: s.artists?.name ?? "Unknown",
        coverUrl: s.cover_url,
        durationSeconds: s.duration,
      }));
      player.setQueue(tracks, 0);
    }
  };

  const handlePlayPlaylist = (pl: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const songs = (pl.playlist_songs ?? [])
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((ps: any) => ps.song)
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

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 bg-sidebar/80 backdrop-blur-xl border-r border-border">
      {/* Search Bar */}
      <div className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/search", search: { q: searchQuery, tab: "all" } });
          }}
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary/50 border border-input rounded-full pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors cursor-text"
            />
          </div>
        </form>
      </div>

      {/* Main Navigation */}
      <div className="px-3 mb-4">
        <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Wesu+ Music
        </h3>
        <nav className="space-y-0.5">
          {mainNav.map((item) => {
            const isActive = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? item.highlight
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon className={`size-5 ${item.highlight && isActive ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Library Navigation */}
      <div className="px-3 mb-4">
        <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Library
        </h3>
        <nav className="space-y-0.5">
          {libraryNav.map((item) => {
            const isActive = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Playlists */}
      <div className="px-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Playlists
          </h3>
          <Link
            to="/playlists"
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
          >
            See All
          </Link>
        </div>
        <nav className="space-y-0.5">
          {/* Favorites / Liked Songs preset */}
          <div
            className={`group/fav flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/liked-songs" || pathname === "/library"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <Link
              to="/liked-songs"
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
            >
              <Heart className={`size-5 shrink-0 ${isLikedSongsPlaying ? "text-red-500 fill-red-500" : "text-primary"}`} />
              <span className="truncate">Liked Songs</span>
            </Link>
            {safeLikedSongs.length > 0 && (
              <button
                onClick={handlePlayLikedSongs}
                className={`shrink-0 p-1 rounded-full text-foreground hover:text-primary transition-all cursor-pointer ${
                  isLikedSongsPlaying ? "opacity-100 text-primary" : "opacity-0 group-hover/fav:opacity-100"
                }`}
                title={isLikedSongsPlaying ? "Pause" : "Play Liked Songs"}
                aria-label={isLikedSongsPlaying ? "Pause Liked Songs" : "Play Liked Songs"}
              >
                {isLikedSongsPlaying ? (
                  <Pause className="size-3.5 fill-current" />
                ) : (
                  <Play className="size-3.5 fill-current" />
                )}
              </button>
            )}
          </div>

          {/* User's dynamic playlists */}
          {userPlaylists && userPlaylists.length > 0 ? (
            userPlaylists.map((pl: any) => {
              const isPlActive = pathname === `/playlists/${pl.id}`;
              const songs = (pl.playlist_songs ?? []).map((ps: any) => ps.song).filter(Boolean);
              const isThisPlaylistActive = player.playing && songs.some((s: any) => s.id === player.track?.id);

              return (
                <div
                  key={pl.id}
                  className={`group/pl flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isPlActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Link
                    to="/playlists/$id"
                    params={{ id: pl.id }}
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <ListMusic className={`size-5 shrink-0 ${isThisPlaylistActive ? "text-primary" : ""}`} />
                    <span className="truncate">{pl.name}</span>
                  </Link>

                  {songs.length > 0 && (
                    <button
                      onClick={(e) => handlePlayPlaylist(pl, e)}
                      className={`shrink-0 p-1 rounded-full text-foreground hover:text-primary transition-all cursor-pointer ${
                        isThisPlaylistActive ? "opacity-100 text-primary" : "opacity-0 group-hover/pl:opacity-100"
                      }`}
                      title={isThisPlaylistActive ? "Pause" : "Play playlist"}
                      aria-label={isThisPlaylistActive ? "Pause playlist" : "Play playlist"}
                    >
                      {isThisPlaylistActive ? (
                        <Pause className="size-3.5 fill-current" />
                      ) : (
                        <Play className="size-3.5 fill-current" />
                      )}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <Link
              to="/playlists"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <Plus className="size-4" />
              Create Playlist
            </Link>
          )}
        </nav>

        <div className="mt-4 pt-3 border-t border-border/50">
          <Link
            to="/become-artist"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors w-full text-left cursor-pointer"
          >
            <Mic2 className="size-5" />
            Become an Artist
          </Link>
        </div>
      </div>
    </aside>
  );
}

