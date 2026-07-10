import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperadmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_superadmin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: superadmin only");
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

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p: any) => ({ ...p, roles: rolesByUser.get(p.user_id) ?? [] }));
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { user_id: string; role: "user" | "artist" | "admin" | "superadmin" }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);

    // When granting the artist role, ensure an approved artist profile exists.
    // This handles the case where the user never went through the application
    // flow, so they appear on the public artists listing immediately.
    if (data.role === "artist") {
      const { data: existing } = await supabaseAdmin
        .from("artists")
        .select("id, status")
        .eq("user_id", data.user_id)
        .maybeSingle();

      if (existing) {
        // Artist profile exists — make sure it's approved.
        if (existing.status !== "approved") {
          await supabaseAdmin
            .from("artists")
            .update({ status: "approved", verified: true } as any)
            .eq("id", existing.id);
        }
      } else {
        // No artist profile yet — fetch the user's display name and create one.
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("user_id", data.user_id)
          .maybeSingle();
        const artistName = (profile as any)?.full_name || "Artist";
        await supabaseAdmin.from("artists").insert({
          user_id: data.user_id,
          name: artistName,
          status: "approved",
          verified: true,
        } as any);
      }
    }

    await audit(context.userId, "role.grant", "user", data.user_id, { role: data.role });
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { user_id: string; role: "user" | "artist" | "admin" | "superadmin" }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await audit(context.userId, "role.revoke", "user", data.user_id, { role: data.role });
    return { ok: true };
  });

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id?: string;
      name: string;
      price_zmw: number;
      description?: string;
      is_active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: any = {
      name: data.name,
      price_zmw: data.price_zmw,
      description: data.description ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) row.id = data.id;
    const { error } = await supabaseAdmin.from("subscription_plans").upsert(row);
    if (error) throw new Error(error.message);
    await audit(context.userId, "plan.upsert", "plan", data.id ?? "new", { name: data.name });
    return { ok: true };
  });

export const togglePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { code: string; is_enabled: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("payment_methods")
      .update({ is_enabled: data.is_enabled })
      .eq("code", data.code);
    if (error) throw new Error(error.message);
    await audit(context.userId, "payment_method.toggle", "payment_method", data.code, {
      is_enabled: data.is_enabled,
    });
    return { ok: true };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { key: string; value: Record<string, unknown> }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("platform_settings").upsert({
      key: data.key,
      value: data.value as any,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "settings.update", "setting", data.key, data.value);
    return { ok: true };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("payouts")
      .select("*, artist:artists(name)")
      .order("requested_at", { ascending: false });
    return data ?? [];
  });

export const decidePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; decision: "approved" | "rejected"; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("payouts")
      .update({
        status: data.decision,
        notes: data.notes ?? null,
        processed_at: new Date().toISOString(),
        processed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, `payout.${data.decision}`, "payout", data.id, {
      notes: data.notes,
    });
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Restrict to staff (admins / superadmins) only.
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isStaff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "superadmin");
    if (!isStaff) throw new Error("Not authorized");

    const { data } = await supabaseAdmin.from("platform_settings").select("key, value");
    const out: Record<string, any> = {};
    (data ?? []).forEach((r: any) => {
      out[r.key] = r.value;
    });
    return out;
  });

// claimFirstSuperadmin removed: the superadmin is already claimed and roles are
// now granted only by an existing superadmin via grantRole.

/**
 * Manually mark a payment_transaction as paid. Useful for testing the split
 * pipeline before DPO Pay is wired. Triggers compute_revenue_splits().
 */
export const markTransactionPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { transaction_id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "paid" })
      .eq("id", data.transaction_id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "tx.mark_paid", "transaction", data.transaction_id);
    return { ok: true };
  });

export const setPlatformCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { pct: number }) => d)
  .handler(async ({ context, data }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("platform_settings").upsert({
      key: "commission_pct",
      value: data.pct as any,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    await audit(context.userId, "commission.set", "setting", "commission_pct", { pct: data.pct });
    return { ok: true };
  });
