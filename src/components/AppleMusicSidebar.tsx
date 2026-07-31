import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Search, Play, Grid, Radio, Clock, Disc, Music, ListMusic, Heart, Mic2, Plus } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function AppleMusicSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const mainNav = [
    { to: "/", label: "Listen Now", icon: Play },
    { to: "/browse", label: "Browse", icon: Grid, highlight: true },
    { to: "/radio", label: "Radio", icon: Radio },
  ];

  const libraryNav = [
    { to: "/new-music", label: "Recently Added", icon: Clock },
    { to: "/artists", label: "Artists", icon: Disc },
    { to: "/albums", label: "Albums", icon: Music },
    { to: "/hot-tracks", label: "Songs", icon: ListMusic },
  ];

  // Dynamically fetch user playlists
  const { data: userPlaylists } = useQuery({
    queryKey: ["my-playlists-sidebar", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("playlists")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

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
          <Link
            to="/library"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname === "/library"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <Heart className="size-5 text-primary" />
            Favorites & Liked
          </Link>

          {/* User's dynamic playlists */}
          {userPlaylists && userPlaylists.length > 0 ? (
            userPlaylists.map((pl) => {
              const isPlActive = pathname === `/playlists/${pl.id}`;
              return (
                <Link
                  key={pl.id}
                  to="/playlists/$id"
                  params={{ id: pl.id }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isPlActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <ListMusic className="size-5" />
                  <span className="truncate">{pl.name}</span>
                </Link>
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

