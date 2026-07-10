import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, Music, CreditCard, Shield, BarChart3, Check, X, Building2 } from "lucide-react";
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

type Tab = "overview" | "songs" | "artists" | "labels" | "diagnostics";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="size-6 text-primary" />
          <h1 className="text-3xl font-bold">Admin</h1>
        </div>
        <div className="flex gap-2 mb-8 border-b border-border pb-3">
          {(["overview", "songs", "artists", "labels", "diagnostics"] as Tab[]).map((t) => (
            <button
              key={t}
              data-tab={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "songs" && <SongMod />}
        {tab === "artists" && <ArtistMod />}
        {tab === "labels" && <LabelMod />}
        {tab === "diagnostics" && <Diagnostics />}
      </div>
    </div>
  );
}

function LabelMod() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingLabels);
  const modFn = useServerFn(moderateLabel);
  const { data } = useQuery({
    queryKey: ["pending-labels"],
    queryFn: () => listFn(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: modFn,
    onSuccess: (_, variables) => {
      const action = variables.data.status === "approved" ? "approved" : "rejected";
      toast.success(`Label ${action} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-labels"] });
    },
    onError: (error) => {
      toast.error(`Failed to moderate label: ${(error as Error).message}`);
    },
  });
  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  if (data.length === 0) return <p className="text-muted-foreground">No label applications.</p>;
  return (
    <div className="space-y-3">
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
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: l.id, status: "approved" } })}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 text-primary"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: l.id, status: "rejected" } })}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-destructive/15 text-destructive"
            >
              <X className="size-3" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Overview() {
  const statsFn = useServerFn(getPlatformStats);
  const activityFn = useServerFn(getRecentActivity);
  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => statsFn(), retry: 1 });
  const activityQ = useQuery({
    queryKey: ["admin-activity"],
    queryFn: () => activityFn(),
    retry: 1,
  });

  const stats = statsQ.data
    ? [
        { label: "Total Users", value: statsQ.data.totalUsers.toLocaleString(), icon: Users },
        { label: "Total Songs", value: statsQ.data.totalSongs.toLocaleString(), icon: Music },
        {
          label: "Premium Subs",
          value: statsQ.data.premiumSubscribers.toLocaleString(),
          icon: CreditCard,
        },
        {
          label: "Revenue 30d",
          value: `ZMW ${statsQ.data.monthlyRevenueZmw.toFixed(2)}`,
          icon: BarChart3,
        },
      ]
    : null;

  return (
    <>
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stats.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-6">
              <s.icon className="size-5 text-primary mb-3" />
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Uploads</h2>
          {!activityQ.data || activityQ.data.recentSongs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          ) : (
            <ul className="space-y-3">
              {activityQ.data.recentSongs.map((s) => (
                <li key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-accent">
                  <Music className="size-4 text-muted-foreground" />
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
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
          {!activityQ.data || activityQ.data.recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="space-y-3">
              {activityQ.data.recentTransactions.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-accent"
                >
                  <div>
                    <p className="text-sm font-medium">ZMW {Number(t.amount).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t.method_code}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-primary/15 text-primary">
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function SongMod() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingSongs);
  const mod = useServerFn(moderateSong);
  const { data } = useQuery({ queryKey: ["pending-songs"], queryFn: () => list(), retry: false });
  const m = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      const action = variables.data.status === "approved" ? "approved" : "rejected";
      toast.success(`Song ${action} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-songs"] });
    },
    onError: (error) => {
      toast.error(`Failed to moderate song: ${(error as Error).message}`);
    },
  });
  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  if (data.length === 0)
    return <p className="text-muted-foreground">No songs awaiting moderation.</p>;
  return (
    <div className="space-y-3">
      {data.map((s: any) => (
        <div
          key={s.id}
          className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
        >
          <div>
            <p className="font-medium">{s.title}</p>
            <p className="text-xs text-muted-foreground">{s.artist?.name ?? "Unknown"}</p>
          </div>
          <div className="flex gap-2">
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: s.id, status: "approved" } })}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              disabled={m.isPending}
              onClick={() => m.mutate({ data: { id: s.id, status: "rejected" } })}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive"
            >
              <X className="size-3" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtistMod() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingArtists);
  const mod = useServerFn(moderateArtist);
  const { data } = useQuery({ queryKey: ["pending-artists"], queryFn: () => list(), retry: false });
  const m = useMutation({
    mutationFn: mod,
    onSuccess: (_, variables) => {
      const action = variables.data.status === "approved" ? "approved" : "rejected";
      toast.success(`Artist ${action} successfully`);
      qc.invalidateQueries({ queryKey: ["pending-artists"] });
    },
    onError: (error) => {
      toast.error(`Failed to moderate artist: ${(error as Error).message}`);
    },
  });
  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  if (data.length === 0)
    return <p className="text-muted-foreground">No artist applications awaiting review.</p>;
  return (
    <div className="space-y-3">
      {data.map((a: any) => (
        <div key={a.id} className="bg-card border border-border rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.genre ?? "—"}</p>
              {a.bio && <p className="text-sm mt-2 text-muted-foreground">{a.bio}</p>}
            </div>
            <div className="flex gap-2">
              <button
                disabled={m.isPending}
                onClick={() => m.mutate({ data: { id: a.id, status: "approved", verified: true } })}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary"
              >
                <Check className="size-3" /> Approve
              </button>
              <button
                disabled={m.isPending}
                onClick={() => m.mutate({ data: { id: a.id, status: "rejected" } })}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-destructive/15 text-destructive"
              >
                <X className="size-3" /> Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
            <Shield className="size-4" />
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
            {info.dataIntegrity.approvedArtistsWithoutRole.length} approved artist(s) are missing the 'artist' role.
            This can happen if the approval process was interrupted.
          </p>
          <div className="text-xs space-y-2">
            {info.dataIntegrity.approvedArtistsWithoutRole.map((artist) => (
              <div key={artist.id} className="bg-card p-2 rounded">
                {artist.name} (ID: {artist.id})
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            To fix: Re-approve these artists via the Artists tab, or run the SQL fix from ARTIST_VISIBILITY_FIX.md
          </p>
        </div>
      )}
    </div>
  );
}
