import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, TrendingUp, DollarSign, Music, BarChart3, Settings } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import { getMyArtistOverview } from "@/lib/user.functions";
import { RoleGate } from "@/components/RoleGate";

export const Route = createFileRoute("/artist-dashboard")({
  head: () => ({
    meta: [{ title: "Artist Dashboard — Wesu+" }],
  }),
  component: () => (
    <RoleGate require="artist">
      <ArtistDashboardPage />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function ArtistDashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getMyArtistOverview);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["artist-overview", user?.id],
    queryFn: () => fetchOverview(),
    enabled: !!user,
    retry: 1,
  });

  if (loading || !user) return null;
  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center">
        <p className="text-destructive mb-4">Failed to load artist data</p>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }
  if (isLoading)
    return <div className="p-12 text-center text-muted-foreground">Loading artist data…</div>;
  if (!data)
    return <div className="p-12 text-center text-muted-foreground">No artist data available</div>;

  if (!data.artist) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center">
        <Music className="size-12 mx-auto mb-4 text-muted-foreground" />
        <h1 className="text-2xl font-bold mb-2">You're not an artist yet</h1>
        <p className="text-muted-foreground mb-6">
          You have the artist role but no artist profile. Apply for an artist account to start uploading music.
        </p>
        <a
          href="/become-artist"
          className="inline-block px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          Apply now
        </a>
      </div>
    );
  }

  if (data.artist.status !== "approved") {
    const isRejected = data.artist.status === "rejected";
    return (
      <div className="max-w-2xl mx-auto p-12 text-center">
        <div
          className={`inline-flex items-center justify-center size-14 rounded-full mb-4 ${
            isRejected ? "bg-destructive/10" : "bg-yellow-500/10"
          }`}
        >
          <Music className={`size-6 ${isRejected ? "text-destructive" : "text-yellow-500"}`} />
        </div>
        <h1 className="text-2xl font-bold mb-2">
          {isRejected ? "Application not approved" : "Application under review"}
        </h1>
        <p className="text-muted-foreground mb-6">
          {isRejected
            ? "Your artist application was not approved. You can update your details and reapply."
            : "Thanks for applying! An admin is reviewing your artist application. You'll get a notification once it's approved and you can start uploading music."}
        </p>
        <div className="bg-card border border-border rounded-2xl p-6 text-left">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Artist name</p>
          <p className="font-semibold mb-3">{data.artist.name}</p>
          {data.artist.genre && (
            <>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Genre</p>
              <p className="font-semibold mb-3">{data.artist.genre}</p>
            </>
          )}
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Status</p>
          <p
            className={`font-semibold capitalize ${
              isRejected ? "text-destructive" : "text-yellow-500"
            }`}
          >
            {data.artist.status}
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Total Revenue", value: `ZMW ${data.totalRevenueZmw.toFixed(2)}`, icon: DollarSign },
    { label: "Total Plays", value: data.totalPlays.toLocaleString(), icon: TrendingUp },
    { label: "Songs", value: String(data.totalSongs), icon: Music },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">{data.artist.name}</h1>
            <p className="text-muted-foreground">Artist Dashboard</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/artist-profile-edit"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/80 transition-colors inline-flex items-center gap-2"
            >
              <Settings className="size-4" /> Edit Profile
            </a>
            <a
              href="/artist-studio"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground inline-flex items-center gap-2"
            >
              <Upload className="size-4" /> Open Studio
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-2xl p-6">
              <stat.icon className="size-5 text-primary mb-4" />
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="size-5" />
            Top Tracks
          </h2>
          {data.topSongs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tracks yet. Open Studio to upload your first song.
            </p>
          ) : (
            <div className="space-y-2">
              {data.topSongs.map((track, i) => (
                <div
                  key={track.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <span className="w-6 text-sm text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{track.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {(track.play_count ?? 0).toLocaleString()} streams
                    </p>
                  </div>
                  <span className="text-sm font-medium">
                    ZMW {Number(track.price ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
