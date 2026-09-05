import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Music, Shield, BarChart3, Check, X, Building2,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, CreditCard,
  Trash2, Search, Filter,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import {
  getPlatformStats,
  getRecentActivity,
  listPendingSongs,
  listAllSongsAdmin,
  deleteSong,
  moderateSong,
  listPendingArtists,
  moderateArtist,
  listPendingVerifications,
  moderateArtistVerification,
  listPendingLabels,
  moderateLabel,
  getArtistDiagnostics,
  listPayoutsForStaff,
  reviewPayout,
} from "@/lib/admin.functions";
import {
  listStuckTransactions,
  reconcileTransaction,
  reconcileAllTransactions,
  cancelStuckTransaction,
} from "@/lib/reconcile.functions";
import { getPlatformAnalytics } from "@/lib/analytics.functions";
import { getVerificationConfig } from "@/lib/pricing.functions";
import { CarouselBuilder } from "@/components/CarouselBuilder";
import { AnalyticsSection } from "@/components/AnalyticsSection";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Panel — Wesu+" }] }),
  component: () => (
    <RoleGate require="admin">
      <AdminRoute />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function AdminRoute() {
  return <AdminPage />;
}

type Tab = "overview" | "songs" | "artists" | "verifications" | "labels" | "payouts" | "payments" | "carousels" | "diagnostics";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");

  const listSongsFn = useServerFn(listPendingSongs);
  const listArtistsFn = useServerFn(listPendingArtists);
  const listVerifsFn = useServerFn(listPendingVerifications);
  const listLabelsFn = useServerFn(listPendingLabels);

  const pendingSongsQ = useQuery({ queryKey: ["pending-songs-count"], queryFn: () => listSongsFn(), retry: 1 });
  const pendingArtistsQ = useQuery({ queryKey: ["pending-artists-count"], queryFn: () => listArtistsFn(), retry: 1 });
  const pendingVerifsQ = useQuery({ queryKey: ["pending-verifications-count"], queryFn: () => listVerifsFn(), retry: 1 });
  const pendingLabelsQ = useQuery({ queryKey: ["pending-labels-count"], queryFn: () => listLabelsFn(), retry: 1 });

  const tabsError = pendingSongsQ.error || pendingArtistsQ.error || pendingVerifsQ.error || pendingLabelsQ.error;
  if (tabsError) {
    return (
      <div className="text-destructive p-6">
        Error loading pending counts: {(tabsError as Error).message}
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "songs", label: "Songs", badge: pendingSongsQ.data?.length },
    { id: "artists", label: "Artists", badge: pendingArtistsQ.data?.length },
    { id: "verifications", label: "Verifications", badge: pendingVerifsQ.data?.length },
    { id: "labels", label: "Labels", badge: pendingLabelsQ.data?.length },
    { id: "payouts", label: "Payouts" },
    { id: "payments", label: "Payments" },
    { id: "carousels", label: "Carousels" },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="size-6 text-primary" />
          <h1 className="text-3xl font-bold">Admin Panel</h1>
        </div>

        {/* Tab bar with pending badge counts */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-tab={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium capitalize cursor-pointer transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {t.label}
              {!!t.badge && t.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <Overview
            pendingSongs={pendingSongsQ.data?.length ?? 0}
            pendingArtists={pendingArtistsQ.data?.length ?? 0}
            pendingVerifs={pendingVerifsQ.data?.length ?? 0}
            pendingLabels={pendingLabelsQ.data?.length ?? 0}
            setTab={setTab}
          />
        )}
        {tab === "songs" && <SongMod />}
        {tab === "artists" && <ArtistMod />}
        {tab === "verifications" && <VerificationMod />}
        {tab === "labels" && <LabelMod />}
        {tab === "payouts" && <PayoutMod />}
        {tab === "payments" && <PaymentsMod />}
        {tab === "carousels" && <CarouselBuilder />}
        {tab === "diagnostics" && <Diagnostics />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview — live metrics + pending action alerts
// ─────────────────────────────────────────────────────────────
function Overview({
  pendingSongs,
  pendingArtists,
  pendingVerifs,
  pendingLabels,
  setTab,
}: {
  pendingSongs: number;
  pendingArtists: number;
  pendingVerifs: number;
  pendingLabels: number;
  setTab: (t: Tab) => void;
}) {
  const statsFn = useServerFn(getPlatformStats);
  const activityFn = useServerFn(getRecentActivity);
  const analyticsFn = useServerFn(getPlatformAnalytics);

  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => statsFn(), retry: 1 });
  const activityQ = useQuery({ queryKey: ["admin-activity"], queryFn: () => activityFn(), retry: 1 });
  const analyticsQ = useQuery({ queryKey: ["admin-analytics"], queryFn: () => analyticsFn(), retry: 1, staleTime: 60_000 });

  if (statsQ.isLoading) return <div className="text-muted-foreground">Loading metrics…</div>;
  if (statsQ.error) return <div className="text-destructive">Error loading stats: {(statsQ.error as Error).message}</div>;
  if (activityQ.error) return <div className="text-destructive">Error loading activity: {(activityQ.error as Error).message}</div>;

  const d = statsQ.data;

  const metricCards = d
    ? [
        { label: "Total Users", value: d.totalUsers.toLocaleString(), icon: Users, color: "text-blue-400" },
        { label: "Total Artists", value: (d as any).totalArtists?.toLocaleString() ?? "0", icon: Music, color: "text-purple-400" },
        { label: "Total Songs", value: d.totalSongs.toLocaleString(), icon: Music, color: "text-green-400" },
        { label: "Completed purchases (30d)", value: d.completedPurchases30d.toLocaleString(), icon: CreditCard, color: "text-yellow-400" },
        { label: "Revenue (30 days)", value: `ZMW ${d.monthlyRevenueZmw.toFixed(2)}`, icon: TrendingUp, color: "text-primary" },
      ]
    : [];

  const pendingItems = [
    { label: "Songs awaiting approval", count: pendingSongs, tab: "songs" as Tab, icon: Music },
    { label: "Artist applications", count: pendingArtists, tab: "artists" as Tab, icon: Users },
    { label: "Verification requests", count: pendingVerifs, tab: "verifications" as Tab, icon: CheckCircle2 },
    { label: "Label applications", count: pendingLabels, tab: "labels" as Tab, icon: Building2 },
  ].filter((i) => i.count > 0);

  return (
    <div className="space-y-8">
      {/* Live metrics */}
      {statsQ.isLoading ? (
        <div className="text-muted-foreground text-sm">Loading metrics…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {metricCards.map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-2xl p-5">
              <c.icon className={`size-5 mb-3 ${c.color}`} />
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <AnalyticsSection data={analyticsQ.data} scope="platform" title="Platform listening analytics" />

      {/* Pending action alerts */}
      {pendingItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="size-5 text-yellow-500" /> Needs Your Approval
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pendingItems.map((item) => (
              <button
                key={item.tab}
                onClick={() => setTab(item.tab)}
                className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5 text-left hover:bg-yellow-500/15 hover:border-yellow-500/50 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <item.icon className="size-5 text-yellow-500" />
                  <span className="text-2xl font-bold text-yellow-500">{item.count}</span>
                </div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-1 group-hover:text-yellow-500 transition-colors">
                  Click to review →
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingItems.length === 0 && !statsQ.isLoading && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex items-center gap-4">
          <CheckCircle2 className="size-8 text-primary shrink-0" />
          <div>
            <p className="font-semibold">All clear!</p>
            <p className="text-sm text-muted-foreground">No pending approvals at this time.</p>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Music className="size-4 text-primary" /> Recent Uploads
          </h2>
          {!activityQ.data || activityQ.data.recentSongs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          ) : (
            <ul className="space-y-3">
              {activityQ.data.recentSongs.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-accent/50">
                  <Music className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {(s.artist as { name?: string } | null)?.name ?? "Unknown"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Recent Transactions
          </h2>
          {!activityQ.data || activityQ.data.recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="space-y-3">
              {activityQ.data.recentTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-accent/50">
                  <div>
                    <p className="text-sm font-medium">ZMW {Number(t.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t.method_code}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-full ${
                      t.status === "completed"
                        ? "bg-primary/15 text-primary"
                        : t.status === "pending"
                        ? "bg-yellow-500/15 text-yellow-500"
                        : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Songs moderation & platform-wide song management
// ─────────────────────────────────────────────────────────────
function SongMod() {
  const qc = useQueryClient();
  const listPending = useServerFn(listPendingSongs);
  const listAll = useServerFn(listAllSongsAdmin);
  const mod = useServerFn(moderateSong);
  const del = useServerFn(deleteSong);

  const [subTab, setSubTab] = useState<"pending" | "all">("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [songToDelete, setSongToDelete] = useState<{ id: string; title: string; artistName?: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const pendingQ = useQuery({
    queryKey: ["pending-songs"],
    queryFn: () => listPending(),
    retry: false,
  });

  const allSongsQ = useQuery({
    queryKey: ["all-platform-songs", statusFilter, searchTerm],
    queryFn: () => listAll({ data: { status: statusFilter, search: searchTerm } }),
    enabled: subTab === "all",
    retry: false,
  });

  const modMutation = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      toast.success(`Song ${variables.data.status} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-songs"] });
      qc.invalidateQueries({ queryKey: ["pending-songs-count"] });
      qc.invalidateQueries({ queryKey: ["all-platform-songs"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: del,
    onSuccess: (res) => {
      toast.success(`Song "${res.title}" deleted from platform`);
      setSongToDelete(null);
      setDeleteReason("");
      qc.invalidateQueries({ queryKey: ["pending-songs"] });
      qc.invalidateQueries({ queryKey: ["pending-songs-count"] });
      qc.invalidateQueries({ queryKey: ["all-platform-songs"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error) => toast.error(`Delete failed: ${(error as Error).message}`),
  });

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setSubTab("pending")}
            className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              subTab === "pending"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending Approval ({pendingQ.data?.length ?? 0})
          </button>
          <button
            onClick={() => setSubTab("all")}
            className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              subTab === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            All Platform Songs
          </button>
        </div>

        {subTab === "all" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search song title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-secondary border border-border text-xs w-48 sm:w-60 focus:outline-none focus:border-primary"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-foreground cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="taken_down">Taken Down</option>
            </select>
          </div>
        )}
      </div>

      {/* View: Pending Songs */}
      {subTab === "pending" && (
        <div className="space-y-4">
          {pendingQ.isLoading && <div className="text-muted-foreground text-sm">Loading pending songs…</div>}
          {pendingQ.error && <div className="text-destructive text-sm">Error: {(pendingQ.error as Error).message}</div>}

          {!pendingQ.isLoading && (!pendingQ.data || pendingQ.data.length === 0) ? (
            <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="text-muted-foreground text-sm">No songs awaiting moderation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{pendingQ.data?.length} song(s) waiting for approval</p>
              {(pendingQ.data ?? []).map((s: any) => (
                <div
                  key={s.id}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{s.title}</p>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                        <Clock className="size-3" /> Pending Review
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Artist: <span className="font-medium text-foreground">{s.artist?.name ?? "Unknown"}</span>
                      {s.genre ? ` • ${s.genre}` : ""}
                      {s.created_at ? ` • Uploaded ${new Date(s.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={modMutation.isPending || deleteMutation.isPending}
                      onClick={() => modMutation.mutate({ data: { id: s.id, status: "approved" } })}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-semibold"
                    >
                      <Check className="size-3" /> Approve
                    </button>
                    <button
                      disabled={modMutation.isPending || deleteMutation.isPending}
                      onClick={() => modMutation.mutate({ data: { id: s.id, status: "rejected" } })}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25 transition-colors font-semibold"
                    >
                      <X className="size-3" /> Reject
                    </button>
                    <button
                      disabled={modMutation.isPending || deleteMutation.isPending}
                      onClick={() => setSongToDelete({ id: s.id, title: s.title, artistName: s.artist?.name })}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      title="Permanently Delete Song"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View: All Platform Songs */}
      {subTab === "all" && (
        <div className="space-y-4">
          {allSongsQ.isLoading && <div className="text-muted-foreground text-sm">Loading songs across platform…</div>}
          {allSongsQ.error && <div className="text-destructive text-sm">Error: {(allSongsQ.error as Error).message}</div>}

          {!allSongsQ.isLoading && (!allSongsQ.data || allSongsQ.data.length === 0) ? (
            <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
              <Music className="size-5 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No songs match the current search or filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Showing {allSongsQ.data?.length} song(s) on platform</p>
              {(allSongsQ.data ?? []).map((s: any) => {
                const isPending = s.status === "pending";
                const isApproved = s.status === "approved";
                const isRejected = s.status === "rejected";
                const isTakenDown = s.status === "taken_down";

                return (
                  <div
                    key={s.id}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm truncate">{s.title}</p>
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="size-3" /> Approved
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                            <Clock className="size-3" /> Pending
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="size-3" /> Rejected
                          </span>
                        )}
                        {isTakenDown && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                            Taken Down
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Artist: <span className="font-medium text-foreground">{s.artist?.name ?? "Unknown"}</span>
                        {s.genre ? ` • ${s.genre}` : ""}
                        {s.price !== undefined ? ` • K${Number(s.price).toFixed(2)}` : ""}
                        {s.play_count !== undefined ? ` • ${s.play_count.toLocaleString()} plays` : ""}
                        {s.created_at ? ` • ${new Date(s.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isApproved && (
                        <button
                          disabled={modMutation.isPending || deleteMutation.isPending}
                          onClick={() => modMutation.mutate({ data: { id: s.id, status: "approved" } })}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-medium"
                        >
                          <Check className="size-3" /> Approve
                        </button>
                      )}
                      {isApproved && (
                        <button
                          disabled={modMutation.isPending || deleteMutation.isPending}
                          onClick={() => modMutation.mutate({ data: { id: s.id, status: "taken_down" } })}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground cursor-pointer transition-colors font-medium"
                          title="Take down song from active catalog"
                        >
                          Take Down
                        </button>
                      )}
                      <button
                        disabled={modMutation.isPending || deleteMutation.isPending}
                        onClick={() => setSongToDelete({ id: s.id, title: s.title, artistName: s.artist?.name })}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 cursor-pointer transition-colors font-semibold"
                        title="Permanently Delete Song (Enforce Terms)"
                      >
                        <Trash2 className="size-3" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin Delete Confirmation Modal */}
      {songToDelete && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" />
                <h3 className="font-semibold text-lg text-foreground">Admin Delete Song</h3>
              </div>
              <button
                onClick={() => {
                  setSongToDelete(null);
                  setDeleteReason("");
                }}
                className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">"{songToDelete.title}"</strong>
              {songToDelete.artistName ? ` by ${songToDelete.artistName}` : ""}?
            </p>

            <p className="text-xs text-muted-foreground bg-destructive/10 border border-destructive/20 rounded-xl p-3">
              ⚠️ This will permanently remove the audio file, playlists references, and album associations to keep the webapp compliant with terms and conditions.
            </p>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Reason for deletion (optional, logged in audit trail):
              </label>
              <input
                type="text"
                placeholder="e.g. Terms & conditions violation, copyright issue"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-xs focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSongToDelete(null);
                  setDeleteReason("");
                }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 rounded-full bg-secondary border border-border text-sm font-medium hover:bg-accent cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ data: { id: songToDelete.id, reason: deleteReason.trim() || undefined } })}
                className="px-4 py-2 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deleteMutation.isPending ? "Deleting…" : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Artists moderation (applications only)
// ─────────────────────────────────────────────────────────────
function ArtistMod() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingArtists);
  const mod = useServerFn(moderateArtist);

  const { data: pendingArtists, isLoading, error } = useQuery({
    queryKey: ["pending-artists"],
    queryFn: () => list(),
    retry: false,
  });

  const m = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      toast.success(`Artist application ${variables.data.status === "approved" ? "approved" : "rejected"} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-artists"] });
      qc.invalidateQueries({ queryKey: ["pending-artists-count"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading artists…</div>;
  if (error) return <div className="text-destructive">Error loading artists: {(error as Error).message}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Pending Artist Applications</h2>
      {!pendingArtists || pendingArtists.length === 0 ? (
        <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="text-muted-foreground text-sm">No artist applications awaiting review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{pendingArtists.length} application(s) pending</p>
          {pendingArtists.map((a: any) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.genre ?? "No genre"}</p>
                  {a.bio && <p className="text-sm mt-2 text-muted-foreground max-w-2xl">{a.bio}</p>}
                  <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Clock className="size-3" /> Applied {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button
                    disabled={m.isPending}
                    onClick={() => m.mutate({ data: { id: a.id, status: "approved", verified: false } })}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-semibold"
                  >
                    <Check className="size-3" /> Approve
                  </button>
                  <button
                    disabled={m.isPending}
                    onClick={() => m.mutate({ data: { id: a.id, status: "rejected" } })}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25 transition-colors font-semibold"
                  >
                    <X className="size-3" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Verifications moderation (dedicated tab)
// ─────────────────────────────────────────────────────────────
function VerificationMod() {
  const qc = useQueryClient();
  const listVerifs = useServerFn(listPendingVerifications);
  const modVerif = useServerFn(moderateArtistVerification);
  const verificationConfigFn = useServerFn(getVerificationConfig);

  const { data: pendingVerifications, isLoading, error } = useQuery({
    queryKey: ["pending-verifications"],
    queryFn: () => listVerifs(),
    retry: false,
  });

  const { data: verificationConfig } = useQuery({
    queryKey: ["verification-config"],
    queryFn: () => verificationConfigFn(),
    retry: false,
  });

  const mVerif = useMutation({
    mutationFn: modVerif,
    onSuccess: (_, variables) => {
      toast.success(`Artist verification ${variables.data.decision === "approve" ? "approved" : "rejected"}`);
      qc.invalidateQueries({ queryKey: ["pending-verifications"] });
      qc.invalidateQueries({ queryKey: ["pending-verifications-count"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading verifications…</div>;
  if (error) return <div className="text-destructive">Error loading verifications: {(error as Error).message}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Artist Verification Requests</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Artists must have ≥{verificationConfig?.min_followers ?? 100} followers and &gt;K{verificationConfig?.min_earnings ?? 500} in earnings to apply for verification.
          Once approved, they receive the verified badge on their profile.
        </p>
      </div>

      {!pendingVerifications || pendingVerifications.length === 0 ? (
        <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="text-muted-foreground text-sm">No verification requests awaiting review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{pendingVerifications.length} request(s) pending</p>
          {pendingVerifications.map((a: any) => (
            <div
              key={a.id}
              className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.genre ?? "—"}</p>
                <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500 mt-1">
                  <Clock className="size-3" /> Requested {new Date(a.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  disabled={mVerif.isPending}
                  onClick={() => mVerif.mutate({ data: { id: a.id, decision: "approve" } })}
                  className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold cursor-pointer hover:brightness-110 transition-all"
                >
                  <Check className="size-3" /> Grant Verification
                </button>
                <button
                  disabled={mVerif.isPending}
                  onClick={() => mVerif.mutate({ data: { id: a.id, decision: "reject" } })}
                  className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full bg-destructive/15 text-destructive font-semibold cursor-pointer hover:bg-destructive/25 transition-all"
                >
                  <X className="size-3" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Labels moderation
// ─────────────────────────────────────────────────────────────
function LabelMod() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingLabels);
  const modFn = useServerFn(moderateLabel);
  const { data, isLoading, error } = useQuery({
    queryKey: ["pending-labels"],
    queryFn: () => listFn(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: modFn,
    onSuccess: (_, variables) => {
      toast.success(`Label ${variables.data.status === "approved" ? "approved" : "rejected"} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-labels"] });
      qc.invalidateQueries({ queryKey: ["pending-labels-count"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading labels…</div>;
  if (error) return <div className="text-destructive">Error loading labels: {(error as Error).message}</div>;
  if (!data || data.length === 0)
    return (
      <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
        <CheckCircle2 className="size-5 text-primary" />
        <p className="text-muted-foreground">No label applications.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">{data.length} label application(s) pending</p>
      {data.map((l: any) => (
        <div
          key={l.id}
          className="bg-card border border-border rounded-xl p-4 flex justify-between items-start gap-4"
        >
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="size-4" />
              <p className="font-medium">{l.name}</p>
            </div>
            <p className="text-xs text-muted-foreground">{l.contact_email ?? "—"}</p>
            {l.bio && <p className="text-sm mt-2 text-muted-foreground max-w-2xl">{l.bio}</p>}
            <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
              <Clock className="size-3" /> Applied {new Date(l.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: l.id, status: "approved" } })}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-semibold"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: l.id, status: "rejected" } })}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25 transition-colors font-semibold"
            >
              <X className="size-3" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Payout moderation
// ─────────────────────────────────────────────────────────────
function PayoutMod() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPayoutsForStaff);
  const reviewFn = useServerFn(reviewPayout);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-payouts"],
    queryFn: () => listFn(),
    retry: false,
  });
  const review = useMutation({
    mutationFn: reviewFn,
    onSuccess: (_, variables) => {
      toast.success(`Payout ${variables.data.decision}.`);
      qc.invalidateQueries({ queryKey: ["staff-payouts"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err) => toast.error(`Payout review failed: ${(err as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading payout requests…</div>;
  if (error) return <div className="text-destructive">Error loading payouts: {(error as Error).message}</div>;

  const payouts = data ?? [];
  const pending = payouts.filter((p: any) => p.status === "pending");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Payout requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review completed-sale earnings before sending funds. Approving a request records the
          review; it does not initiate a bank or mobile-money transfer.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="text-sm text-muted-foreground">No payout requests await review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((p: any) => {
            const payee = p.label?.name ? `Label: ${p.label.name}` : `Artist: ${p.artist?.name ?? "Unknown"}`;
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{payee}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      ZMW {Number(p.amount).toFixed(2)} · {p.method_code} · requested {new Date(p.requested_at).toLocaleString()}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">Destination: {p.destination}</p>
                  </div>
                  <span className="w-fit rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-semibold text-yellow-500">
                    Pending review
                  </span>
                </div>
                <label className="mt-4 block text-xs font-medium text-muted-foreground">
                  Review note (optional)
                  <input
                    value={notes[p.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [p.id]: event.target.value }))}
                    maxLength={1000}
                    placeholder="Visible in the audit trail"
                    className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={review.isPending}
                    onClick={() => review.mutate({ data: { id: p.id, decision: "approved", notes: notes[p.id] } })}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    <Check className="size-3" /> Approve review
                  </button>
                  <button
                    disabled={review.isPending}
                    onClick={() => review.mutate({ data: { id: p.id, decision: "rejected", notes: notes[p.id] } })}
                    className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                  >
                    <X className="size-3" /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {payouts.filter((p: any) => p.status !== "pending").length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Reviewed requests</div>
          <div className="divide-y divide-border">
            {payouts
              .filter((p: any) => p.status !== "pending")
              .map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <span>{p.label?.name ?? p.artist?.name ?? "Unknown payee"}</span>
                  <span className="text-muted-foreground">ZMW {Number(p.amount).toFixed(2)}</span>
                  <span className="capitalize text-muted-foreground">{p.status}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Diagnostics
// ─────────────────────────────────────────────────────────────
function Diagnostics() {
  const diagFn = useServerFn(getArtistDiagnostics);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["artist-diagnostics"],
    queryFn: () => diagFn(),
    retry: false,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading diagnostics…</div>;
  if (error) return <div className="text-destructive">Error loading diagnostics: {(error as Error).message}</div>;
  if (!data) return <div className="text-muted-foreground">No diagnostic data available.</div>;

  const { info, report } = data;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Artist Status Overview</h2>
          <button
            onClick={() => refetch()}
            className="text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-accent rounded-xl p-4">
            <p className="text-2xl font-bold">{info.summary.totalArtists}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Artists</p>
          </div>
          <div className="bg-accent rounded-xl p-4">
            <p className="text-2xl font-bold text-green-500">{info.summary.visibleOnArtistsPage}</p>
            <p className="text-xs text-muted-foreground mt-1">Visible on /artists</p>
          </div>
          <div className="bg-accent rounded-xl p-4">
            <p className="text-2xl font-bold text-yellow-500">{info.summary.awaitingApproval}</p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting Approval</p>
          </div>
          <div className="bg-accent rounded-xl p-4">
            <p className="text-2xl font-bold text-red-500">{info.summary.rejected}</p>
            <p className="text-xs text-muted-foreground mt-1">Rejected</p>
          </div>
        </div>

        <div className="bg-accent rounded-xl p-4">
          <h3 className="font-semibold mb-3 text-sm">Detailed Report</h3>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {report}
          </pre>
        </div>
      </div>

      {info.summary.awaitingApproval > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="size-4" />
            Action Required
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            You have {info.summary.awaitingApproval} artist application(s) waiting for review.
          </p>
          <button
            onClick={() => {
              const el = document.querySelector('[data-tab="artists"]') as HTMLButtonElement;
              if (el) el.click();
            }}
            className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Go to Artists Tab
          </button>
        </div>
      )}

      {info.dataIntegrity.approvedArtistsWithoutRole.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Shield className="size-4" />
            Data Integrity Issue
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {info.dataIntegrity.approvedArtistsWithoutRole.length} approved artist(s) are missing the &apos;artist&apos; role.
          </p>
          <div className="text-xs space-y-2">
            {info.dataIntegrity.approvedArtistsWithoutRole.map((artist) => (
              <div key={artist.id} className="bg-card p-2 rounded">
                {artist.name} (ID: {artist.id})
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            To fix: Re-approve these artists via the Artists tab.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Payments — transactions that never reached a final outcome
// ─────────────────────────────────────────────────────────────
function PaymentsMod() {
  const qc = useQueryClient();
  const listFn = useServerFn(listStuckTransactions);
  const recheckFn = useServerFn(reconcileTransaction);
  const recheckAllFn = useServerFn(reconcileAllTransactions);
  const cancelFn = useServerFn(cancelStuckTransaction);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stuck-transactions"],
    queryFn: () => listFn(),
    retry: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["stuck-transactions"] });

  const recheckM = useMutation({
    mutationFn: (id: string) => recheckFn({ data: { transactionId: id } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "completed"
          ? "Payment confirmed and the buyer now has access."
          : r.status === "failed"
            ? "Provider reports this payment failed."
            : "Still waiting on the customer to approve.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recheckAllM = useMutation({
    mutationFn: () => recheckAllFn({}),
    onSuccess: (r) => {
      toast.success(
        `Checked ${r.checked}: ${r.completed} confirmed, ${r.failed} failed, ${r.stillPending} still waiting.`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { transactionId: id } }),
    onSuccess: () => {
      toast.success("Marked as abandoned.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading payments…</div>;
  if (error) return <div className="text-destructive">Error loading payments: {(error as Error).message}</div>;

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Unfinished payments</h2>
          <p className="text-sm text-muted-foreground">
            Payments that never reached a final outcome. Re-check asks the payment provider what really happened.
          </p>
        </div>
        <button
          onClick={() => recheckAllM.mutate()}
          disabled={recheckAllM.isPending || rows.length === 0}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <CreditCard className="size-4" />
          {recheckAllM.isPending ? "Checking…" : "Re-check all"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          No unfinished payments. Everything has settled.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <div
              key={t.id}
              className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {t.currency} {t.amount.toFixed(2)}{" "}
                  <span className="text-xs font-normal text-muted-foreground uppercase">
                    {t.method_code.replace(/_/g, " ")}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.item_type} · {t.phone ?? t.buyer_email ?? "no contact"} ·{" "}
                  {new Date(t.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400">
                  {t.status.replace(/_/g, " ")}
                </span>
                <button
                  onClick={() => recheckM.mutate(t.id)}
                  disabled={recheckM.isPending}
                  className="text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50"
                >
                  Re-check
                </button>
                <button
                  onClick={() => cancelM.mutate(t.id)}
                  disabled={cancelM.isPending}
                  className="text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50"
                >
                  Mark abandoned
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
