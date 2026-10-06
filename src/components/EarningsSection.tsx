/**
 * EarningsSection.tsx
 *
 * Rich financial analytics panel for the artist dashboard.
 * Shows total earned, paid out, pending, available balance,
 * per-song/album revenue, payout history, and monthly trends.
 *
 * NO Lenco branding — payment methods are shown as MTN/Airtel/Zamtel or
 * "Wesu+ Payment" from the artist's perspective.
 */
import { TrendingUp, DollarSign, Wallet, ArrowDownCircle, Clock, CheckCircle2, XCircle, Music, BarChart3, AlertCircle } from "lucide-react";

interface PayoutItem {
  id: string;
  amount: number;
  paymentMethod: string;
  destination: string;
  status: string;
  notes: string | null;
  requestedAt: string;
  processedAt: string | null;
}

interface SongEarning {
  id: string;
  title: string;
  coverUrl: string | null;
  price: number;
  plays: number;
  status: string;
  purchaseCount: number;
  earned: number;
  createdAt: string;
}

interface AlbumEarning {
  id: string;
  title: string;
  coverUrl: string | null;
  price: number;
  purchaseCount: number;
  earned: number;
  createdAt: string;
}

interface MonthlyEntry {
  month: string; // "YYYY-MM"
  amount: number;
}

interface EarningsData {
  totalEarned: number;
  totalPaidOut: number;
  totalPending: number;
  availableBalance: number;
  payouts: PayoutItem[];
  songEarnings: SongEarning[];
  albumEarnings: AlbumEarning[];
  monthlyEarnings: MonthlyEntry[];
  recentTransactions: any[];
}

interface Props {
  data?: EarningsData | null;
  isLoading?: boolean;
}

function fmt(n: number) {
  return `K${n.toFixed(2)}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 text-[11px] font-semibold">
          <Clock className="size-3" /> {status === "processing" ? "Processing" : "Under Review"}
        </span>
      );
    case "approved":
    case "paid":
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[11px] font-semibold">
          <CheckCircle2 className="size-3" /> Paid Out
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-[11px] font-semibold">
          <XCircle className="size-3" /> Declined
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[11px] capitalize">
          {status}
        </span>
      );
  }
}

function MonthlyChart({ data }: { data: MonthlyEntry[] }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div className="flex items-end gap-1.5 h-20 w-full">
      {data.map((entry) => {
        const pct = Math.max(4, (entry.amount / max) * 100);
        const [, month] = entry.month.split("-");
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const label = monthNames[parseInt(month, 10) - 1] ?? month;
        return (
          <div key={entry.month} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-t-sm bg-primary/40 group-hover:bg-primary transition-colors"
              style={{ height: `${pct}%` }}
            />
            <span className="text-[9px] text-muted-foreground">{label}</span>
            {/* Tooltip */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-card border border-border rounded px-2 py-1 text-[10px] font-semibold whitespace-nowrap z-10 shadow-lg">
              {fmt(entry.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EarningsSection({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
        <div className="h-4 w-40 bg-accent rounded mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-accent rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasSongRevenue = data.songEarnings.some((s) => s.earned > 0);
  const hasAlbumRevenue = data.albumEarnings.some((a) => a.earned > 0);
  const hasPayouts = data.payouts.length > 0;
  const hasMonthly = data.monthlyEarnings.length > 0;

  const earningCards = [
    {
      label: "Total Earned",
      value: fmt(data.totalEarned),
      icon: TrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
      description: "All-time gross earnings from sales",
    },
    {
      label: "Paid Out",
      value: fmt(data.totalPaidOut),
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      description: "Successfully sent to your account",
    },
    {
      label: "Pending Payout",
      value: fmt(data.totalPending),
      icon: Clock,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      description: "Payout requests being processed",
    },
    {
      label: "Available Balance",
      value: fmt(data.availableBalance),
      icon: Wallet,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      description: "Ready to request a payout",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Earnings Overview Cards */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign className="size-5 text-primary" />
          <h2 className="text-lg font-bold">Earnings Overview</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {earningCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl p-4 ${card.bg} border border-border/40`}
            >
              <card.icon className={`size-4 mb-2 ${card.color}`} />
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs font-semibold text-foreground mt-0.5">{card.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{card.description}</p>
            </div>
          ))}
        </div>

        {/* Balance breakdown bar */}
        {data.totalEarned > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Revenue distribution</span>
              <span className="text-foreground font-medium">{fmt(data.totalEarned)} total</span>
            </div>
            <div className="h-3 bg-accent rounded-full overflow-hidden flex gap-0.5">
              {data.totalPaidOut > 0 && (
                <div
                  className="bg-emerald-500 h-full rounded-l-full"
                  style={{ width: `${(data.totalPaidOut / data.totalEarned) * 100}%` }}
                  title={`Paid out: ${fmt(data.totalPaidOut)}`}
                />
              )}
              {data.totalPending > 0 && (
                <div
                  className="bg-yellow-500 h-full"
                  style={{ width: `${(data.totalPending / data.totalEarned) * 100}%` }}
                  title={`Pending: ${fmt(data.totalPending)}`}
                />
              )}
              {data.availableBalance > 0 && (
                <div
                  className="bg-primary h-full rounded-r-full"
                  style={{ width: `${(data.availableBalance / data.totalEarned) * 100}%` }}
                  title={`Available: ${fmt(data.availableBalance)}`}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Paid out</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">Processing</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">Available</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Monthly Earnings Chart */}
      {hasMonthly && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="size-4 text-primary" />
            <h3 className="font-semibold">Monthly Earnings (Last 12 months)</h3>
          </div>
          <MonthlyChart data={data.monthlyEarnings} />
        </div>
      )}

      {/* Song Revenue Breakdown */}
      {data.songEarnings.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Music className="size-4 text-primary" />
            <h3 className="font-semibold">Revenue by Track</h3>
          </div>
          <div className="space-y-2">
            {data.songEarnings.slice(0, 10).map((song) => (
              <div
                key={song.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:bg-accent/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {song.coverUrl ? (
                    <img
                      src={song.coverUrl}
                      alt=""
                      className="w-8 h-8 rounded-lg object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <Music className="size-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {song.plays.toLocaleString()} plays · {song.purchaseCount} purchase{song.purchaseCount !== 1 ? "s" : ""} · {fmt(song.price)} each
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${song.earned > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {fmt(song.earned)}
                  </p>
                  {!hasSongRevenue && (
                    <p className="text-[10px] text-muted-foreground">No sales yet</p>
                  )}
                </div>
              </div>
            ))}
            {!hasSongRevenue && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No song sales yet — keep sharing your music!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Album Revenue */}
      {data.albumEarnings.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="size-4 text-primary" />
            <h3 className="font-semibold">Revenue by Album</h3>
          </div>
          <div className="space-y-2">
            {data.albumEarnings.map((album) => (
              <div
                key={album.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{album.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {album.purchaseCount} purchase{album.purchaseCount !== 1 ? "s" : ""} · {fmt(album.price)} album price
                  </p>
                </div>
                <p className={`text-sm font-bold shrink-0 ${album.earned > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  {fmt(album.earned)}
                </p>
              </div>
            ))}
            {!hasAlbumRevenue && (
              <p className="text-sm text-muted-foreground text-center py-2">No album sales yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Payout History */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownCircle className="size-4 text-primary" />
          <h3 className="font-semibold">Payout History</h3>
        </div>
        {!hasPayouts ? (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/50">
            <AlertCircle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">No payout requests yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Once you have an available balance, you can request a payout from the Artist Studio.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {data.payouts.map((payout) => (
              <div
                key={payout.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/40 hover:bg-accent/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{fmt(payout.amount)}</p>
                    {statusBadge(payout.status)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {payout.paymentMethod} · {payout.destination}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Requested {new Date(payout.requestedAt).toLocaleDateString("en-ZM", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {payout.processedAt &&
                      ` · Processed ${new Date(payout.processedAt).toLocaleDateString("en-ZM", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`}
                  </p>
                  {payout.notes && (
                    <p className="text-[11px] text-muted-foreground italic mt-0.5">
                      Note: {payout.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
