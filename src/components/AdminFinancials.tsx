/**
 * AdminFinancials.tsx
 *
 * Comprehensive staff-facing financial analytics panel.
 * Shows platform-wide revenue, per-artist balances, payout history,
 * and a drill-down view for individual artists.
 *
 * Staff sees internal method codes (lenco_mtn etc.).
 * Lenco is the payment gateway used internally; this panel is for
 * admin/superadmin eyes only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  TrendingUp,
  DollarSign,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  Users,
  ArrowLeft,
  AlertCircle,
  CreditCard,
  Shield,
} from "lucide-react";
import {
  getPlatformFinancials,
  getAllArtistFinancials,
  getArtistFinancialsById,
} from "@/lib/financials.functions";

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `ZMW ${n.toFixed(2)}`;
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `ZMW ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `ZMW ${(n / 1_000).toFixed(1)}K`;
  return `ZMW ${n.toFixed(2)}`;
}

function PayoutStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 text-[10px] font-semibold uppercase tracking-wide">
          <Clock className="size-2.5" /> Pending
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-400/15 text-blue-400 text-[10px] font-semibold uppercase tracking-wide">
          <Clock className="size-2.5" /> Processing
        </span>
      );
    case "approved":
    case "paid":
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-semibold uppercase tracking-wide">
          <CheckCircle2 className="size-2.5" /> Paid
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold uppercase tracking-wide">
          <XCircle className="size-2.5" /> Rejected
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] capitalize">
          {status}
        </span>
      );
  }
}

// ─────────────────────────────────────────────────────────────
// Monthly Revenue Mini-Chart
// ─────────────────────────────────────────────────────────────

function MiniMonthlyChart({ data }: { data: { month: string; amount: number }[] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((entry) => {
        const pct = Math.max(4, (entry.amount / max) * 100);
        const [, month] = entry.month.split("-");
        const label = monthNames[parseInt(month, 10) - 1] ?? month;
        return (
          <div key={entry.month} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t-sm bg-primary/40 group-hover:bg-primary transition-colors"
              style={{ height: `${pct}%` }}
            />
            <span className="text-[8px] text-muted-foreground">{label}</span>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-card border border-border rounded px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap z-10 shadow">
              {fmt(entry.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Platform-wide overview
// ─────────────────────────────────────────────────────────────

function PlatformOverview({ onDrillDown }: { onDrillDown: (artistId: string) => void }) {
  const financialsFn = useServerFn(getPlatformFinancials);
  const artistsFn = useServerFn(getAllArtistFinancials);

  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-financials"],
    queryFn: () => financialsFn(),
    retry: 1,
    staleTime: 60_000,
  });

  const { data: artists, isLoading: artistsLoading } = useQuery({
    queryKey: ["all-artist-financials"],
    queryFn: () => artistsFn(),
    retry: 1,
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="text-muted-foreground text-sm">Loading financial data…</div>;
  if (error)
    return <div className="text-destructive text-sm">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const summaryCards = [
    {
      label: "Total Platform Revenue",
      value: fmtShort(data.totalRevenue),
      detail: `${data.totalTransactions} transactions`,
      icon: TrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Revenue (30 days)",
      value: fmtShort(data.revenue30d),
      detail: `${data.transactions30d} transactions`,
      icon: BarChart3,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      label: "Revenue (7 days)",
      value: fmtShort(data.revenue7d),
      detail: "Last 7 days",
      icon: TrendingUp,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Total Paid Out to Artists",
      value: fmtShort(data.totalPaidOut),
      detail: "Approved & completed payouts",
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Pending Payout Requests",
      value: fmtShort(data.totalPendingAmount),
      detail: `${data.pendingPayoutCount} request${data.pendingPayoutCount !== 1 ? "s" : ""} awaiting`,
      icon: Clock,
      color: data.pendingPayoutCount > 0 ? "text-yellow-500" : "text-muted-foreground",
      bg: data.pendingPayoutCount > 0 ? "bg-yellow-500/10" : "bg-secondary",
    },
    {
      label: "Rejected Payout Requests",
      value: fmtShort(data.totalRejectedAmount),
      detail: "Declined payout amounts",
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "Platform Retained",
      value: fmtShort(data.totalRetained),
      detail: "Revenue not yet paid out",
      icon: Shield,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Revenue Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className={`rounded-2xl p-5 border border-border ${card.bg}`}>
            <card.icon className={`size-4 mb-2 ${card.color}`} />
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{card.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{card.detail}</p>
          </div>
        ))}
      </div>

      {/* Revenue Flow Explanation */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Revenue Flow</h3>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full bg-primary" />
            <span className="font-medium">Collected: {fmt(data.totalRevenue)}</span>
          </div>
          <span className="text-muted-foreground hidden sm:block">→</span>
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full bg-emerald-500" />
            <span>Paid to artists: {fmt(data.totalPaidOut)}</span>
          </div>
          <span className="text-muted-foreground hidden sm:block">+</span>
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full bg-yellow-500" />
            <span>Pending: {fmt(data.totalPendingAmount)}</span>
          </div>
          <span className="text-muted-foreground hidden sm:block">+</span>
          <div className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-full bg-orange-400" />
            <span>Retained: {fmt(data.totalRetained)}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Payouts are processed via the platform's payment gateway. Each approved payout request is
          fulfilled and the amount is deducted from the artist's available balance.
        </p>
      </div>

      {/* Monthly Revenue Chart */}
      {data.monthlyRevenue.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Monthly Revenue (Last 12 months)</h3>
          </div>
          <MiniMonthlyChart data={data.monthlyRevenue} />
        </div>
      )}

      {/* Pending Payouts Alert */}
      {data.pendingPayoutCount > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="size-4 text-yellow-500" />
            <h3 className="font-semibold text-sm text-yellow-500">
              {data.pendingPayoutCount} Pending Payout Request
              {data.pendingPayoutCount !== 1 ? "s" : ""} — Action Needed
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            The following payout requests are awaiting staff review. Go to the Payouts tab to
            approve or reject them.
          </p>
          <div className="space-y-2">
            {(data.pendingPayoutItems ?? []).slice(0, 5).map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-card/60 rounded-lg px-4 py-2"
              >
                <div>
                  <span className="text-sm font-medium">
                    {p.label?.name ?? p.artist?.name ?? "Unknown"}
                  </span>
                  {p.label && (
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                      label
                    </span>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {p.method_code} · {new Date(p.requested_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm font-bold text-yellow-500">
                  {fmt(Number(p.amount ?? 0))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Artist Balance Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Artist Financial Balances</h3>
          {artistsLoading && (
            <span className="text-xs text-muted-foreground ml-auto">Loading…</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-xs">
              <tr>
                <th className="text-left p-3">Artist</th>
                <th className="text-right p-3">Total Earned</th>
                <th className="text-right p-3">Paid Out</th>
                <th className="text-right p-3">Pending</th>
                <th className="text-right p-3">Available</th>
                <th className="text-right p-3">Payouts</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!artistsLoading && (artists ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">
                    No approved artists yet.
                  </td>
                </tr>
              )}
              {(artists ?? []).map((a: any) => (
                <tr key={a.artistId} className="hover:bg-accent/40 transition-colors group">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.artistName}</span>
                      {a.verified && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {a.purchaseCount} sale{a.purchaseCount !== 1 ? "s" : ""}
                    </p>
                  </td>
                  <td className="p-3 text-right font-semibold text-primary">
                    {fmtShort(a.totalEarned)}
                  </td>
                  <td className="p-3 text-right text-emerald-500 font-medium">
                    {fmtShort(a.totalPaidOut)}
                  </td>
                  <td className="p-3 text-right">
                    {a.totalPending > 0 ? (
                      <span className="text-yellow-500 font-medium">
                        {fmtShort(a.totalPending)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className={
                        a.availableBalance > 0
                          ? "font-bold text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {fmtShort(a.availableBalance)}
                    </span>
                  </td>
                  <td className="p-3 text-right text-muted-foreground text-xs">
                    {a.payoutCount} total
                    {a.pendingPayoutCount > 0 && (
                      <span className="ml-1 text-yellow-500">({a.pendingPayoutCount} pending)</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => onDrillDown(a.artistId)}
                      className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approved Payouts History */}
      {(data.approvedPayoutItems ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <h3 className="font-semibold text-sm">Recently Processed Payouts</h3>
          </div>
          <div className="divide-y divide-border">
            {data.approvedPayoutItems.slice(0, 10).map((p: any) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <span className="text-sm font-medium">
                    {p.label?.name ?? p.artist?.name ?? "Unknown payee"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Gateway: {p.method_code} ·{" "}
                    {p.processed_at
                      ? `Processed ${new Date(p.processed_at).toLocaleDateString()}`
                      : "Processing"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-emerald-500">
                    {fmt(Number(p.amount ?? 0))}
                  </span>
                  <PayoutStatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Artist deep-dive
// ─────────────────────────────────────────────────────────────

function ArtistDrillDown({ artistId, onBack }: { artistId: string; onBack: () => void }) {
  const fn = useServerFn(getArtistFinancialsById);
  const { data, isLoading, error } = useQuery({
    queryKey: ["artist-financials-detail", artistId],
    queryFn: () => fn({ data: { artistId } }),
    retry: 1,
    staleTime: 60_000,
  });

  if (isLoading)
    return <div className="text-muted-foreground text-sm">Loading artist financials…</div>;
  if (error)
    return <div className="text-destructive text-sm">Error: {(error as Error).message}</div>;
  if (!data) return null;

  const cards = [
    {
      label: "Total Earned",
      value: fmt(data.totalEarned),
      icon: TrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
      note: `${data.purchaseCount} purchases`,
    },
    {
      label: "Paid Out",
      value: fmt(data.totalPaidOut),
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      note: "Approved payouts",
    },
    {
      label: "Pending",
      value: fmt(data.totalPending),
      icon: Clock,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      note: "Awaiting processing",
    },
    {
      label: "Rejected",
      value: fmt(data.totalRejected),
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      note: "Declined requests",
    },
    {
      label: "Available Balance",
      value: fmt(data.availableBalance),
      icon: Wallet,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      note: "Can be paid out",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-accent transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-3" /> Back to all artists
        </button>
        <h2 className="text-xl font-bold">{data.artist.name}</h2>
        {data.artist.verified && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
            ✓ Verified
          </span>
        )}
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl p-4 border border-border ${c.bg}`}>
            <c.icon className={`size-4 mb-2 ${c.color}`} />
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{c.label}</p>
            <p className="text-[10px] text-muted-foreground">{c.note}</p>
          </div>
        ))}
      </div>

      {/* Balance bar */}
      {data.totalEarned > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Revenue distribution</p>
          <div className="h-3 bg-accent rounded-full overflow-hidden flex">
            {data.totalPaidOut > 0 && (
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${(data.totalPaidOut / data.totalEarned) * 100}%` }}
                title={`Paid: ${fmt(data.totalPaidOut)}`}
              />
            )}
            {data.totalPending > 0 && (
              <div
                className="bg-yellow-500 h-full"
                style={{ width: `${(data.totalPending / data.totalEarned) * 100}%` }}
                title={`Pending: ${fmt(data.totalPending)}`}
              />
            )}
            {data.totalRejected > 0 && (
              <div
                className="bg-destructive/60 h-full"
                style={{ width: `${(data.totalRejected / data.totalEarned) * 100}%` }}
                title={`Rejected: ${fmt(data.totalRejected)}`}
              />
            )}
            {data.availableBalance > 0 && (
              <div
                className="bg-primary h-full"
                style={{ width: `${(data.availableBalance / data.totalEarned) * 100}%` }}
                title={`Available: ${fmt(data.availableBalance)}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500 inline-block" /> Paid
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-yellow-500 inline-block" /> Pending
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-destructive/60 inline-block" /> Rejected
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary inline-block" /> Available
            </span>
          </div>
        </div>
      )}

      {/* Monthly Earnings */}
      {data.monthlyEarnings.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Monthly Earnings</h3>
          </div>
          <MiniMonthlyChart data={data.monthlyEarnings} />
        </div>
      )}

      {/* Payout History — full staff view with gateway details */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <CreditCard className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Payout History</h3>
          <span className="text-[10px] ml-1 text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            Internal — not visible to artist
          </span>
        </div>
        {data.payouts.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No payout requests yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.payouts.map((p: any) => (
              <div key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{fmt(p.amount)}</span>
                      <PayoutStatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium text-foreground">Gateway code:</span>{" "}
                      {p.method_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Destination:</span>{" "}
                      {p.destination}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested: {new Date(p.requested_at).toLocaleString()}
                      {p.processed_at &&
                        ` · Processed: ${new Date(p.processed_at).toLocaleString()}`}
                    </p>
                    {p.notes && (
                      <p className="text-xs italic text-muted-foreground mt-1">Note: {p.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-Song Revenue */}
      {data.songEarnings.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-sm">Revenue by Track</h3>
          </div>
          <div className="divide-y divide-border">
            {data.songEarnings.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.plays.toLocaleString()} plays · {s.purchaseCount} purchase
                    {s.purchaseCount !== 1 ? "s" : ""} · ZMW {s.price.toFixed(2)} each
                  </p>
                </div>
                <p
                  className={`text-sm font-bold shrink-0 ${s.earned > 0 ? "text-primary" : "text-muted-foreground"}`}
                >
                  {fmt(s.earned)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Top-level exported component
// ─────────────────────────────────────────────────────────────

export function AdminFinancials() {
  const [drillArtistId, setDrillArtistId] = useState<string | null>(null);

  if (drillArtistId) {
    return <ArtistDrillDown artistId={drillArtistId} onBack={() => setDrillArtistId(null)} />;
  }

  return <PlatformOverview onDrillDown={setDrillArtistId} />;
}
