import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function audit(
  actorId: string,
  action: string,
  target_type?: string,
  target_id?: string,
  meta: any = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("audit_log")
    .insert({ actor_id: actorId, action, target_type, target_id, meta });
}

// Back-compat: admin functions previously used assertAdmin checking 'admin'. Now allow staff (admin OR superadmin).
async function assertAdmin(supabase: any, userId: string) {
  await assertStaff(supabase, userId);
}

export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [users, songs, subs, revenue] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("songs").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("payment_transactions")
        .select("amount")
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const monthlyRevenue = (revenue.data ?? []).reduce(
      (s, r: { amount: number }) => s + Number(r.amount ?? 0),
      0,
    );

    return {
      totalUsers: users.count ?? 0,
      totalSongs: songs.count ?? 0,
      premiumSubscribers: subs.count ?? 0,
      monthlyRevenueZmw: monthlyRevenue,
    };
  });

export const getRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [songs, tx] = await Promise.all([
      supabaseAdmin
        .from("songs")
        .select("id,title,created_at,artist:artists(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("payment_transactions")
        .select("id,amount,method_code,status,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    return {
      recentSongs: songs.data ?? [],
      recentTransactions: tx.data ?? [],
    };
  });

// ---------- Moderation ----------

export const listPendingSongs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("songs")
      .select("id,title,created_at,status,artist:artists(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const moderateSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected" | "taken_down" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("songs")
      .update({ status: data.status } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, `song.${data.status}`, "song", data.id);
    return { ok: true };
  });

export const listPendingArtists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("artists")
      .select("id,name,bio,genre,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const moderateArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected"; verified?: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { status: data.status };
    if (data.verified !== undefined) patch.verified = data.verified;
    const { error } = await supabaseAdmin.from("artists").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    // If approved, also grant the user the 'artist' role
    if (data.status === "approved") {
      const { data: artist } = await supabaseAdmin
        .from("artists")
        .select("user_id")
        .eq("id", data.id)
        .single();
      if (artist?.user_id) {
        await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: artist.user_id, role: "artist" } as any, {
            onConflict: "user_id,role",
          });
      }
    }
    await audit(context.userId, `artist.${data.status}`, "artist", data.id, {
      verified: data.verified,
    });
    return { ok: true };
  });

// ---------- Labels moderation ----------

export const listPendingLabels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("labels")
      .select("id, name, slug, bio, contact_email, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const moderateLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "approved" | "rejected" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("labels")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, `label.${data.status}`, "label", data.id);
    return { ok: true };
  });

export const listAllSplits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("revenue_splits")
      .select("id, amount, pct, payee_role, created_at, transaction_id")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

// ---------- Artist Status Diagnostics ----------

export const getArtistDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDiagnosticInfo, formatDiagnosticReport } = await import("./artist-status-utils");
    
    const info = await getDiagnosticInfo(supabaseAdmin);
    const report = formatDiagnosticReport(info);
    
    return {
      info,
      report,
    };
  });
