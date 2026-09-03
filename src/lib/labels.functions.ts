import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaffUser } from "./roles";

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

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Resolve a label only for its owner or a member of platform staff. */
async function assertLabelManager(client: unknown, userId: string, labelId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [isStaff, result] = await Promise.all([
    isStaffUser(client, userId),
    supabaseAdmin
      .from("labels")
      .select("id, owner_user_id, status, commission_pct")
      .eq("id", labelId)
      .maybeSingle(),
  ]);
  if (result.error) throw new Error(result.error.message);
  if (!result.data || (!isStaff && result.data.owner_user_id !== userId)) {
    throw new Error("Forbidden");
  }
  return result.data as {
    id: string;
    owner_user_id: string;
    status: string;
    commission_pct: number;
  };
}

export const applyForLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string; bio?: string; contact_email?: string; logo_url?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("labels")
      .select("id, status")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (existing) {
      throw new Error(
        existing.status === "rejected"
          ? "Your label application was rejected. Contact support before applying again."
          : "You already have a label application.",
      );
    }
    const slug = slugify(data.name) + "-" + Math.random().toString(36).slice(2, 6);
    const { data: row, error } = await supabase
      .from("labels")
      .insert({
        name: data.name,
        slug,
        owner_user_id: userId,
        bio: data.bio ?? null,
        contact_email: data.contact_email ?? null,
        logo_url: data.logo_url ?? null,
      } as any)
      .select("id, slug, status")
      .single();
    if (error) throw new Error(error.message);
    await audit(userId, "label.apply", "label", row!.id);
    return row;
  });

export const updateLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { id: string; name?: string; bio?: string; contact_email?: string; logo_url?: string }) =>
      d,
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    await assertLabelManager(context.supabase, userId, data.id);
    const patch: any = {};
    for (const k of ["name", "bio", "contact_email", "logo_url"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("labels").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(userId, "label.update", "label", data.id, patch);
    return { ok: true };
  });

export const getMyLabel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Read via admin client because contact_email is column-restricted from
    // the authenticated Data API role; we still scope by owner_user_id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("labels")
      .select("*")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const getLabelBySlug = createServerFn({ method: "GET" })
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: label } = await sb
      .from("labels")
      .select("id, name, slug, bio, logo_url, status")
      .eq("slug", data.slug)
      .eq("status", "approved")
      .maybeSingle();
    if (!label) return null;
    const { data: roster } = await sb
      .from("artists")
      .select("id, name, avatar_url, monthly_listeners")
      .eq("label_id", (label as any).id)
      .eq("status", "approved");
    return { label, roster: roster ?? [] };
  });

export const listApprovedLabels = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .from("labels")
    .select("id, name, slug, bio, logo_url")
    .eq("status", "approved")
    .order("name");
  return data ?? [];
});

export const inviteArtistToLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { label_id: string; artist_id: string; royalty_pct?: number }) => d)
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const label = await assertLabelManager(context.supabase, userId, data.label_id);
    if (label.status !== "approved") throw new Error("Only approved labels can invite artists");

    // The label's commission is the default; a manager may negotiate another
    // royalty for a particular artist, within the database's 0–100 bound.
    const royalty = data.royalty_pct ?? 100 - Number(label.commission_pct ?? 15);
    if (!Number.isFinite(royalty) || royalty < 0 || royalty > 100) {
      throw new Error("royalty_pct must be between 0 and 100");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: artist }, { data: existing }] = await Promise.all([
      supabaseAdmin.from("artists").select("id, status").eq("id", data.artist_id).maybeSingle(),
      supabaseAdmin
        .from("label_artists")
        .select("id, status")
        .eq("label_id", data.label_id)
        .eq("artist_id", data.artist_id)
        .maybeSingle(),
    ]);
    if (!artist || artist.status !== "approved") throw new Error("Artist is not approved");
    if (existing) throw new Error(`Artist already has a ${existing.status} relationship with this label`);

    const { error } = await supabaseAdmin.from("label_artists").insert({
      label_id: data.label_id,
      artist_id: data.artist_id,
      royalty_pct: royalty,
      status: "invited",
    } as any);
    if (error) throw new Error(error.message);
    await audit(userId, "label.invite_artist", "label", data.label_id, {
      artist_id: data.artist_id,
    });
    return { ok: true };
  });

export const respondToLabelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; accept: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ownArtist } = await supabaseAdmin
      .from("artists")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownArtist) throw new Error("Artist profile required");
    const { data: invite } = await supabaseAdmin
      .from("label_artists")
      .select("label_id, artist_id, status")
      .eq("id", data.id)
      .eq("artist_id", ownArtist.id)
      .maybeSingle();
    if (!invite || invite.status !== "invited") throw new Error("Label invitation not found");

    if (data.accept) {
      const { data: row, error } = await supabase
        .from("label_artists")
        .update({ status: "active", joined_at: new Date().toISOString() } as any)
        .eq("id", data.id)
        .select("label_id, artist_id")
        .single();
      if (error) throw new Error(error.message);
      // attach label to artist
      await supabaseAdmin
        .from("artists")
        .update({ label_id: (row as any).label_id })
        .eq("id", (row as any).artist_id);
      await audit(userId, "label.invite.accept", "label_artists", data.id);
    } else {
      const { error } = await supabase
        .from("label_artists")
        .update({ status: "declined" } as any)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(userId, "label.invite.decline", "label_artists", data.id);
    }
    return { ok: true };
  });

export const setArtistRoyalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; royalty_pct: number }) => d)
  .handler(async ({ context, data }) => {
    if (!Number.isFinite(data.royalty_pct) || data.royalty_pct < 0 || data.royalty_pct > 100) {
      throw new Error("royalty_pct must be between 0 and 100");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Look up the row and verify caller is the label owner (or staff).
    const { data: row } = await supabaseAdmin
      .from("label_artists")
      .select("label_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Roster entry not found");

    await assertLabelManager(context.supabase, context.userId, (row as any).label_id);

    const { error } = await context.supabase
      .from("label_artists")
      .update({ royalty_pct: data.royalty_pct } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "label.royalty.set", "label_artists", data.id, {
      royalty_pct: data.royalty_pct,
    });
    return { ok: true };
  });

export const removeArtistFromLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("label_artists")
      .select("artist_id, label_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Roster entry not found");
    await assertLabelManager(context.supabase, context.userId, (row as any).label_id);
    const { error } = await context.supabase
      .from("label_artists")
      .update({ status: "removed" } as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("artists")
      .update({ label_id: null })
      .eq("id", (row as any).artist_id);
    await audit(context.userId, "label.remove_artist", "label_artists", data.id);
    return { ok: true };
  });

export const listLabelRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { label_id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertLabelManager(context.supabase, context.userId, data.label_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("label_artists")
      .select(
        "id, status, royalty_pct, joined_at, artists!inner(id, name, avatar_url, monthly_listeners)",
      )
      .eq("label_id", data.label_id);
    return rows ?? [];
  });

export const listLabelRevenue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { label_id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertLabelManager(context.supabase, context.userId, data.label_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: splits } = await supabaseAdmin
      .from("revenue_splits")
      .select("amount, created_at, payee_role, artist_id")
      .eq("label_id", data.label_id)
      .order("created_at", { ascending: false })
      .limit(200);
    const total = (splits ?? []).reduce((s, r: any) => s + Number(r.amount || 0), 0);
    return { total, splits: splits ?? [] };
  });

/**
 * Calculate available balance for label payout
 */
async function getLabelAvailableBalance(supabase: any, labelId: string): Promise<number> {
  // Get total earned from revenue splits
  const { data: splits } = await supabase
    .from("revenue_splits")
    .select("amount")
    .eq("label_id", labelId)
    .eq("payee_role", "label");
  
  const totalEarned = (splits ?? []).reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
  
  // Get total already paid or pending
  const { data: payouts } = await supabase
    .from("payouts")
    .select("amount")
    .eq("label_id", labelId)
    .in("status", ["pending", "approved", "processing", "paid", "completed"]);
  
  const totalPaid = (payouts ?? []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  
  return Math.max(0, totalEarned - totalPaid);
}

export const requestLabelPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { label_id: string; amount: number; method_code: string; destination: string }) => d,
  )
  .handler(async ({ context, data }) => {
    // SECURITY: Validate amount
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw new Error("Payout amount must be a positive number");
    }
    
    if (data.amount > 1000000) {
      throw new Error("Payout amount cannot exceed ZMW 1,000,000");
    }
    const label = await assertLabelManager(context.supabase, context.userId, data.label_id);
    if (label.owner_user_id !== context.userId) {
      throw new Error("Only the label owner can request a label payout");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // SECURITY: Check available balance
    const available = await getLabelAvailableBalance(supabaseAdmin, data.label_id);
    if (data.amount > available) {
      throw new Error(
        `Insufficient balance. Available: ZMW ${available.toFixed(2)}, Requested: ZMW ${data.amount.toFixed(2)}`
      );
    }
    
    const { error } = await context.supabase.from("payouts").insert({
      label_id: data.label_id,
      artist_id: null,
      amount: data.amount,
      method_code: data.method_code,
      destination: data.destination,
      net_amount: data.amount,
    } as any);
    if (error) throw new Error(error.message);
    await audit(context.userId, "label.payout.request", "label", data.label_id, {
      amount: data.amount,
      available_balance: available
    });
    return { ok: true };
  });
