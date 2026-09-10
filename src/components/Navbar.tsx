import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, memo } from "react";
import { Search, LogOut, UserCircle, Shield, Mic2, Menu, X, FileText } from "lucide-react";
import { useAuth } from "../hooks/use-auth";
import { useUserRoles } from "../hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "./ThemeToggle";
import { CurrencyToggle } from "./CurrencyToggle";
import { GlobalSearch } from "./GlobalSearch";
import { StorageImage } from "./StorageImage";
import { useQuery } from "@tanstack/react-query";
import { SkeletonButton } from "./Skeleton";

const NavbarComponent = function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const { isArtist, isAdmin, isSuperAdmin, loading: rolesLoading } = useUserRoles();

  // Use React Query for avatar fetch with proper caching and optimistic UI
  const { data: avatarPath } = useQuery({
    queryKey: ["user-avatar", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data as any)?.avatar_url ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const isAuth = useRouterState({ select: (s) => s.location.pathname }) === "/auth";
  const isLoading = authLoading || rolesLoading;

  const navLinks: { to: string; label: string; icon: any }[] = [];

  // During initial auth loading, show skeleton to prevent flicker
  if (isLoading) {
    return (
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl h-16">
        <div className="h-full px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2"
              aria-label="Wesu+ home"
            >
              <img src="/images/wesu-logo.png" alt="Wesu+" className="h-11 w-auto" />
            </Link>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:block">
              <SkeletonButton className="w-64" />
            </div>
            <CurrencyToggle />
            <ThemeToggle />
            <SkeletonButton className="w-24" />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl h-16">
      <div className="h-full px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {user && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors lg:hidden"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-2"
            aria-label="Wesu+ home"
          >
            <img src="/images/wesu-logo.png" alt="Wesu+" className="h-11 w-auto" />
          </Link>
          <div className="hidden lg:flex items-center gap-1 ml-4">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden md:block">
            <GlobalSearch />
          </div>

          <Link
            to="/search"
            search={{ q: "", tab: "all" }}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>

          <CurrencyToggle />
          <ThemeToggle />

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
                aria-label="Open user menu"
              >
                {avatarPath ? (
                  <StorageImage
                    bucket="user-avatars"
                    path={avatarPath}
                    alt="Profile"
                    className="size-8 rounded-full object-cover ring-2 ring-border hover:ring-primary transition-all"
                  />
                ) : (
                  <UserCircle className="size-7 hover:text-primary transition-colors" />
                )}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
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
                  <Link
                    to="/dashboard"
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Library
                  </Link>
                  <Link
                    to="/profile"
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  {!isArtist && (
                    <Link
                      to="/become-artist"
                      className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Mic2 className="size-4" /> Become an Artist
                      </span>
                    </Link>
                  )}
                  {isArtist && (
                    <Link
                      to="/artist-dashboard"
                      className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Mic2 className="size-4" /> Artist Portal
                      </span>
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Shield className="size-4" /> Admin
                      </span>
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link
                      to="/superadmin"
                      className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Shield className="size-4 text-primary" /> Superadmin
                      </span>
                    </Link>
                  )}
                  <Link
                    to="/terms"
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileText className="size-4" /> Terms &amp; Conditions
                    </span>
                  </Link>
                  <button
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setMenuOpen(false);
                      window.location.href = "/";
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-accent flex items-center gap-2 border-t border-border transition-colors"
                  >
                    <LogOut className="size-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : !isAuth ? (
            <Link
              to="/auth"
              className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
            >
              Sign In
            </Link>
          ) : null}
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-background/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                <link.icon className="size-5" />
                {link.label}
              </Link>
            ))}
            {user && (
              <>
                <div className="border-t border-border my-2" />
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  My Library
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  Profile
                </Link>
                {!isArtist && (
                  <Link
                    to="/become-artist"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Mic2 className="size-5" />
                    Become an Artist
                  </Link>
                )}
                {isArtist && (
                  <Link
                    to="/artist-dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Mic2 className="size-5" />
                    Artist Portal
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Shield className="size-5" />
                    Admin
                  </Link>
                )}
                {isSuperAdmin && (
                  <Link
                    to="/superadmin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                  >
                    <Shield className="size-5 text-primary" />
                    Superadmin
                  </Link>
                )}
                <Link
                  to="/terms"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <FileText className="size-5" />
                  Terms &amp; Conditions
                </Link>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setMobileMenuOpen(false);
                    window.location.href = "/";
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-accent rounded-lg transition-colors"
                >
                  <LogOut className="size-5" />
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export const Navbar = memo(NavbarComponent);
