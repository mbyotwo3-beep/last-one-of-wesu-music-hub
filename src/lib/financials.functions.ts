/**
 * financials.functions.ts
 *
 * Comprehensive financial analytics server functions.
 *
 * ARTIST-FACING
 *   getMyEarningsDetail  – full earnings breakdown with payout history
 *                          (payout processing branded as "Wesu+ Payments",
 *                           NOT Lenco — artists never see the provider name)
 *
 * STAFF-FACING (admin + superadmin)
 *   getPlatformFinancials    – platform-wide money dashboard
 *   getAllArtistFinancials    – per-artist balance table
 *   getArtistFinancialsById  – deep-dive into a single artist's money history
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";

// ─────────────────────────────────────────────────────────────
// Artist-facing: my earnings breakdown
// ─────────────────────────────────────────────────────────────

/**
 * Format a payment method code for artist display (no "Lenco" references).
 */
function formatMethodForArtist(code: string): string {
  const normalized = (code ?? "").toLowerCase().replace(/[_-]/g, " ");
  if (normalized.includes("mtn")) return "MTN Mobile Money";
  if (normalized.includes("airtel")) return "Airtel Money";
  if (normalized.includes("zamtel")) return "Zamtel Kwacha";
  if (normalized.includes("card") || normalized.includes("visa") || normalized.includes("mastercard"))
    return "Card Payment";
  if (normalized.includes("bank")) return "Bank Transfer";
  return "Wesu+ Payment";
}

export const getMyEarningsDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: artist } = await supabase
      .from("artists")
      .select("id, name, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!artist) {
      return {
        artist: null,
        totalEarned: 0,
        totalPaidOut: 0,
        totalPending: 0,
        availableBalance: 0,
        payouts: [],
        songEarnings: [],
        albumEarnings: [],
        monthlyEarnings: [],
        recentTransactions: [],
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: songs }, { data: albums }] = await Promise.all([
      supabaseAdmin
        .from("songs")
        .select("id, title, cover_url, price, play_count, status, created_at")
        .eq("artist_id", artist.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("albums")
        .select("id, title, cover_url, price, created_at")
        .eq("artist_id", artist.id),
    ]);

    const songIds = (songs ?? []).map((s) => s.id);
    const albumIds = (albums ?? []).map((a) => a.id);

    let purchases: any[] = [];
    if (songIds.length || albumIds.length) {
      const filters: string[] = [];
      if (songIds.length) filters.push(`song_id.in.(${songIds.join(",")})`);
      if (albumIds.length) filters.push(`album_id.in.(${albumIds.join(",")})`);
      const { data } = await supabaseAdmin
        .from("purchases")
        .select("id, amount, created_at, song_id, album_id")
        .eq("status", "completed")
        .or(filters.join(","))
        .order("created_at", { ascending: false });
      purchases = data ?? [];
    }

    const { data: payouts } = await supabaseAdmin
      .from("payouts")
      .select("id, amount, method_code, destination, status, notes, requested_at, processed_at")
      .eq("artist_id", artist.id)
      .order("requested_at", { ascending: false });

    const allPayouts = payouts ?? [];
    const PAID_STATUSES = ["approved", "paid", "completed"];
    const PENDING_STATUSES = ["pending", "processing"];

    const totalEarned = purchases.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalPaidOut = allPayouts
      .filter((p) => PAID_STATUSES.includes(p.status))
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalPending = allPayouts
      .filter((p) => PENDING_STATUSES.includes(p.status))
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const committed = allPayouts
      .filter((p) => p.status !== "rejected")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const availableBalance = Math.max(0, totalEarned - committed);

    const songEarnings = (songs ?? []).map((song) => {
      const sp = purchases.filter((p) => p.song_id === song.id);
      const earned = sp.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      return {
        id: song.id,
        title: song.title,
        coverUrl: song.cover_url,
        price: Number(song.price ?? 0),
        plays: song.play_count ?? 0,
        status: song.status,
        purchaseCount: sp.length,
        earned,
        createdAt: song.created_at,
      };
    }).sort((a, b) => b.earned - a.earned);

    const albumEarnings = (albums ?? []).map((album) => {
      const ap = purchases.filter((p) => p.album_id === album.id);
      const earned = ap.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      return {
        id: album.id,
        title: album.title,
        coverUrl: album.cover_url,
        price: Number(album.price ?? 0),
        purchaseCount: ap.length,
        earned,
        createdAt: album.created_at,
      };
    }).sort((a, b) => b.earned - a.earned);

    const monthlyMap: Record<string, number> = {};
    for (const p of purchases) {
      const month = p.created_at.slice(0, 7);
      monthlyMap[month] = (monthlyMap[month] ?? 0) + Number(p.amount ?? 0);
    }
    const monthlyEarnings = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }));

    const formattedPayouts = allPayouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      paymentMethod: formatMethodForArtist(p.method_code),
      destination: p.destination,
      status: p.status,
      notes: p.notes,
      requestedAt: p.requested_at,
      processedAt: p.processed_at,
    }));

    const recentTransactions = purchases.slice(0, 10).map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      date: p.created_at,
      songId: p.song_id,
      albumId: p.album_id,
    }));

    return {
      artist,
      totalEarned,
      totalPaidOut,
      totalPending,
      availableBalance,
      payouts: formattedPayouts,
      songEarnings,
      albumEarnings,
      monthlyEarnings,
      recentTransactions,
    };
  });

// ─────────────────────────────────────────────────────────────
// Staff-facing: platform-wide financial overview
// ─────────────────────────────────────────────────────────────

export const getPlatformFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isStaffUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      allPurchases,
      recentPurchases,
      weekPurchases,
      allPayouts,
      pendingPayoutsQ,
      approvedPayoutsQ,
    ] = await Promise.all([
      supabaseAdmin.from("purchases").select("id, amount, created_at").eq("status", "completed"),
      supabaseAdmin
        .from("purchases")
        .select("id, amount, created_at")
        .eq("status", "completed")
        .gte("created_at", thirtyDaysAgo),
      supabaseAdmin
        .from("purchases")
        .select("id, amount, created_at")
        .eq("status", "completed")
        .gte("created_at", sevenDaysAgo),
      supabaseAdmin.from("payouts").select("id, amount, status, requested_at"),
      supabaseAdmin
        .from("payouts")
        .select(
          "id, amount, requested_at, method_code, destination, artist:artists(id, name), label:labels(id, name)",
        )
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
      supabaseAdmin
        .from("payouts")
        .select("id, amount, processed_at, method_code, status, artist:artists(id, name), label:labels(id, name)")
        .in("status", ["approved", "paid", "completed"])
        .order("processed_at", { ascending: false })
        .limit(50),
    ]);

    const totalRevenue = (allPurchases.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const revenue30d = (recentPurchases.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const revenue7d = (weekPurchases.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const totalPaidOut = (allPayouts.data ?? [])
      .filter((p) => ["approved", "paid", "completed"].includes(p.status))
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalPendingAmount = (allPayouts.data ?? [])
      .filter((p) => ["pending", "processing"].includes(p.status))
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalRejectedAmount = (allPayouts.data ?? [])
      .filter((p) => p.status === "rejected")
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    // Retained = total revenue minus all non-rejected payouts
    const totalRetained = Math.max(0, totalRevenue - totalPaidOut - totalPendingAmount);

    // Monthly revenue breakdown
    const monthlyMap: Record<string, number> = {};
    for (const p of allPurchases.data ?? []) {
      const month = p.created_at.slice(0, 7);
      monthlyMap[month] = (monthlyMap[month] ?? 0) + Number(p.amount ?? 0);
    }
    const monthlyRevenue = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }));

    return {
      totalRevenue,
      revenue30d,
      revenue7d,
      totalTransactions: allPurchases.data?.length ?? 0,
      transactions30d: recentPurchases.data?.length ?? 0,
      totalPaidOut,
      totalPendingAmount,
      totalRejectedAmount,
      totalRetained,
      pendingPayoutCount: pendingPayoutsQ.data?.length ?? 0,
      pendingPayoutItems: pendingPayoutsQ.data ?? [],
      approvedPayoutItems: approvedPayoutsQ.data ?? [],
      monthlyRevenue,
    };
  });

// ─────────────────────────────────────────────────────────────
// Staff-facing: per-artist financial balances
// ─────────────────────────────────────────────────────────────

export const getAllArtistFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isStaffUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: artists } = await supabaseAdmin
      .from("artists")
      .select("id, name, verified, created_at")
      .eq("status", "approved")
      .order("name");

    if (!artists || artists.length === 0) return [];

    const [{ data: songs }, { data: albums }, { data: allPurchases }, { data: allPayouts }] =
      await Promise.all([
        supabaseAdmin.from("songs").select("id, artist_id"),
        supabaseAdmin.from("albums").select("id, artist_id"),
        supabaseAdmin.from("purchases").select("id, amount, song_id, album_id").eq("status", "completed"),
        supabaseAdmin.from("payouts").select("id, amount, status, artist_id, requested_at").order("requested_at", { ascending: false }),
      ]);

    const artistSongs: Record<string, Set<string>> = {};
    const artistAlbums: Record<string, Set<string>> = {};
    for (const s of songs ?? []) {
      artistSongs[s.artist_id] = artistSongs[s.artist_id] ?? new Set();
      artistSongs[s.artist_id].add(s.id);
    }
    for (const a of albums ?? []) {
      artistAlbums[a.artist_id] = artistAlbums[a.artist_id] ?? new Set();
      artistAlbums[a.artist_id].add(a.id);
    }

    const PAID = ["approved", "paid", "completed"];
    const PENDING = ["pending", "processing"];

    return artists.map((artist) => {
      const songIds = artistSongs[artist.id] ?? new Set();
      const albumIds = artistAlbums[artist.id] ?? new Set();

      const myPurchases = (allPurchases ?? []).filter(
        (p) => (p.song_id && songIds.has(p.song_id)) || (p.album_id && albumIds.has(p.album_id)),
      );
      const myPayouts = (allPayouts ?? []).filter((p) => p.artist_id === artist.id);

      const totalEarned = myPurchases.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const totalPaidOut = myPayouts.filter((p) => PAID.includes(p.status)).reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const totalPending = myPayouts.filter((p) => PENDING.includes(p.status)).reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const committed = myPayouts.filter((p) => p.status !== "rejected").reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const availableBalance = Math.max(0, totalEarned - committed);

      return {
        artistId: artist.id,
        artistName: artist.name,
        verified: artist.verified,
        totalEarned,
        totalPaidOut,
        totalPending,
        availableBalance,
        payoutCount: myPayouts.length,
        pendingPayoutCount: myPayouts.filter((p) => PENDING.includes(p.status)).length,
        purchaseCount: myPurchases.length,
        lastPayoutDate: myPayouts[0]?.requested_at ?? null,
      };
    });
  });

// ─────────────────────────────────────────────────────────────
// Staff-facing: single-artist financial deep-dive
// ─────────────────────────────────────────────────────────────

export const getArtistFinancialsById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { artistId: string }) => d)
  .handler(async ({ context, data }) => {
    if (!(await isStaffUser(context.supabase, context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: artist } = await supabaseAdmin
      .from("artists")
      .select("id, name, verified, status")
      .eq("id", data.artistId)
      .maybeSingle();

    if (!artist) throw new Error("Artist not found");

    const [{ data: songs }, { data: albums }] = await Promise.all([
      supabaseAdmin
        .from("songs")
        .select("id, title, price, play_count, status, created_at")
        .eq("artist_id", artist.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("albums")
        .select("id, title, price, created_at")
        .eq("artist_id", artist.id),
    ]);

    const songIds = (songs ?? []).map((s) => s.id);
    const albumIds = (albums ?? []).map((a) => a.id);

    let purchases: any[] = [];
    if (songIds.length || albumIds.length) {
      const filters: string[] = [];
      if (songIds.length) filters.push(`song_id.in.(${songIds.join(",")})`);
      if (albumIds.length) filters.push(`album_id.in.(${albumIds.join(",")})`);
      const { data: p } = await supabaseAdmin
        .from("purchases")
        .select("id, amount, created_at, song_id, album_id")
        .eq("status", "completed")
        .or(filters.join(","))
        .order("created_at", { ascending: false });
      purchases = p ?? [];
    }

    // Staff sees full payout details including the internal method_code (lenco_mtn etc.)
    const { data: payouts } = await supabaseAdmin
      .from("payouts")
      .select("id, amount, method_code, destination, status, notes, requested_at, processed_at")
      .eq("artist_id", artist.id)
      .order("requested_at", { ascending: false });

    const allPayouts = payouts ?? [];
    const PAID = ["approved", "paid", "completed"];
    const PENDING = ["pending", "processing"];

    const totalEarned = purchases.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalPaidOut = allPayouts.filter((p) => PAID.includes(p.status)).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalPending = allPayouts.filter((p) => PENDING.includes(p.status)).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const totalRejected = allPayouts.filter((p) => p.status === "rejected").reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const committed = allPayouts.filter((p) => p.status !== "rejected").reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const availableBalance = Math.max(0, totalEarned - committed);

    const songEarnings = (songs ?? []).map((song) => {
      const sp = purchases.filter((p) => p.song_id === song.id);
      return {
        id: song.id,
        title: song.title,
        price: Number(song.price ?? 0),
        plays: song.play_count ?? 0,
        status: song.status,
        purchaseCount: sp.length,
        earned: sp.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      };
    }).sort((a, b) => b.earned - a.earned);

    const monthlyMap: Record<string, number> = {};
    for (const p of purchases) {
      const month = p.created_at.slice(0, 7);
      monthlyMap[month] = (monthlyMap[month] ?? 0) + Number(p.amount ?? 0);
    }
    const monthlyEarnings = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount }));

    return {
      artist,
      totalEarned,
      totalPaidOut,
      totalPending,
      totalRejected,
      availableBalance,
      purchaseCount: purchases.length,
      payouts: allPayouts.map((p) => ({ ...p, amount: Number(p.amount ?? 0) })),
      songEarnings,
      monthlyEarnings,
    };
  });
