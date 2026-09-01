import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload,
  TrendingUp,
  DollarSign,
  Music,
  BarChart3,
  Settings,
  Users,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/use-auth";
import { useUserRoles } from "@/hooks/use-roles";
import { usePlatform, useIsMobile } from "@/hooks/use-platform";
import { getMyArtistOverview } from "@/lib/user.functions";
import { getMyArtistAnalytics } from "@/lib/analytics.functions";
import { requestArtistVerification, deleteSong } from "@/lib/artist.functions";
import { getVerificationConfig } from "@/lib/pricing.functions";
import { useCurrency } from "@/stores/currency";
import { RoleGate } from "@/components/RoleGate";
import { toast } from "sonner";
import { AnalyticsSection } from "@/components/AnalyticsSection";

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
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getMyArtistOverview);
  const fetchAnalytics = useServerFn(getMyArtistAnalytics);
  const requestVerificationFn = useServerFn(requestArtistVerification);
  const verificationConfigFn = useServerFn(getVerificationConfig);
  const deleteSongFn = useServerFn(deleteSong);
  const formatPrice = useCurrency((s) => s.formatPrice);

  const [songToDelete, setSongToDelete] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: window.location.pathname + window.location.search } });
  }, [user, loading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["artist-overview", user?.id],
    queryFn: () => fetchOverview(),
    enabled: !!user,
    retry: 1,
  });
  const { data: analytics } = useQuery({
    queryKey: ["artist-analytics", user?.id],
    queryFn: () => fetchAnalytics(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: verificationConfig } = useQuery({
    queryKey: ["verification-config"],
    queryFn: () => verificationConfigFn(),
    retry: false,
  });

  const verificationMutation = useMutation({
    mutationFn: requestVerificationFn,
    onSuccess: () => {
      toast.success("Verification application submitted! Waiting for admin review.");
      qc.invalidateQueries({ queryKey: ["artist-overview", user?.id] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSongFn,
    onSuccess: (res) => {
      toast.success(`Track "${res.title}" deleted successfully.`);
      setSongToDelete(null);
      qc.invalidateQueries({ queryKey: ["artist-overview", user?.id] });
      qc.invalidateQueries({ queryKey: ["my-songs"] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete track: ${err.message}`);
    },
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
          className="inline-block px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold cursor-pointer hover:scale-105 transition-transform"
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

  const isVerified = data.artist.verified;
  const verificationStatus = (data.artist as any).verification_status ?? "none";
  const followerCount = data.totalFollowers ?? 0;
  const allTracks = (data as any).uploadedSongs ?? data.topSongs ?? [];

  const stats = [
    { label: "Total Followers", value: followerCount.toLocaleString(), icon: Users },
    { label: "Total Listens / Plays", value: data.totalPlays.toLocaleString(), icon: TrendingUp },
    { label: "Total Revenue", value: formatPrice(data.totalRevenueZmw), icon: DollarSign },
    { label: "Songs", value: String(data.totalSongs), icon: Music },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{data.artist.name}</h1>
              {isVerified && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  <CheckCircle2 className="size-3.5" /> Verified
                </span>
              )}
            </div>
            <p className="text-muted-foreground">Artist Dashboard</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/artist-profile-edit"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent/80 transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Settings className="size-4" /> Edit Profile
            </a>
            <a
              href="/artist-studio"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground inline-flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform"
            >
              <Upload className="size-4" /> Open Studio
            </a>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-2xl p-6">
              <stat.icon className="size-5 text-primary mb-4" />
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <AnalyticsSection data={analytics} scope="artist" title="Audience analytics" />
        </div>

        {/* Verification Status Banner / Application Card */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className={`size-5 ${isVerified ? "text-primary" : "text-muted-foreground"}`} />
                <h2 className="text-lg font-semibold">Artist Verification</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {isVerified
                  ? "Your artist profile is officially verified by Wesu+ staff."
                  : verificationStatus === "pending"
                  ? "Your verification application is currently under review by Admin / Superadmin."
                  : `Get the verified badge on your profile. Verification requires at least ${verificationConfig?.min_followers ?? 100} followers and over K${verificationConfig?.min_earnings ?? 500} in total earnings.`}
              </p>
            </div>

            {!isVerified && (
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span>Followers:</span>
                    <span className={`font-semibold ${followerCount >= (verificationConfig?.min_followers ?? 100) ? "text-primary" : "text-foreground"}`}>
                      {followerCount} / {verificationConfig?.min_followers ?? 100}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Earnings:</span>
                    <span className={`font-semibold ${data.totalRevenueZmw > (verificationConfig?.min_earnings ?? 500) ? "text-primary" : "text-foreground"}`}>
                      K{data.totalRevenueZmw.toFixed(2)} / K{verificationConfig?.min_earnings ?? 500}
                    </span>
                  </div>
                </div>

                {verificationStatus === "pending" ? (
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-yellow-500/15 text-yellow-500 text-xs font-semibold">
                    <Clock className="size-4" /> Under Review
                  </span>
                ) : (
                  <button
                    onClick={() => verificationMutation.mutate(undefined as never)}
                    disabled={!data.eligibleForVerification || verificationMutation.isPending}
                    className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 hover:scale-105 transition-all cursor-pointer"
                  >
                    {verificationMutation.isPending ? "Submitting..." : "Apply for Verification"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Top / Uploaded Songs */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              Uploaded Tracks ({allTracks.length})
            </h2>
            <a
              href="/artist-studio"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
            >
              <Upload className="size-3.5" /> Upload New Track
            </a>
          </div>

          {allTracks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tracks yet. Open Studio to upload your first song.
            </p>
          ) : (
            <div className="space-y-2">
              {allTracks.map((track: any, i: number) => {
                const isPending = track.status === "pending";
                const isRejected = track.status === "rejected";
                const isTakenDown = track.status === "taken_down";
                const isApproved = track.status === "approved";

                return (
                  <div
                    key={track.id}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-accent/60 transition-colors border border-border/40"
                  >
                    <span className="w-6 text-sm text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{track.title}</p>
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-[11px] font-medium shrink-0">
                            <Clock className="size-3" /> Waiting for approval
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium shrink-0">
                            <CheckCircle2 className="size-3" /> Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium shrink-0">
                            <AlertTriangle className="size-3" /> Rejected
                          </span>
                        )}
                        {isTakenDown && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium shrink-0">
                            <ShieldAlert className="size-3" /> Taken Down
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(track.play_count ?? 0).toLocaleString()} listens
                        {track.genre ? ` • ${track.genre}` : ""}
                        {track.created_at ? ` • Uploaded ${new Date(track.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {formatPrice(track.price)}
                    </span>
                    <button
                      onClick={() => setSongToDelete({ id: track.id, title: track.title })}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      title="Delete song"
                      aria-label={`Delete ${track.title}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Song Confirmation Modal */}
      {songToDelete && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" />
                <h3 className="font-semibold text-lg text-foreground">Delete Song</h3>
              </div>
              <button
                onClick={() => setSongToDelete(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">"{songToDelete.title}"</strong>?
              This action cannot be undone. All playlists, likes, and streaming records for this song will be removed.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSongToDelete(null)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-full bg-secondary border border-border text-sm font-medium hover:bg-accent cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: songToDelete.id })}
                className="px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Song"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
