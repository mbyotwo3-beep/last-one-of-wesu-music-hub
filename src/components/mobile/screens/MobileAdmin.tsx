import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, CreditCard, Music, Users, X, Wallet } from "lucide-react";
import { useState } from "react";
import { useUserRoles } from "@/hooks/use-roles";
import {
  getPlatformStats,
  listPendingSongs,
  moderateSong,
  listPendingArtists,
  moderateArtist,
  listPendingLabels,
  moderateLabel,
} from "@/lib/admin.functions";
import { listPayouts, decidePayout } from "@/lib/superadmin.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Mobile Admin panel — stats grid + moderation queues + payouts (superadmin).
 *
 * Feature: wesu-plus-completion
 */
export function MobileAdmin() {
  const { isSuperAdmin } = useUserRoles();
  const statsFn = useServerFn(getPlatformStats);
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => statsFn(),
    retry: false,
  });

  return (
    <div className="pb-6">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold">Admin</h1>
      </div>

      {/* 2×2 stats grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 px-4 mb-6">
          {[
            { label: "Total Users", value: stats.totalUsers, icon: Users },
            { label: "Total Songs", value: stats.totalSongs, icon: Music },
            { label: "Premium Subs", value: stats.premiumSubscribers, icon: CreditCard },
            {
              label: "Revenue 30d",
              value: `ZMW ${stats.monthlyRevenueZmw.toFixed(0)}`,
              icon: BarChart3,
            },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <s.icon className="size-4 text-primary mb-2" />
              <p className="text-xl font-bold">{String(s.value)}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Moderation tabs */}
      <Tabs defaultValue="songs" className="px-4">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="songs" className="flex-1 text-xs">
            Songs
          </TabsTrigger>
          <TabsTrigger value="artists" className="flex-1 text-xs">
            Artists
          </TabsTrigger>
          <TabsTrigger value="labels" className="flex-1 text-xs">
            Labels
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="payouts" className="flex-1 text-xs">
              Payouts
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="songs">
          <SongQueue />
        </TabsContent>
        <TabsContent value="artists">
          <ArtistQueue />
        </TabsContent>
        <TabsContent value="labels">
          <LabelQueue />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="payouts">
            <PayoutsQueue />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function SongQueue() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingSongs);
  const modFn = useServerFn(moderateSong);
  const { data } = useQuery({ queryKey: ["pending-songs"], queryFn: () => listFn(), retry: false });
  const m = useMutation({
    mutationFn: modFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-songs"] }),
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No pending songs.</p>;
  return (
    <div className="space-y-3">
      {data.map((s: any) => (
        <ModerationCard
          key={s.id}
          title={s.title}
          subtitle={s.artist?.name ?? "Unknown"}
          onApprove={() => m.mutate({ data: { id: s.id, status: "approved" } })}
          onReject={() => m.mutate({ data: { id: s.id, status: "rejected" } })}
          loading={m.isPending}
        />
      ))}
    </div>
  );
}

function ArtistQueue() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingArtists);
  const modFn = useServerFn(moderateArtist);
  const { data } = useQuery({
    queryKey: ["pending-artists"],
    queryFn: () => listFn(),
    retry: false,
  });
  const m = useMutation({
    mutationFn: modFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-artists"] }),
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0)
    return <p className="text-sm text-muted-foreground">No pending artists.</p>;
  return (
    <div className="space-y-3">
      {data.map((a: any) => (
        <ModerationCard
          key={a.id}
          title={a.name}
          subtitle={a.genre ?? "—"}
          onApprove={() => m.mutate({ data: { id: a.id, status: "approved", verified: true } })}
          onReject={() => m.mutate({ data: { id: a.id, status: "rejected" } })}
          loading={m.isPending}
        />
      ))}
    </div>
  );
}

function LabelQueue() {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-labels"] }),
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No pending labels.</p>;
  return (
    <div className="space-y-3">
      {data.map((l: any) => (
        <ModerationCard
          key={l.id}
          title={l.name}
          subtitle={l.contact_email ?? "—"}
          onApprove={() => m.mutate({ data: { id: l.id, status: "approved" } })}
          onReject={() => m.mutate({ data: { id: l.id, status: "rejected" } })}
          loading={m.isPending}
        />
      ))}
    </div>
  );
}

function PayoutsQueue() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPayouts);
  const decideFn = useServerFn(decidePayout);
  const { data } = useQuery({ queryKey: ["super-payouts"], queryFn: () => listFn(), retry: false });
  const m = useMutation({
    mutationFn: decideFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-payouts"] }),
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const pending = data.filter((p: any) => p.status === "pending");
  if (pending.length === 0)
    return <p className="text-sm text-muted-foreground">No pending payouts.</p>;
  return (
    <div className="space-y-3">
      {pending.map((p: any) => (
        <ModerationCard
          key={p.id}
          title={`ZMW ${Number(p.amount).toFixed(2)}`}
          subtitle={`${p.artist?.name ?? "—"} · ${p.method_code}`}
          onApprove={() => m.mutate({ data: { id: p.id, decision: "approved" } })}
          onReject={() => m.mutate({ data: { id: p.id, decision: "rejected" } })}
          loading={m.isPending}
        />
      ))}
    </div>
  );
}

function ModerationCard({
  title,
  subtitle,
  onApprove,
  onReject,
  loading,
}: {
  title: string;
  subtitle: string;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          disabled={loading}
          onClick={onApprove}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-primary/15 text-primary rounded-lg disabled:opacity-50"
          aria-label="Approve"
        >
          <Check className="size-4" />
        </button>
        <button
          disabled={loading}
          onClick={onReject}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-destructive/15 text-destructive rounded-lg disabled:opacity-50"
          aria-label="Reject"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
