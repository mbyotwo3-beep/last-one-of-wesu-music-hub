import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, Search, Library, User, Mic2, Shield, Menu, X, LogOut, Play, Grid, Radio, Clock, Disc, ListMusic, Heart, Music } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  ariaLabel: string;
  requireAuth?: boolean;
  show: boolean;
}

/** Pure function: compute tabs based on auth/role state. Exported for testing. */
export function computeTabs(opts: {
  isAuthenticated: boolean;
  isArtist: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}): Tab[] {
  const { isAuthenticated, isArtist, isAdmin, isSuperAdmin } = opts;
  return [
    {
      to: "/",
      label: "Home",
      icon: Home,
      ariaLabel: "Home",
      show: true,
    },
    {
      to: "/profile",
      label: "Profile",
      icon: User,
      ariaLabel: "My profile",
      requireAuth: true,
      show: true,
    },
    {
      to: "/artist-studio",
      label: "Studio",
      icon: Mic2,
      ariaLabel: "Artist studio",
      show: isArtist || isAdmin || isSuperAdmin,
    },
    {
      to: isSuperAdmin ? "/superadmin" : "/admin",
      label: "Admin",
      icon: Shield,
      ariaLabel: "Admin panel",
      show: isAdmin || isSuperAdmin,
    },
  ].filter((t) => t.show);
}

export function BottomTabBar() {
  const { user } = useAuth();
  const { isArtist, isAdmin, isSuperAdmin } = useUserRoles();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const tabs = computeTabs({
    isAuthenticated: !!user,
    isArtist,
    isAdmin,
    isSuperAdmin,
  });

  function handleTab(tab: Tab) {
    if (tab.requireAuth && !user) {
      navigate({ to: "/auth" });
    } else {
      navigate({ to: tab.to as any });
    }
  }

  return (
    <>

      <nav
        className="fixed bottom-0 inset-x-0 bg-background/70 backdrop-blur-xl border-t border-border/50 z-50 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main navigation"
      >
        <div className="flex items-stretch h-16">
          {tabs.map((tab) => {
            const isActive = pathname === tab.to || (tab.to !== "/" && pathname.startsWith(tab.to));
            const Icon = tab.icon;
            return (
              <button
                key={tab.to}
                onClick={() => handleTab(tab)}
                aria-label={tab.ariaLabel}
                aria-current={isActive ? "page" : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-6" />
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Search"
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] transition-colors text-muted-foreground hover:text-foreground"
          >
            <Search className="size-6" />
            <span className="text-[10px] font-medium leading-none">Search</span>
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] transition-colors text-muted-foreground hover:text-foreground"
          >
            {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            <span className="text-[10px] font-medium leading-none">Menu</span>
          </button>
        </div>
      </nav>

      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-xl z-[60] flex flex-col p-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setSearchOpen(false)}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-6" />
            </button>
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-secondary/50 border border-input rounded-full pl-4 pr-4 py-3 text-lg focus:outline-none focus:border-ring text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <p className="text-sm text-muted-foreground text-center">Search functionality coming soon</p>
        </div>
      )}

      {/* Menu Modal */}
      {menuOpen && (
        <div className="fixed inset-0 bg-background/95 backdrop-blur-xl z-[60] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              onClick={() => setMenuOpen(false)}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-6" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {/* Wesu+ Music Section */}
            <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Wesu+ Music
            </h3>
            <button
              onClick={() => {
                navigate({ to: "/" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Play className="size-5" />
              <span className="text-sm font-medium">Listen Now</span>
            </button>
            <button
              onClick={() => {
                navigate({ to: "/browse" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Grid className="size-5" />
              <span className="text-sm font-medium">Browse</span>
            </button>
            <button
              onClick={() => {
                navigate({ to: "/radio" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Radio className="size-5" />
              <span className="text-sm font-medium">Radio</span>
            </button>

            {/* Library Section */}
            <h3 className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Library
            </h3>
            <button
              onClick={() => {
                navigate({ to: "/recently-added" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Clock className="size-5" />
              <span className="text-sm font-medium">Recently Added</span>
            </button>
            <button
              onClick={() => {
                navigate({ to: "/artists" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Disc className="size-5" />
              <span className="text-sm font-medium">Artists</span>
            </button>
            <button
              onClick={() => {
                navigate({ to: "/albums" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Music className="size-5" />
              <span className="text-sm font-medium">Albums</span>
            </button>
            <button
              onClick={() => {
                navigate({ to: "/songs" });
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <ListMusic className="size-5" />
              <span className="text-sm font-medium">Songs</span>
            </button>

            {/* Playlists Section */}
            <h3 className="px-3 mb-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Playlists
            </h3>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Heart className="size-5" />
              <span className="text-sm font-medium">Favorites</span>
            </button>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Play className="size-5" />
              <span className="text-sm font-medium">Workout Mix</span>
            </button>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Music className="size-5" />
              <span className="text-sm font-medium">Late Night</span>
            </button>

            {/* User Section */}
            {user && (
              <>
                <div className="border-t border-border my-4" />
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <p className="text-xs font-semibold text-primary mt-0.5">
                    {isSuperAdmin
                      ? "Superadmin"
                      : isAdmin
                        ? "Admin"
                        : isArtist
                          ? "Artist"
                          : "Listener"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigate({ to: "/dashboard" });
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <Library className="size-5" />
                  <span className="text-sm font-medium">My Library</span>
                </button>
                <button
                  onClick={() => {
                    navigate({ to: "/profile" });
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <User className="size-5" />
                  <span className="text-sm font-medium">Profile</span>
                </button>
                {isArtist && (
                  <button
                    onClick={() => {
                      navigate({ to: "/artist-dashboard" });
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Mic2 className="size-5" />
                    <span className="text-sm font-medium">Artist Portal</span>
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => {
                      navigate({ to: "/admin" });
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Shield className="size-5" />
                    <span className="text-sm font-medium">Admin</span>
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => {
                      navigate({ to: "/superadmin" });
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Shield className="size-5 text-primary" />
                    <span className="text-sm font-medium">Superadmin</span>
                  </button>
                )}
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setMenuOpen(false);
                    window.location.href = "/";
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-destructive hover:bg-accent rounded-lg transition-colors border-t border-border"
                >
                  <LogOut className="size-5" />
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
              </>
            )}
          </div>
          {/* Pinned bottom: Become an Artist (like desktop sidebar) */}
          {!isArtist && (
            <div className="border-t border-border p-4">
              <button
                onClick={() => {
                  navigate({ to: "/become-artist" });
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                <Mic2 className="size-5" />
                <span className="text-sm font-medium">Become an Artist</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
