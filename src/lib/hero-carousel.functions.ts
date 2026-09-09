import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ───────────────────────────────────────────────────
export interface HeroCarouselSlide {
  id: string;
  title: string;
  description: string;
  image_url: string;
  video_url?: string | null;
  cta_text: string;
  cta_link: string;
  cta_external: boolean;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
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
      position?: number;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Default position = after last slide
    let pos = data.position ?? 0;
    if (data.position === undefined) {
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
      position?: number;
      active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.image_url !== undefined) patch.image_url = data.image_url;
    if (data.video_url !== undefined) patch.video_url = data.video_url;
    if (data.cta_text !== undefined) patch.cta_text = data.cta_text;
    if (data.cta_link !== undefined) patch.cta_link = data.cta_link;
    if (data.cta_external !== undefined) patch.cta_external = data.cta_external;
    if (data.position !== undefined) patch.position = data.position;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await (supabaseAdmin as any)
      .from("hero_carousel_slides")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Staff: move a slide one place up or down while keeping positions contiguous. */
export const moveHeroSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; direction: "up" | "down" }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("hero_carousel_slides")
      .select("id")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const orderedIds = (rows ?? []).map((row: { id: string }) => row.id);
    const index = orderedIds.indexOf(data.id);
    const targetIndex = data.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) {
      return { ok: true };
    }

    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    const updates = orderedIds.map((id, position) =>
      (supabaseAdmin as any)
        .from("hero_carousel_slides")
        .update({ position, updated_at: new Date().toISOString() })
        .eq("id", id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((result: { error: unknown }) => result.error);
    if (failed?.error) throw new Error((failed.error as { message: string }).message);
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
