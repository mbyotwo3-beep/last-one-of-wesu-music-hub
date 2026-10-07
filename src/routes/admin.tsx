import { createFileRoute } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import { friendlyError } from "@/lib/friendly-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  Music,
  Shield,
  Check,
  X,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  TrendingUp,
  CreditCard,
  Trash2,
  Search,
  Play,
  Pause,
  Ban,
  RotateCcw,
  ChevronRight,
  DollarSign,
  Wallet,
  ArrowLeft,
  BadgeCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import { usePlayer } from "@/stores/player";
import {
  getPlatformStats,
  getRecentActivity,
  listPendingSongs,
  listAllSongsAdmin,
  deleteSong,
  moderateSong,
  listPendingAlbums,
  listAllAlbumsAdmin,
  moderateAlbum,
  listEditorialPlaylists,
  listApprovedSongsForCuration,
  createEditorialPlaylist,
  addSongsToEditorialPlaylist,
  removeSongFromEditorialPlaylist,
  setPlaylistPublished,
  deleteEditorialPlaylist,
  listPendingArtists,
  listAllArtists,
  moderateArtist,
  suspendArtist,
  unsuspendArtist,
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
import { markTransactionPaid } from "@/lib/superadmin.functions";
import { useUserRoles } from "@/hooks/use-roles";
import { deleteAlbum } from "@/lib/artist.functions";
import { listSupportMessages, resolveSupportMessage } from "@/lib/contact.functions";
import { getPlatformAnalytics } from "@/lib/analytics.functions";
import { getVerificationConfig } from "@/lib/pricing.functions";
import { CarouselBuilder } from "@/components/CarouselBuilder";
import { HeroCarouselBuilder } from "@/components/HeroCarouselBuilder";
import { AnalyticsSection } from "@/components/AnalyticsSection";
import { MediaGallery } from "@/components/MediaGallery";
import { AdminFinancials } from "@/components/AdminFinancials";
import { getArtistFinancialsById } from "@/lib/financials.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Panel — Wesu+" }] }),
  component: () => (
    <RoleGate require="admin">
      <AdminRoute />
    </RoleGate>
  ),
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function AdminRoute() {
  return <AdminPage />;
}

type Tab =
  | "overview"
  | "songs"
  | "albums"
  | "playlists"
  | "artists"
  | "verifications"
  | "labels"
  | "payouts"
  | "payments"
  | "financials"
  | "support"
  | "carousels"
  | "hero-carousel"
  | "media-gallery"
  | "diagnostics";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");

  const listSongsFn = useServerFn(listPendingSongs);
  const listAlbumsFn = useServerFn(listPendingAlbums);
  const listArtistsFn = useServerFn(listPendingArtists);
  const listVerifsFn = useServerFn(listPendingVerifications);
  const listLabelsFn = useServerFn(listPendingLabels);

  const pendingSongsQ = useQuery({
    queryKey: ["pending-songs-count"],
    queryFn: () => listSongsFn(),
    retry: 1,
  });
  const pendingArtistsQ = useQuery({
    queryKey: ["pending-artists-count"],
    queryFn: () => listArtistsFn(),
    retry: 1,
  });
  const pendingVerifsQ = useQuery({
    queryKey: ["pending-verifications-count"],
    queryFn: () => listVerifsFn(),
    retry: 1,
  });
  const pendingLabelsQ = useQuery({
    queryKey: ["pending-labels-count"],
    queryFn: () => listLabelsFn(),
    retry: 1,
  });
  const pendingAlbumsQ = useQuery({
    queryKey: ["pending-albums-count"],
    queryFn: () => listAlbumsFn(),
    retry: 1,
  });
  const supportListFn = useServerFn(listSupportMessages);
  const openSupportQ = useQuery({
    queryKey: ["support-open-count"],
    queryFn: () => supportListFn(),
    retry: 1,
  });

  // Per-badge errors must never blank the whole panel: a single failing
  // count degrades to no badge (and a console entry) instead of locking
  // staff out of every tab.
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "songs", label: "Songs", badge: pendingSongsQ.data?.length },
    { id: "albums", label: "Albums", badge: pendingAlbumsQ.data?.length },
    { id: "playlists", label: "Editorial Playlists" },
    { id: "artists", label: "Artists", badge: pendingArtistsQ.data?.length },
    { id: "verifications", label: "Verifications", badge: pendingVerifsQ.data?.length },
    { id: "labels", label: "Labels", badge: pendingLabelsQ.data?.length },
    { id: "payouts", label: "Payouts" },
    { id: "payments", label: "Transaction Reconciliation" },
    { id: "financials", label: "💰 Financial Analytics" },
    {
      id: "support",
      label: "Support",
      badge: openSupportQ.data?.filter((m: any) => m.status === "open").length || undefined,
    },
    { id: "carousels", label: "Carousels" },
    { id: "hero-carousel", label: "Hero Carousel" },
    { id: "media-gallery", label: "Media Gallery" },
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
        {tab === "albums" && <AlbumMod />}
        {tab === "playlists" && <EditorialPlaylistsTab />}
        {tab === "artists" && <ArtistMod />}
        {tab === "verifications" && <VerificationMod />}
        {tab === "labels" && <LabelMod />}
        {tab === "payouts" && <PayoutMod />}
        {tab === "payments" && <PaymentsMod />}
        {tab === "financials" && <AdminFinancials />}
        {tab === "support" && <SupportMod />}
        {tab === "carousels" && <CarouselBuilder />}
        {tab === "hero-carousel" && <HeroCarouselBuilder />}
        {tab === "media-gallery" && <MediaGallery />}
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
  const activityQ = useQuery({
    queryKey: ["admin-activity"],
    queryFn: () => activityFn(),
    retry: 1,
  });
  const analyticsQ = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => analyticsFn(),
    retry: 1,
    staleTime: 60_000,
  });

  if (statsQ.isLoading) return <div className="text-muted-foreground">Loading metrics…</div>;
  if (statsQ.error)
    return (
      <div className="text-destructive">Error loading stats: {(statsQ.error as Error).message}</div>
    );
  if (activityQ.error)
    return (
      <div className="text-destructive">
        Error loading activity: {(activityQ.error as Error).message}
      </div>
    );

  const d = statsQ.data;

  const metricCards = d
    ? [
        {
          label: "Total Users",
          value: d.totalUsers.toLocaleString(),
          icon: Users,
          color: "text-blue-400",
        },
        {
          label: "Total Artists",
          value: (d as any).totalArtists?.toLocaleString() ?? "0",
          icon: Music,
          color: "text-purple-400",
        },
        {
          label: "Total Songs",
          value: d.totalSongs.toLocaleString(),
          icon: Music,
          color: "text-rose-400",
        },
        {
          label: "Completed purchases (30d)",
          value: d.completedPurchases30d.toLocaleString(),
          icon: CreditCard,
          color: "text-yellow-400",
        },
        {
          label: "Revenue (30 days)",
          value: `ZMW ${d.monthlyRevenueZmw.toFixed(2)}`,
          icon: TrendingUp,
          color: "text-primary",
        },
      ]
    : [];

  const pendingItems = [
    { label: "Songs awaiting approval", count: pendingSongs, tab: "songs" as Tab, icon: Music },
    { label: "Artist applications", count: pendingArtists, tab: "artists" as Tab, icon: Users },
    {
      label: "Verification requests",
      count: pendingVerifs,
      tab: "verifications" as Tab,
      icon: CheckCircle2,
    },
    { label: "Label applications", count: pendingLabels, tab: "labels" as Tab, icon: Building2 },
  ].filter((i) => i.count > 0);

  return (
    <div className="space-y-8">
      {/* Live metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metricCards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-2xl p-5">
            <c.icon className={`size-5 mb-3 ${c.color}`} />
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <AnalyticsSection
        data={analyticsQ.data}
        scope="platform"
        title="Platform listening analytics"
      />

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
                <li
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-accent/50"
                >
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
// Albums moderation (pending approvals + delete)
// ─────────────────────────────────────────────────────────────
function AlbumMod() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingAlbums);
  const listAllFn = useServerFn(listAllAlbumsAdmin);
  const modFn = useServerFn(moderateAlbum);
  const delFn = useServerFn(deleteAlbum);

  // "Pending" only ever listed albums awaiting approval. Deleting something
  // that breached the terms means deleting something ALREADY published, and
  // that had no list at all.
  const [subTab, setSubTab] = useState<"pending" | "all">("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const pendingQ = useQuery({
    queryKey: ["pending-albums"],
    queryFn: () => listFn(),
    retry: false,
  });

  const allQ = useQuery({
    queryKey: ["all-platform-albums", statusFilter, searchTerm],
    queryFn: () => listAllFn({ data: { status: statusFilter, search: searchTerm } }),
    retry: false,
    enabled: subTab === "all",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pending-albums"] });
    qc.invalidateQueries({ queryKey: ["all-platform-albums"] });
    qc.invalidateQueries({ queryKey: ["pending-albums-count"] });
    qc.invalidateQueries({ queryKey: ["home-discover"] });
    qc.invalidateQueries({ queryKey: ["albums"] });
    qc.invalidateQueries({ queryKey: ["recent-albums"] });
  };

  const modMutation = useMutation({
    mutationFn: modFn,
    onSuccess: (res: any, variables) => {
      // Approving a release now publishes its tracks too — say so, otherwise
      // it looks like nothing happened to the 12 songs.
      const extra =
        variables.data.status === "approved" && res?.songsApproved
          ? ` (${res.songsApproved} track(s) published)`
          : "";
      toast.success(`Album ${variables.data.status} successfully${extra}`);
      invalidate();
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const delMutation = useMutation({
    mutationFn: delFn,
    onSuccess: (res: any) => {
      const files = res?.media?.length ?? 0;
      const failed = res?.media_failures ?? [];
      toast.success(
        `Album "${res.title}" deleted with ${res?.deletedSongs ?? 0} track(s) and ${files} file(s)`,
      );
      if (failed.length) {
        toast.error(`Still on storage, remove manually in Media Gallery:` + failed.join(", "));
      }
      qc.invalidateQueries({ queryKey: ["storage-files"] });
      qc.invalidateQueries({ queryKey: ["recent-albums"] });
      invalidate();
    },
    onError: (error) => toast.error(`Delete failed: ${(error as Error).message}`),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Albums moderation</h2>

      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("pending")}
          className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            subTab === "pending"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Awaiting Approval ({pendingQ.data?.length ?? 0})
        </button>
        <button
          onClick={() => setSubTab("all")}
          className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            subTab === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All Platform Albums
        </button>
      </div>

      {subTab === "all" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search album title..."
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
            <option value="draft">Draft</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      )}
      {subTab === "all" ? (
        <>
          {allQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading albums…</p>
          ) : (allQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No albums match.</p>
          ) : (
            <div className="space-y-2">
              {(allQ.data ?? []).map((a: any) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-card border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.artist?.name ?? "Unknown"} • {a.track_count ?? 0} track
                      {a.track_count === 1 ? "" : "s"}
                      {a.price != null && Number(a.price) > 0 ? ` • K${Number(a.price)}` : ""}
                      {" • "}
                      <span className="font-semibold">{a.status}</span>
                    </p>
                  </div>
                  <button
                    disabled={modMutation.isPending}
                    onClick={() =>
                      modMutation.mutate({
                        data: {
                          id: a.id,
                          status: a.status === "approved" ? "taken_down" : "approved",
                        },
                      })
                    }
                    className="px-3 py-1.5 rounded-full bg-secondary text-xs font-semibold disabled:opacity-50"
                  >
                    {a.status === "approved" ? "Take down" : "Approve"}
                  </button>
                  <button
                    disabled={delMutation.isPending}
                    onClick={() => {
                      const n = a.track_count ?? 0;
                      if (
                        window.confirm(
                          `Permanently delete "${a.title}"?` +
                            (n
                              ? `\n\nThis also deletes all ${n} track(s), their audio files and cover photos. This cannot be undone.`
                              : "\n\nThis cannot be undone."),
                        )
                      ) {
                        delMutation.mutate({ data: { id: a.id } });
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold disabled:opacity-50"
                  >
                    <Trash2 className="size-3" /> Delete permanently
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {pendingQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {pendingQ.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No albums awaiting approval.</p>
          )}
          {(() => {
            // Lead with the albums whose tracks are ALREADY live but which the
            // album is still unpublished — those are invisible to every listener
            // and were previously impossible to approve from here.
            const rows = (pendingQ.data ?? []) as any[];
            const stranded = rows.filter((a) => a.stranded);
            const rest = rows.filter((a) => !a.stranded);
            const renderRow = (a: any) => (
              <div
                key={a.id}
                className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${
                  a.stranded ? "bg-amber-500/5 border-amber-500/30" : "bg-card border-border"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.artist?.name ?? "Unknown"} {a.price != null ? `• K${Number(a.price)}` : ""}
                    {a.track_total ? (
                      <>
                        {" • "}
                        {a.track_approved}/{a.track_total} tracks live
                      </>
                    ) : null}
                  </p>
                  {/* A draft album was excluded from this queue entirely, so a
                  finished release could never be approved — say what state it
                  is in and that Approve publishes the whole album. */}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    status: <span className="font-semibold">{a.status}</span>
                    {a.status === "draft"
                      ? " — never submitted for review, but its tracks are already live. Approve to publish the album."
                      : a.stranded
                        ? " — tracks are live but the album is not, so nobody can open or buy it. Approve to fix."
                        : ""}
                  </p>
                </div>
                <button
                  onClick={() => modMutation.mutate({ data: { id: a.id, status: "approved" } })}
                  disabled={modMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Check className="size-3" /> Approve
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(`Reject album "${a.title}"? The artist will need to resubmit.`)
                    ) {
                      modMutation.mutate({ data: { id: a.id, status: "rejected" } });
                    }
                  }}
                  disabled={modMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <X className="size-3" /> Reject
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete album "${a.title}" and all its songs?`)) {
                      delMutation.mutate({ data: { id: a.id } });
                    }
                  }}
                  disabled={delMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="size-3" /> Delete
                </button>
              </div>
            );
            return (
              <div key="groups" className="space-y-4">
                {stranded.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-500">
                      Stranded — tracks are live but the album is not. Nobody can open or buy these.
                    </p>
                    {stranded.map(renderRow)}
                  </div>
                )}
                {rest.length > 0 && (
                  <div className="space-y-2">
                    {stranded.length > 0 && (
                      <p className="text-xs font-semibold text-muted-foreground">Awaiting review</p>
                    )}
                    {rest.map(renderRow)}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Editorial playlists: the only way a public playlist can exist.
//
// Listeners cannot publish one (RLS requires is_staff), so without this tab
// the public playlist surface was permanently empty. Create, fill from the
// approved catalogue, publish, unpublish.
// ─────────────────────────────────────────────────────────────
function EditorialPlaylistsTab() {
  const qc = useQueryClient();
  const toast_ = toast;
  const listFn = useServerFn(listEditorialPlaylists);
  const songsFn = useServerFn(listApprovedSongsForCuration);
  const createPlaylistFn = useServerFn(createEditorialPlaylist);
  const addSongsFn = useServerFn(addSongsToEditorialPlaylist);
  const removeSongFn = useServerFn(removeSongFromEditorialPlaylist);
  const publishFn = useServerFn(setPlaylistPublished);
  const deleteFn = useServerFn(deleteEditorialPlaylist);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [songSearch, setSongSearch] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["editorial-playlists"] });
    qc.invalidateQueries({ queryKey: ["editorial-playlists-count"] });
    // Public shelves cache playlists; drop them so a new list shows up.
    qc.invalidateQueries({ queryKey: ["browse-playlists"] });
    qc.invalidateQueries({ queryKey: ["home-discover"] });
    qc.invalidateQueries({ queryKey: ["editorial-playlists"] });
  };

  const listsQ = useQuery({
    queryKey: ["editorial-playlists"],
    queryFn: () => listFn(),
    retry: 1,
  });
  const songsQ = useQuery({
    queryKey: ["curation-songs"],
    queryFn: () => songsFn(),
    retry: 1,
    staleTime: 60_000,
  });

  const createM = useMutation({
    mutationFn: createPlaylistFn,
    onSuccess: (res: any) => {
      invalidate();
      setName("");
      setDescription("");
      toast_.success(
        res?.track_count
          ? `Playlist published with ${res.track_count} track(s)`
          : "Playlist created and published — add some songs",
      );
    },
    onError: (e) => toast_.error(friendlyError(e, "Could not create the playlist")),
  });

  const addM = useMutation({
    mutationFn: addSongsFn,
    onSuccess: (res: any) => {
      invalidate();
      if (res?.added) toast_.success(`Added ${res.added} track(s)`);
      else toast_.info("Those tracks are already in this playlist");
    },
    onError: (e) => toast_.error(friendlyError(e, "Could not add tracks")),
  });

  const removeM = useMutation({
    mutationFn: removeSongFn,
    onSuccess: () => invalidate(),
    onError: (e) => toast_.error(friendlyError(e, "Could not remove the track")),
  });

  const publishM = useMutation({
    mutationFn: publishFn,
    onSuccess: (_r: any, v: any) => {
      invalidate();
      toast_.success(v.data.is_public ? "Published" : "Hidden from listeners");
    },
    onError: (e) => toast_.error(friendlyError(e, "Could not change visibility")),
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      invalidate();
      toast_.success("Playlist deleted");
    },
    onError: (e) => toast_.error(friendlyError(e, "Could not delete the playlist")),
  });

  const rows = (listsQ.data ?? []) as any[];
  const active = rows.find((r) => r.id === pickerFor) ?? null;
  const approved = (songsQ.data ?? []) as any[];
  const inActive = new Set<string>(active?.song_ids ?? []);
  const visibleSongs = approved
    .filter((s) => !inActive.has(s.id))
    .filter((s) =>
      songSearch.trim()
        ? `${s.title} ${s.artist?.name ?? ""}`
            .toLowerCase()
            .includes(songSearch.trim().toLowerCase())
        : true,
    )
    .slice(0, 40);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold">Create an editorial playlist</h3>
        <p className="text-xs text-muted-foreground">
          Published playlists appear on the homepage shelf, in Browse, and at /playlists for
          everyone — signed in or not. Listeners cannot publish their own.
        </p>
        <input
          placeholder="Playlist name"
          maxLength={120}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Description (optional)"
          maxLength={200}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          disabled={createM.isPending || !name.trim()}
          onClick={() => createM.mutate({ data: { name, description } })}
          className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {createM.isPending ? "Creating…" : "Create & publish"}
        </button>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Your editorial playlists ({rows.length})</h3>
        {listsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!listsQ.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None yet. Create one above — this is the only way a public playlist can exist.
          </p>
        )}
        <div className="space-y-3">
          {rows.map((pl) => (
            <div key={pl.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{pl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pl.track_count} track{pl.track_count === 1 ? "" : "s"} •{" "}
                    {pl.is_public ? (
                      <span className="text-primary font-medium">Published</span>
                    ) : (
                      <span className="text-amber-500 font-medium">Hidden</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setPickerFor(pickerFor === pl.id ? null : pl.id)}
                  className="px-3 py-1.5 rounded-full bg-secondary text-xs font-semibold"
                >
                  {pickerFor === pl.id ? "Close" : "Add tracks"}
                </button>
                <button
                  disabled={publishM.isPending}
                  onClick={() =>
                    publishM.mutate({ data: { playlist_id: pl.id, is_public: !pl.is_public } })
                  }
                  className="px-3 py-1.5 rounded-full bg-secondary text-xs font-semibold disabled:opacity-50"
                >
                  {pl.is_public ? "Unpublish" : "Publish"}
                </button>
                <button
                  disabled={deleteM.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${pl.name}" and its ${pl.track_count} track(s)?`)) {
                      deleteM.mutate({ data: { playlist_id: pl.id } });
                    }
                  }}
                  className="px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold disabled:opacity-50"
                >
                  Delete
                </button>
              </div>

              {pickerFor === pl.id && active && (
                <div className="border-t border-border pt-3 space-y-3">
                  <input
                    placeholder="Search approved songs…"
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                    value={songSearch}
                    onChange={(e) => setSongSearch(e.target.value)}
                  />
                  {songsQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading songs…</p>
                  ) : visibleSongs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {approved.length === 0
                        ? "No approved songs yet — approve songs first."
                        : "No matches."}
                    </p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {visibleSongs.map((s) => (
                        <button
                          key={s.id}
                          disabled={addM.isPending}
                          onClick={() =>
                            addM.mutate({ data: { playlist_id: pl.id, song_ids: [s.id] } })
                          }
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/40 text-left disabled:opacity-50 min-h-[44px]"
                        >
                          <span className="text-sm truncate flex-1">{s.title}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[40%]">
                            {s.artist?.name ?? "Unknown"}
                          </span>
                          <Plus className="size-4 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {pl.track_count > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    TRACKS ({pl.track_count})
                  </p>
                  <div className="space-y-1">
                    {approved
                      .filter((s) => (pl.song_ids ?? []).includes(s.id))
                      .map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 p-2 rounded-lg text-sm min-h-[44px]"
                        >
                          <span className="truncate flex-1">{s.title}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[40%]">
                            {s.artist?.name ?? "Unknown"}
                          </span>
                          <button
                            disabled={removeM.isPending}
                            onClick={() =>
                              removeM.mutate({
                                data: { playlist_id: pl.id, song_id: s.id },
                              })
                            }
                            className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            aria-label={`Remove ${s.title} from playlist`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
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
  // Debounced search: one server query per pause, not per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const [songToDelete, setSongToDelete] = useState<{
    id: string;
    title: string;
    artistName?: string;
  } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const player = usePlayer();
  const currentTrackId = player.track?.id;
  const isPlaying = player.playing;

  const handleAudition = (song: any) => {
    if (currentTrackId === song.id) {
      player.togglePlay();
      return;
    }
    player.setQueue(
      [
        {
          id: song.id,
          title: song.title,
          artistName: song.artist?.name ?? "Unknown",
          coverUrl: song.cover_url,
          durationSeconds: song.duration,
          price: song.price,
        },
      ],
      0,
    );
  };

  const pendingQ = useQuery({
    queryKey: ["pending-songs"],
    queryFn: () => listPending(),
    retry: false,
  });

  const allSongsQ = useQuery({
    queryKey: ["all-platform-songs", statusFilter, debouncedSearch],
    queryFn: () => listAll({ data: { status: statusFilter, search: debouncedSearch } }),
    enabled: subTab === "all",
    retry: false,
  });

  const invalidateHomeCaches = () => {
    qc.invalidateQueries({ queryKey: ["home-discover"] });
    qc.invalidateQueries({ queryKey: ["recent-albums"] });
    qc.invalidateQueries({ queryKey: ["active-carousels"] });
    qc.invalidateQueries({ queryKey: ["active-hero-slides"] });
  };

  const modMutation = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      toast.success(`Song ${variables.data.status} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-songs"] });
      qc.invalidateQueries({ queryKey: ["pending-songs-count"] });
      qc.invalidateQueries({ queryKey: ["all-platform-songs"] });
      // Approvals/rejections change public shelves immediately.
      invalidateHomeCaches();
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: del,
    onSuccess: (res: any) => {
      const files = res?.media?.length ?? 0;
      const failed = res?.media_failures ?? [];
      toast.success(
        `Song "${res.title}" deleted — ${files} file(s) removed` +
          (failed.length ? `${failed.length} could NOT be removed` : ""),
      );
      // Never claim the artwork is gone when it isn't: that is the whole point
      // of deleting something for breaching the terms.
      if (failed.length) {
        toast.error(`Still on storage, remove manually in Media Gallery:` + failed.join(", "));
      }
      setSongToDelete(null);
      setDeleteReason("");
      qc.invalidateQueries({ queryKey: ["pending-songs"] });
      qc.invalidateQueries({ queryKey: ["pending-songs-count"] });
      qc.invalidateQueries({ queryKey: ["all-platform-songs"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["storage-files"] });
      invalidateHomeCaches();
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
          {pendingQ.isLoading && (
            <div className="text-muted-foreground text-sm">Loading pending songs…</div>
          )}
          {pendingQ.error && (
            <div className="text-destructive text-sm">
              Error: {(pendingQ.error as Error).message}
            </div>
          )}

          {!pendingQ.isLoading && (!pendingQ.data || pendingQ.data.length === 0) ? (
            <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
              <CheckCircle2 className="size-5 text-primary" />
              <p className="text-muted-foreground text-sm">No songs awaiting moderation.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {pendingQ.data?.length ?? 0} song(s) waiting for approval
              </p>
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
                      Artist:{" "}
                      <span className="font-medium text-foreground">
                        {s.artist?.name ?? "Unknown"}
                      </span>
                      {s.genre ? ` • ${s.genre}` : ""}
                      {s.created_at
                        ? ` • Uploaded ${new Date(s.created_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleAudition(s)}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground cursor-pointer transition-colors font-semibold"
                      title={currentTrackId === s.id && isPlaying ? "Pause" : "Audition"}
                    >
                      {currentTrackId === s.id && isPlaying ? (
                        <Pause className="size-3 text-primary fill-primary" />
                      ) : (
                        <Play className="size-3 text-primary fill-primary ml-0.5" />
                      )}
                      {currentTrackId === s.id && isPlaying ? "Pause" : "Audition"}
                    </button>
                    <button
                      disabled={modMutation.isPending || deleteMutation.isPending}
                      onClick={() => modMutation.mutate({ data: { id: s.id, status: "approved" } })}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-semibold"
                    >
                      <Check className="size-3" /> Approve
                    </button>
                    <button
                      disabled={modMutation.isPending || deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Reject "${s.title}"? The artist will need to fix and resubmit.`,
                          )
                        ) {
                          modMutation.mutate({ data: { id: s.id, status: "rejected" } });
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25 transition-colors font-semibold"
                    >
                      <X className="size-3" /> Reject
                    </button>
                    <button
                      disabled={modMutation.isPending || deleteMutation.isPending}
                      onClick={() =>
                        setSongToDelete({ id: s.id, title: s.title, artistName: s.artist?.name })
                      }
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
          {allSongsQ.isLoading && (
            <div className="text-muted-foreground text-sm">Loading songs across platform…</div>
          )}
          {allSongsQ.error && (
            <div className="text-destructive text-sm">
              Error: {(allSongsQ.error as Error).message}
            </div>
          )}

          {!allSongsQ.isLoading && (!allSongsQ.data || allSongsQ.data.length === 0) ? (
            <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
              <Music className="size-5 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                No songs match the current search or filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Showing {allSongsQ.data?.length} song(s) on platform
              </p>
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
                        Artist:{" "}
                        <span className="font-medium text-foreground">
                          {s.artist?.name ?? "Unknown"}
                        </span>
                        {s.genre ? ` • ${s.genre}` : ""}
                        {s.price !== undefined ? ` • K${Number(s.price).toFixed(2)}` : ""}
                        {s.play_count !== undefined
                          ? ` • ${s.play_count.toLocaleString()} plays`
                          : ""}
                        {s.created_at ? ` • ${new Date(s.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAudition(s)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-foreground hover:bg-accent cursor-pointer transition-colors font-medium"
                        title={currentTrackId === s.id && isPlaying ? "Pause" : "Audition"}
                      >
                        {currentTrackId === s.id && isPlaying ? (
                          <Pause className="size-3 text-primary fill-primary" />
                        ) : (
                          <Play className="size-3 text-primary fill-primary ml-0.5" />
                        )}
                        {currentTrackId === s.id && isPlaying ? "Pause" : "Audition"}
                      </button>
                      {!isApproved && (
                        <button
                          disabled={modMutation.isPending || deleteMutation.isPending}
                          onClick={() =>
                            modMutation.mutate({ data: { id: s.id, status: "approved" } })
                          }
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-medium"
                        >
                          <Check className="size-3" /> Approve
                        </button>
                      )}
                      {isApproved && (
                        <button
                          disabled={modMutation.isPending || deleteMutation.isPending}
                          onClick={() =>
                            modMutation.mutate({ data: { id: s.id, status: "taken_down" } })
                          }
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground cursor-pointer transition-colors font-medium"
                          title="Take down song from active catalog"
                        >
                          Take Down
                        </button>
                      )}
                      <button
                        disabled={modMutation.isPending || deleteMutation.isPending}
                        onClick={() =>
                          setSongToDelete({ id: s.id, title: s.title, artistName: s.artist?.name })
                        }
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
              ⚠️ This will permanently remove the audio file, playlists references, and album
              associations to keep the webapp compliant with terms and conditions.
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
                onClick={() =>
                  deleteMutation.mutate({
                    data: { id: songToDelete.id, reason: deleteReason.trim() || undefined },
                  })
                }
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
// Artists moderation — Pending applications + Full Artist List
// ─────────────────────────────────────────────────────────────
function ArtistMod() {
  const [subTab, setSubTab] = useState<"pending" | "all">("pending");
  const [drillArtistId, setDrillArtistId] = useState<string | null>(null);
  const [drillArtistName, setDrillArtistName] = useState<string>("");

  if (drillArtistId) {
    return (
      <ArtistFinancialDrillDown
        artistId={drillArtistId}
        artistName={drillArtistName}
        onBack={() => setDrillArtistId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-3">
        <button
          onClick={() => setSubTab("pending")}
          className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            subTab === "pending"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending Applications
        </button>
        <button
          onClick={() => setSubTab("all")}
          className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            subTab === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All Artists
        </button>
      </div>
      {subTab === "pending" && <PendingArtistApplications />}
      {subTab === "all" && (
        <AllArtistsList
          onDrillDown={(id, name) => {
            setDrillArtistId(id);
            setDrillArtistName(name);
          }}
        />
      )}
    </div>
  );
}

function PendingArtistApplications() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingArtists);
  const mod = useServerFn(moderateArtist);

  const {
    data: pendingArtists,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["pending-artists"],
    queryFn: () => list(),
    retry: false,
  });

  const m = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      toast.success(
        `Artist application ${
          variables.data.status === "approved" ? "approved" : "rejected"
        } successfully`,
      );
      qc.invalidateQueries({ queryKey: ["pending-artists"] });
      qc.invalidateQueries({ queryKey: ["pending-artists-count"] });
      qc.invalidateQueries({ queryKey: ["all-artists"] });
      qc.invalidateQueries({ queryKey: ["artist-diagnostics"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading artists…</div>;
  if (error)
    return (
      <div className="text-destructive">Error loading artists: {(error as Error).message}</div>
    );

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
          <p className="text-sm text-muted-foreground">
            {pendingArtists.length} application(s) pending
          </p>
          {pendingArtists.map((a: any) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.genre ?? "No genre"}</p>
                  {a.bio && <p className="text-sm mt-2 text-muted-foreground max-w-2xl">{a.bio}</p>}
                  <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Clock className="size-3" /> Applied{" "}
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button
                    disabled={m.isPending}
                    onClick={() =>
                      m.mutate({ data: { id: a.id, status: "approved", verified: false } })
                    }
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-semibold"
                  >
                    <Check className="size-3" /> Approve
                  </button>
                  <button
                    disabled={m.isPending}
                    onClick={() => {
                      if (window.confirm(`Reject ${a.name}'s artist application?`)) {
                        m.mutate({ data: { id: a.id, status: "rejected" } });
                      }
                    }}
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

function AllArtistsList({ onDrillDown }: { onDrillDown: (id: string, name: string) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllArtists);
  const suspendFn = useServerFn(suspendArtist);
  const unsuspendFn = useServerFn(unsuspendArtist);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suspendReason, setSuspendReason] = useState<Record<string, string>>({});
  const [expandSuspend, setExpandSuspend] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["all-artists", statusFilter, debouncedSearch],
    queryFn: () => listFn({ data: { status: statusFilter, search: debouncedSearch } }),
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["all-artists"] });
    qc.invalidateQueries({ queryKey: ["pending-artists"] });
    qc.invalidateQueries({ queryKey: ["pending-artists-count"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["artist-diagnostics"] });
  };

  const suspendMut = useMutation({
    mutationFn: suspendFn,
    onSuccess: (_, vars) => {
      toast.success("Artist account suspended.");
      setExpandSuspend(null);
      invalidate();
    },
    onError: (e) => toast.error(`Suspend failed: ${(e as Error).message}`),
  });

  const unsuspendMut = useMutation({
    mutationFn: unsuspendFn,
    onSuccess: () => {
      toast.success("Artist account reinstated.");
      invalidate();
    },
    onError: (e) => toast.error(`Reinstate failed: ${(e as Error).message}`),
  });

  const artists = data ?? [];

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      approved: "bg-emerald-500/15 text-emerald-500",
      pending: "bg-yellow-500/15 text-yellow-500",
      rejected: "bg-destructive/15 text-destructive",
      suspended: "bg-orange-500/15 text-orange-500",
    };
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
          map[status] ?? "bg-secondary text-muted-foreground"
        }`}
      >
        {status === "approved" && <BadgeCheck className="size-2.5" />}
        {status === "suspended" && <Ban className="size-2.5" />}
        {status === "pending" && <Clock className="size-2.5" />}
        {status === "rejected" && <X className="size-2.5" />}
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">All Artists ({artists.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-secondary border border-border text-xs w-48 sm:w-64 focus:outline-none focus:border-primary"
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
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm">Loading artists…</div>}
      {error && <div className="text-destructive text-sm">Error: {(error as Error).message}</div>}

      {!isLoading && artists.length === 0 && (
        <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
          <Users className="size-5 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">No artists match your filters.</p>
        </div>
      )}

      <div className="space-y-2">
        {artists.map((a: any) => (
          <div key={a.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{a.name}</p>
                  {statusBadge(a.status)}
                  {a.verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400">
                      <BadgeCheck className="size-2.5" /> Verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.genre ?? "No genre"} · Joined {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* View Financial Drill-Down */}
                <button
                  onClick={() => onDrillDown(a.id, a.name)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 transition-colors font-semibold"
                  title="View full revenue & payout data for this artist"
                >
                  <DollarSign className="size-3" /> Financials
                  <ChevronRight className="size-3" />
                </button>

                {/* Suspend / Unsuspend */}
                {a.status === "suspended" ? (
                  <button
                    disabled={unsuspendMut.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Reinstate ${a.name}'s account? They will regain full artist access.`,
                        )
                      ) {
                        unsuspendMut.mutate({ data: { id: a.id } });
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-500 cursor-pointer hover:bg-emerald-500/25 transition-colors font-semibold"
                  >
                    <RotateCcw className="size-3" /> Reinstate
                  </button>
                ) : a.status === "approved" ? (
                  <button
                    onClick={() => setExpandSuspend(expandSuspend === a.id ? null : a.id)}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-orange-500/15 text-orange-500 cursor-pointer hover:bg-orange-500/25 transition-colors font-semibold"
                  >
                    <Ban className="size-3" /> Suspend
                  </button>
                ) : null}
              </div>
            </div>

            {/* Suspension reason input (inline) */}
            {expandSuspend === a.id && (
              <div className="border-t border-border bg-orange-500/5 p-4 flex flex-col gap-3">
                <p className="text-sm font-semibold text-orange-500 flex items-center gap-2">
                  <Ban className="size-4" /> Suspend {a.name}'s Account
                </p>
                <p className="text-xs text-muted-foreground">
                  This will immediately revoke the artist's access. They will be required to
                  re-apply and agree to Terms &amp; Conditions before being reviewed again.
                </p>
                <textarea
                  rows={2}
                  placeholder="Reason for suspension (visible in audit log)…"
                  value={suspendReason[a.id] ?? ""}
                  onChange={(e) => setSuspendReason((r) => ({ ...r, [a.id]: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500"
                />
                <div className="flex gap-2">
                  <button
                    disabled={suspendMut.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Confirm suspension of ${a.name}? This will revoke their access immediately.`,
                        )
                      ) {
                        suspendMut.mutate({
                          data: { id: a.id, reason: suspendReason[a.id] },
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs px-4 py-2 rounded-full bg-orange-500 text-white cursor-pointer hover:bg-orange-600 transition-colors font-semibold disabled:opacity-50"
                  >
                    <Ban className="size-3" /> Confirm Suspension
                  </button>
                  <button
                    onClick={() => setExpandSuspend(null)}
                    className="text-xs px-3 py-2 rounded-full bg-secondary text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Artist Financial Drill-Down (admin view)
// ─────────────────────────────────────────────────────────────
function ArtistFinancialDrillDown({
  artistId,
  artistName,
  onBack,
}: {
  artistId: string;
  artistName: string;
  onBack: () => void;
}) {
  const getFinancials = useServerFn(getArtistFinancialsById);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-artist-financials", artistId],
    queryFn: () => getFinancials({ data: { artistId } }),
    retry: false,
  });

  const fmt = (n: number) => `ZMW ${n.toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4" /> Back to Artists
        </button>
      </div>
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="size-6 text-primary" />
          {artistName} — Financial Overview
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Complete revenue, sales, and payout history for this artist.
        </p>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading financial data…</div>}
      {error && <div className="text-destructive">Error: {(error as Error).message}</div>}

      {data && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Total Earned</p>
              <p className="text-2xl font-bold text-primary mt-1">{fmt(data.totalEarned ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.purchaseCount ?? 0} sale(s)
              </p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Total Paid Out</p>
              <p className="text-2xl font-bold text-emerald-500 mt-1">
                {fmt(data.totalPaidOut ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Approved &amp; disbursed</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {fmt(data.availableBalance ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Ready to withdraw</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">Pending Payout Requests</p>
              <p className="text-2xl font-bold text-yellow-500 mt-1">
                {fmt(data.totalPending ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </div>
          </div>

          {/* Track Sales */}
          {data.songEarnings && data.songEarnings.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Music className="size-4 text-primary" /> Track Sales
              </h3>
              <div className="space-y-2">
                {data.songEarnings.map((t: any) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.purchaseCount ?? 0} purchase(s) · {t.plays ?? 0} play(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{fmt(t.earned ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">K{t.price ?? 0} / unit</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payout History */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Wallet className="size-4 text-primary" /> Payout History
            </h3>
            {!data.payouts || data.payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payout requests yet.</p>
            ) : (
              <div className="space-y-2">
                {data.payouts.map((p: any) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="text-sm font-semibold">{fmt(Number(p.amount))}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested: {new Date(p.requested_at).toLocaleDateString()}
                        {p.processed_at
                          ? ` · Processed: ${new Date(p.processed_at).toLocaleDateString()}`
                          : ""}
                      </p>
                      {p.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">{p.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {(p.method_code ?? "").replace(/_/g, " ").toUpperCase() || "—"}
                      </span>
                      {/* Status badge */}
                      {(() => {
                        const s = p.status;
                        const cls =
                          s === "approved" || s === "paid" || s === "completed"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : s === "pending"
                              ? "bg-yellow-500/15 text-yellow-500"
                              : "bg-destructive/15 text-destructive";
                        return (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cls}`}
                          >
                            {s}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Earnings summary note */}
          <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
            <strong>Balance breakdown:</strong> Total Earned{" "}
            <span className="text-foreground font-semibold">{fmt(data.totalEarned ?? 0)}</span>
            {" − "}
            Paid Out{" "}
            <span className="text-foreground font-semibold">{fmt(data.totalPaidOut ?? 0)}</span>
            {" = "}
            Available{" "}
            <span className="text-primary font-semibold">{fmt(data.availableBalance ?? 0)}</span>
            {(data.totalPending ?? 0) > 0 && (
              <>
                {" (includes "}
                <span className="text-yellow-500 font-semibold">{fmt(data.totalPending)}</span>
                {" in pending requests)"}
              </>
            )}
          </div>
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

  const {
    data: pendingVerifications,
    isLoading,
    error,
  } = useQuery({
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
      toast.success(
        `Artist verification ${variables.data.decision === "approve" ? "approved" : "rejected"}`,
      );
      qc.invalidateQueries({ queryKey: ["pending-verifications"] });
      qc.invalidateQueries({ queryKey: ["pending-verifications-count"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading verifications…</div>;
  if (error)
    return (
      <div className="text-destructive">
        Error loading verifications: {(error as Error).message}
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Artist Verification Requests</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Artists must have ≥{verificationConfig?.min_followers ?? 100} followers and &gt;K
          {verificationConfig?.min_earnings ?? 500} in earnings to apply for verification. Once
          approved, they receive the verified badge on their profile.
        </p>
      </div>

      {!pendingVerifications || pendingVerifications.length === 0 ? (
        <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="text-muted-foreground text-sm">No verification requests awaiting review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {pendingVerifications.length} request(s) pending
          </p>
          {pendingVerifications.map((a: any) => (
            <div
              key={a.id}
              className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.genre ?? "—"}</p>
                <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500 mt-1">
                  <Clock className="size-3" /> Requested{" "}
                  {new Date(a.created_at).toLocaleDateString()}
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
                  onClick={() => {
                    if (window.confirm(`Reject verification for ${a.name}?`)) {
                      mVerif.mutate({ data: { id: a.id, decision: "reject" } });
                    }
                  }}
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
      toast.success(
        `Label ${variables.data.status === "approved" ? "approved" : "rejected"} successfully`,
      );
      qc.invalidateQueries({ queryKey: ["pending-labels"] });
      qc.invalidateQueries({ queryKey: ["pending-labels-count"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading labels…</div>;
  if (error)
    return <div className="text-destructive">Error loading labels: {(error as Error).message}</div>;
  if (!data || data.length === 0)
    return (
      <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
        <CheckCircle2 className="size-5 text-primary" />
        <p className="text-muted-foreground">No label applications.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">
        {data.length} label application(s) pending
      </p>
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
              onClick={() => {
                if (window.confirm(`Reject the "${l.name}" label application?`)) {
                  m.mutate({ data: { id: l.id, status: "rejected" } });
                }
              }}
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
  const [historyFilter, setHistoryFilter] = useState<"all" | "approved" | "rejected">("all");

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
      qc.invalidateQueries({ queryKey: ["super-payouts"] });
      qc.invalidateQueries({ queryKey: ["super-payouts-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["platform-financials"] });
      qc.invalidateQueries({ queryKey: ["all-artist-financials"] });
    },
    onError: (err) => toast.error(`Payout review failed: ${(err as Error).message}`),
  });

  const confirmReview = (id: string, decision: "approved" | "rejected") => {
    if (
      decision === "approved" &&
      !window.confirm("Approve this payout review? This records approval for money movement.")
    ) {
      return;
    }
    review.mutate({ data: { id, decision, notes: notes[id] } });
  };

  if (isLoading) return <div className="text-muted-foreground">Loading payout requests…</div>;
  if (error)
    return (
      <div className="text-destructive">Error loading payouts: {(error as Error).message}</div>
    );

  const payouts = data ?? [];
  const pending = payouts.filter((p: any) => p.status === "pending");
  const nonPending = payouts.filter((p: any) => p.status !== "pending");

  const totalPendingAmount = pending.reduce(
    (sum: number, p: any) => sum + Number(p.amount || 0),
    0,
  );
  const totalApprovedAmount = payouts
    .filter((p: any) => ["approved", "paid", "completed"].includes(p.status))
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const totalRejectedAmount = payouts
    .filter((p: any) => p.status === "rejected")
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  const filteredHistory = nonPending.filter((p: any) => {
    if (historyFilter === "all") return true;
    if (historyFilter === "approved") return ["approved", "paid", "completed"].includes(p.status);
    if (historyFilter === "rejected") return p.status === "rejected";
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Payout Moderation &amp; Review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review artist payout requests before funds are disbursed. Approving records internal
          approval. Payments are fulfilled via integrated mobile money / payment rails (Lenco
          internal gateway).
        </p>
      </div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
            Awaiting Review
          </p>
          <p className="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            ZMW {totalPendingAmount.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{pending.length} pending requests</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Approved / Disbursed
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            ZMW {totalApprovedAmount.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Successfully approved</p>
        </div>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-xs font-medium text-destructive">Rejected / Cancelled</p>
          <p className="mt-1 text-2xl font-bold text-destructive">
            ZMW {totalRejectedAmount.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Declined requests</p>
        </div>
      </div>

      {/* Pending Payouts List */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Requests Awaiting Action ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6">
            <CheckCircle2 className="size-5 text-primary" />
            <p className="text-sm text-muted-foreground">
              No payout requests await review right now.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((p: any) => {
              const payee = p.label?.name
                ? `Label: ${p.label.name}`
                : `Artist: ${p.artist?.name ?? "Unknown"}`;
              return (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-base">{payee}</span>
                        {p.artist?.id && (
                          <span className="text-xs text-muted-foreground font-mono">
                            ID: {p.artist.id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="rounded-lg bg-secondary/50 p-2">
                          <span className="text-muted-foreground block">Requested Amount</span>
                          <span className="font-bold text-sm text-foreground">
                            ZMW {Number(p.amount).toFixed(2)}
                          </span>
                        </div>
                        <div className="rounded-lg bg-secondary/50 p-2">
                          <span className="text-muted-foreground block">Method (Gateway)</span>
                          <span className="font-medium text-foreground">{p.method_code}</span>
                        </div>
                        <div className="rounded-lg bg-secondary/50 p-2">
                          <span className="text-muted-foreground block">Destination</span>
                          <span className="font-mono text-foreground">{p.destination}</span>
                        </div>
                        <div className="rounded-lg bg-secondary/50 p-2">
                          <span className="text-muted-foreground block">Requested At</span>
                          <span className="text-foreground">
                            {new Date(p.requested_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="w-fit rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                      Pending review
                    </span>
                  </div>

                  <label className="block text-xs font-medium text-muted-foreground">
                    Review note / audit comment (optional)
                    <input
                      value={notes[p.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [p.id]: event.target.value }))
                      }
                      maxLength={1000}
                      placeholder="e.g. Bank ref #12345, verified artist phone..."
                      className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>

                  <div className="flex gap-2 pt-1 border-t border-border">
                    <button
                      disabled={review.isPending}
                      onClick={() => confirmReview(p.id, "approved")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="size-3.5" /> Approve Payout
                    </button>
                    <button
                      disabled={review.isPending}
                      onClick={() => confirmReview(p.id, "rejected")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-4 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/25 disabled:opacity-50"
                    >
                      <X className="size-3.5" /> Reject Request
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reviewed / Payout History */}
      {nonPending.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="text-sm font-semibold">
              Reviewed &amp; Processed Requests ({nonPending.length})
            </div>
            <div className="flex gap-1">
              {(["all", "approved", "rejected"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setHistoryFilter(tab)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    historyFilter === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {filteredHistory.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No records match filter.
              </div>
            ) : (
              filteredHistory.map((p: any) => {
                const isApproved = ["approved", "paid", "completed"].includes(p.status);
                return (
                  <div
                    key={p.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {p.label?.name
                          ? `Label: ${p.label.name}`
                          : (p.artist?.name ?? "Unknown artist")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.destination} · {p.method_code} ·{" "}
                        {new Date(p.requested_at).toLocaleDateString()}
                        {p.notes && ` · Note: "${p.notes}"`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-foreground">
                        ZMW {Number(p.amount).toFixed(2)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          isApproved
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
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
  if (error)
    return (
      <div className="text-destructive">Error loading diagnostics: {(error as Error).message}</div>
    );
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
            <p className="text-2xl font-bold text-primary">{info.summary.visibleOnArtistsPage}</p>
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
            {info.dataIntegrity.approvedArtistsWithoutRole.length} approved artist(s) are missing
            the &apos;artist&apos; role.
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
  const forceSettleFn = useServerFn(markTransactionPaid);
  const { isSuperAdmin } = useUserRoles();

  const { data, isLoading, error } = useQuery({
    queryKey: ["stuck-transactions"],
    queryFn: () => listFn(),
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stuck-transactions"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-activity"] });
  };

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

  // Manual recovery for rows the provider will never settle (e.g. cash
  // received off-system). Superadmin-only server-side; settles idempotently.
  const forceM = useMutation({
    mutationFn: (id: string) => forceSettleFn({ data: { transaction_id: id } }),
    onSuccess: (r: any) => {
      toast.success(
        r?.result === "completed"
          ? "Settled — buyer now has access."
          : `Settle returned: ${r?.result ?? "unknown"}`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading payments…</div>;
  if (error)
    return (
      <div className="text-destructive">Error loading payments: {(error as Error).message}</div>
    );

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Unfinished payments</h2>
          <p className="text-sm text-muted-foreground">
            Payments that never reached a final outcome. Re-check asks the payment provider what
            really happened.
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
                  onClick={() => {
                    if (
                      window.confirm(
                        "Mark this payment as abandoned? The buyer will no longer be able to complete it.",
                      )
                    ) {
                      cancelM.mutate(t.id);
                    }
                  }}
                  disabled={cancelM.isPending}
                  className="text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50"
                >
                  Mark abandoned
                </button>
                {isSuperAdmin && t.status === "fulfillment_failed" && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Force-settle this transaction? Only use this when the money was actually received — it grants the buyer access.",
                        )
                      ) {
                        forceM.mutate(t.id);
                      }
                    }}
                    disabled={forceM.isPending}
                    className="text-xs px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    Force settle
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Support inbox — messages from /contact, owned by staff (no mailbox)
// ─────────────────────────────────────────────────────────────
function SupportMod() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSupportMessages);
  const resolveFn = useServerFn(resolveSupportMessage);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const { data, isLoading, error } = useQuery({
    queryKey: ["support-messages"],
    queryFn: () => listFn(),
    retry: 1,
  });

  const m = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-messages"] });
      qc.invalidateQueries({ queryKey: ["support-open-count"] });
      toast.success("Marked as resolved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading messages…</div>;
  if (error)
    return (
      <div className="text-destructive">Error loading messages: {(error as Error).message}</div>
    );

  const rows: any[] = data ?? [];
  const visible = filter === "open" ? rows.filter((r) => r.status === "open") : rows;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Support inbox</h2>
          <p className="text-sm text-muted-foreground">
            Messages from the contact page. Reply by email, then mark resolved.
          </p>
        </div>
        <div className="flex gap-2">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          {filter === "open" ? "Inbox zero — nothing waiting." : "No messages yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((msg) => (
            <div key={msg.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {msg.subject || "No subject"}{" "}
                    <span
                      className={`ml-1 text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        msg.status === "open"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      {msg.status}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {msg.name} · {msg.email} · {new Date(msg.created_at).toLocaleString()}
                  </p>
                </div>
                {msg.status === "open" && (
                  <button
                    onClick={() => m.mutate(msg.id)}
                    disabled={m.isPending}
                    className="text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 shrink-0"
                  >
                    Mark resolved
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm whitespace-pre-wrap">{msg.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
