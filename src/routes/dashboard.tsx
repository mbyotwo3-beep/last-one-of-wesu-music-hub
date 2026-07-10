import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Headphones, Heart, ListMusic, ShoppingBag } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import { getMyOverview } from "@/lib/user.functions";
import { getMyLabel } from "@/lib/labels.functions";
import { usePlatform } from "@/hooks/use-platform";
import { MobileLibrary } from "@/components/mobile/screens/MobileLibrary";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "My Dashboard — Wesu+" }],
  }),
  component: DashboardRoute,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function DashboardRoute() {
  const { isSuperAdmin, isAdmin, isArtist, loading } = useUserRoles();
  const { user } = useAuth();
  const navigate = useNavigate();
  const platform = usePlatform();
  const getLabelFn = useServerFn(getMyLabel);

  const { data: label } = useQuery({
    queryKey: ["my-label", user?.id],
    queryFn: () => getLabelFn(),
    enabled: !!user && !loading,
  });

  useEffect(() => {
    if (loading) return;
    // Route users to appropriate dashboard based on highest role
    if (isSuperAdmin) {
      navigate({ to: "/superadmin", replace: true });
    } else if (isAdmin) {
      navigate({ to: "/admin", replace: true });
    } else if (isArtist) {
      navigate({ to: "/artist-dashboard", replace: true });
    } else if (label && label.status === "approved") {
      navigate({ to: "/label-dashboard", replace: true });
    }
    // Regular users stay on /dashboard
  }, [isSuperAdmin, isAdmin, isArtist, label, loading, navigate]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (isSuperAdmin || isAdmin || isArtist || (label && label.status === "approved")) return null;

  return platform === "native" ? <MobileLibrary /> : <DashboardPage />;
}

function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getMyOverview);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["my-overview", user?.id],
    queryFn: () => fetchOverview(),
    enabled: !!user,
  });

  if (loading || !user) return null;
  if (isLoading || !data)
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  const stats = [
    { label: "Playlists", value: data.stats.playlists, icon: ListMusic, link: "/playlists" },
    { label: "Purchases", value: data.stats.purchases, icon: ShoppingBag, link: "/library" },
    { label: "Plan", value: data.subscription?.plan ?? "Free", icon: Headphones, link: "/subscriptions" },
    { label: "Liked", value: 0, icon: Heart, link: "/library" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">My Library</h1>
        <p className="text-muted-foreground mb-8">
          Welcome back{data.profile?.full_name ? `, ${data.profile.full_name}` : ""}.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              to={stat.link as any}
              className="bg-card border border-border rounded-2xl p-6 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <stat.icon className="size-5 text-primary mb-3" />
              <p className="text-2xl font-bold">{String(stat.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">My Playlists</h2>
            {data.playlists.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No playlists yet. Create one from the browse page.
              </p>
            ) : (
              <div className="space-y-3">
                {data.playlists.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="size-10 rounded bg-secondary flex items-center justify-center">
                      <ListMusic className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.is_public ? "Public" : "Private"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Purchases</h2>
            {data.recentPurchases.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No purchases yet.{" "}
                <Link to="/browse" className="text-primary hover:underline">
                  Browse music →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentPurchases.map((p) => {
                  const title =
                    (p.song as { title?: string } | null)?.title ??
                    (p.album as { title?: string } | null)?.title ??
                    "Item";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-accent"
                    >
                      <p className="text-sm font-medium truncate">{title}</p>
                      <span className="text-primary text-sm font-bold">
                        K{Number(p.amount).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
