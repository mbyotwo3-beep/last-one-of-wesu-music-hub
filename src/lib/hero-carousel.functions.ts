import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ───────────────────────────────────────────────────
export type HeroLinkTarget = "_self" | "_blank";

export function normalizeLinkTarget(v: unknown): HeroLinkTarget {
  return v === "_blank" ? "_blank" : "_self";
}

export interface HeroCarouselSlide {
  id: string;
  title: string;
  description: string;
  image_url: string;
  video_url?: string | null;
  cta_text: string;
  cta_link: string;
  cta_external: boolean;
  link_target: HeroLinkTarget;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("superadmin")) {
    throw new Error("Forbidden: staff only");
  }
}

// ─── Public: fetch all active hero slides ─────
export const getActiveHeroSlides = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicSupabase } = await import("./supabase-public.server");
  const supabase = getPublicSupabase();
  const { data, error } = await (supabase as any)
    .from("hero_carousel_slides")
    .select("*")
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HeroCarouselSlide[];
});

// ─── Staff: fetch ALL hero slides (including inactive) ─
export const getAllHeroSlides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("hero_carousel_slides")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as HeroCarouselSlide[];
  });

// ─── Staff: create a new hero slide ───────────────────────────
export const createHeroSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      title: string;
      description: string;
      image_url: string;
      video_url?: string;
      cta_text: string;
      cta_link: string;
      cta_external?: boolean;
      link_target?: string;
      position?: number;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Default position = after last slide
    let pos = data.position ?? 0;
    if (!data.position) {
      const { count } = await (supabaseAdmin as any)
        .from("hero_carousel_slides")
        .select("id", { count: "exact", head: true });
      pos = count ?? 0;
    }
    const { data: row, error } = await (supabaseAdmin as any)
      .from("hero_carousel_slides")
      .insert({
        title: data.title,
        description: data.description,
        image_url: data.image_url,
        video_url: data.video_url ?? null,
        cta_text: data.cta_text,
        cta_link: data.cta_link,
        cta_external: data.cta_external ?? false,
        link_target: normalizeLinkTarget(data.link_target),
        position: pos,
        active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Staff: update hero slide ────────────────────────
export const updateHeroSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      title?: string;
      description?: string;
      image_url?: string;
      video_url?: string | null;
      cta_text?: string;
      cta_link?: string;
      cta_external?: boolean;
      link_target?: string;
      position?: number;
      active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { updated_at: new Date().toISOString() };
    const nonEmpty = (v: string | undefined, field: string) => {
      if (v === undefined) return;
      if (!v.trim()) throw new Error(`${field} cannot be empty`);
      patch[field] = v.trim();
    };
    nonEmpty(data.title, "title");
    nonEmpty(data.description, "description");
    nonEmpty(data.image_url, "image_url");
    nonEmpty(data.cta_text, "cta_text");
    nonEmpty(data.cta_link, "cta_link");
    if (data.cta_external !== undefined) patch.cta_external = data.cta_external;
    if (data.link_target !== undefined) patch.link_target = normalizeLinkTarget(data.link_target);
    if (data.position !== undefined) patch.position = data.position;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await (supabaseAdmin as any)
      .from("hero_carousel_slides")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Staff: delete a hero slide ────────
export const deleteHeroSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("hero_carousel_slides")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
