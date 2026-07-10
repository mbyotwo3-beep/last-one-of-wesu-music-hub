import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureStaff(supabase: any, userId: string) {
  const { data } = await supabase.rpc("is_staff", { _user_id: userId });
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

export const listFeaturedSlots = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.from("featured_slots").select("*").eq("active", true).order("position");
  return data ?? [];
});

export const upsertFeaturedSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id?: string;
      slot_type: string;
      target_type: string;
      target_id: string;
      position?: number;
      title?: string;
      subtitle?: string;
      image_url?: string;
      starts_at?: string;
      ends_at?: string;
      active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    const row: any = { ...data, created_by: context.userId };
    const { error } = data.id
      ? await context.supabase.from("featured_slots").update(row).eq("id", data.id)
      : await context.supabase.from("featured_slots").insert(row);
    if (error) throw new Error(error.message);
    await audit(context.userId, "feature.upsert", "featured_slot", data.id, data);
    return { ok: true };
  });

export const removeFeaturedSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureStaff(context.supabase, context.userId);
    await context.supabase.from("featured_slots").delete().eq("id", data.id);
    await audit(context.userId, "feature.remove", "featured_slot", data.id);
    return { ok: true };
  });

export const listAllFeaturedAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("featured_slots")
      .select("*")
      .order("slot_type")
      .order("position");
    return data ?? [];
  });

// Public helper to resolve targets into display payloads for the home page.
export const getHomeFeatured = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: slots } = await sb
    .from("featured_slots")
    .select("*")
    .eq("active", true)
    .order("position");
  if (!slots?.length) return [];
  const resolved = await Promise.all(
    slots.map(async (s: any) => {
      let target: any = null;
      if (s.target_type === "song") {
        const { data } = await sb
          .from("songs")
          .select("id, title, cover_url, artist_id, price")
          .eq("id", s.target_id)
          .maybeSingle();
        target = data;
      } else if (s.target_type === "album") {
        const { data } = await sb
          .from("albums")
          .select("id, title, cover_url, artist_id")
          .eq("id", s.target_id)
          .maybeSingle();
        target = data;
      } else if (s.target_type === "artist") {
        const { data } = await sb
          .from("artists")
          .select("id, name, avatar_url")
          .eq("id", s.target_id)
          .maybeSingle();
        target = data;
      } else if (s.target_type === "label") {
        const { data } = await sb
          .from("labels")
          .select("id, name, slug, logo_url")
          .eq("id", s.target_id)
          .maybeSingle();
        target = data;
      }
      return { ...s, target };
    }),
  );
  return resolved.filter((r) => r.target);
});
