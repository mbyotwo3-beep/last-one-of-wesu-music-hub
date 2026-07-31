import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users, Music, Shield, BarChart3, Check, X, Building2,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, CreditCard,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/RoleGate";
import {
  getPlatformStats,
  getRecentActivity,
  listPendingSongs,
  moderateSong,
  listPendingArtists,
  moderateArtist,
  listPendingVerifications,
  moderateArtistVerification,
  listPendingLabels,
  moderateLabel,
  getArtistDiagnostics,
} from "@/lib/admin.functions";
import { usePlatform } from "@/hooks/use-platform";
import { MobileAdmin } from "@/components/mobile/screens/MobileAdmin";

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
  const platform = usePlatform();
  return platform === "native" ? <MobileAdmin /> : <AdminPage />;
}

type Tab = "overview" | "songs" | "artists" | "verifications" | "labels" | "diagnostics";

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

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "songs", label: "Songs", badge: pendingSongsQ.data?.length },
    { id: "artists", label: "Artists", badge: pendingArtistsQ.data?.length },
    { id: "verifications", label: "Verifications", badge: pendingVerifsQ.data?.length },
    { id: "labels", label: "Labels", badge: pendingLabelsQ.data?.length },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
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

  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => statsFn(), retry: 1 });
  const activityQ = useQuery({ queryKey: ["admin-activity"], queryFn: () => activityFn(), retry: 1 });

  const d = statsQ.data;

  const metricCards = d
    ? [
        { label: "Total Users", value: d.totalUsers.toLocaleString(), icon: Users, color: "text-blue-400" },
        { label: "Total Artists", value: (d as any).totalArtists?.toLocaleString() ?? "0", icon: Music, color: "text-purple-400" },
        { label: "Total Songs", value: d.totalSongs.toLocaleString(), icon: Music, color: "text-green-400" },
        { label: "Active Subscriptions", value: d.premiumSubscribers.toLocaleString(), icon: CreditCard, color: "text-yellow-400" },
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
// Songs moderation
// ─────────────────────────────────────────────────────────────
function SongMod() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingSongs);
  const mod = useServerFn(moderateSong);
  const { data, isLoading } = useQuery({ queryKey: ["pending-songs"], queryFn: () => list(), retry: false });
  const m = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      toast.success(`Song ${variables.data.status === "approved" ? "approved" : "rejected"} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-songs"] });
      qc.invalidateQueries({ queryKey: ["pending-songs-count"] });
    },
    onError: (error) => toast.error(`Failed: ${(error as Error).message}`),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data || data.length === 0)
    return (
      <div className="flex items-center gap-3 p-6 bg-card border border-border rounded-2xl">
        <CheckCircle2 className="size-5 text-primary" />
        <p className="text-muted-foreground">No songs awaiting moderation.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">{data.length} song(s) waiting for approval</p>
      {data.map((s: any) => (
        <div
          key={s.id}
          className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
        >
          <div>
            <p className="font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground">{s.artist?.name ?? "Unknown artist"}</p>
            <span className="inline-flex items-center gap-1 text-[11px] text-yellow-500 mt-1">
              <Clock className="size-3" /> Pending since {new Date(s.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: s.id, status: "approved" } })}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary cursor-pointer hover:bg-primary/25 transition-colors font-semibold"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: s.id, status: "rejected" } })}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive cursor-pointer hover:bg-destructive/25 transition-colors font-semibold"
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
// Artists moderation (applications only)
// ─────────────────────────────────────────────────────────────
function ArtistMod() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingArtists);
  const mod = useServerFn(moderateArtist);

  const { data: pendingArtists, isLoading } = useQuery({
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

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

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

  const { data: pendingVerifications, isLoading } = useQuery({
    queryKey: ["pending-verifications"],
    queryFn: () => listVerifs(),
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

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Artist Verification Requests</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Artists must have ≥100 followers and &gt;K500 in earnings to apply for verification.
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
  const { data, isLoading } = useQuery({
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

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
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
// Diagnostics
// ─────────────────────────────────────────────────────────────
function Diagnostics() {
  const diagFn = useServerFn(getArtistDiagnostics);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["artist-diagnostics"],
    queryFn: () => diagFn(),
    retry: false,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading diagnostics…</div>;
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
