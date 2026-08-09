import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ───────────────────────────────────────────────────
export interface CarouselItem {
  id: string;
  carousel_id: string;
  title: string;
  subtitle?: string | null;
  image_url: string;
  link_url: string;
  position: number;
  created_at: string;
}

export interface Carousel {
  id: string;
  title: string;
  subtitle?: string | null;
  show_all_link?: string | null;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  items: CarouselItem[];
}

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: staff only");
}

// ─── Public: fetch all active carousels with their items ─────
export const getActiveCarousels = createServerFn({ method: "GET" }).handler(async () => {
  const { getPublicSupabase } = await import("./supabase-public.server");
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from("home_carousels")
    .select("*, items:home_carousel_items(id,title,subtitle,image_url,link_url,position)")
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  // Sort items by position within each carousel
  return (data ?? []).map((c: any) => ({
    ...c,
    items: (c.items ?? []).sort((a: CarouselItem, b: CarouselItem) => a.position - b.position),
  })) as Carousel[];
});

// ─── Staff: fetch ALL carousels (including inactive) with items ─
export const getAllCarousels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("home_carousels")
      .select("*, items:home_carousel_items(id,title,subtitle,image_url,link_url,position)")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c: any) => ({
      ...c,
      items: (c.items ?? []).sort((a: CarouselItem, b: CarouselItem) => a.position - b.position),
    })) as Carousel[];
  });

// ─── Staff: create a new carousel ───────────────────────────
export const createCarousel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { title: string; subtitle?: string; show_all_link?: string; position?: number }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Default position = after last carousel
    let pos = data.position ?? 0;
    if (!data.position) {
      const { count } = await supabaseAdmin
        .from("home_carousels")
        .select("id", { count: "exact", head: true });
      pos = count ?? 0;
    }
    const { data: row, error } = await supabaseAdmin
      .from("home_carousels")
      .insert({
        title: data.title,
        subtitle: data.subtitle ?? null,
        show_all_link: data.show_all_link ?? null,
        position: pos,
        active: true,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Staff: update carousel metadata ────────────────────────
export const updateCarousel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      title?: string;
      subtitle?: string | null;
      show_all_link?: string | null;
      position?: number;
      active?: boolean;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.subtitle !== undefined) patch.subtitle = data.subtitle;
    if (data.show_all_link !== undefined) patch.show_all_link = data.show_all_link;
    if (data.position !== undefined) patch.position = data.position;
    if (data.active !== undefined) patch.active = data.active;
    const { error } = await supabaseAdmin
      .from("home_carousels")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Staff: delete a carousel (cascade removes items) ────────
export const deleteCarousel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("home_carousels")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Staff: add an item to a carousel ────────────────────────
export const addCarouselItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      carousel_id: string;
      title: string;
      subtitle?: string;
      image_url: string;
      link_url: string;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Position = after last item in this carousel
    const { count } = await supabaseAdmin
      .from("home_carousel_items")
      .select("id", { count: "exact", head: true })
      .eq("carousel_id", data.carousel_id);
    const { data: row, error } = await supabaseAdmin
      .from("home_carousel_items")
      .insert({
        carousel_id: data.carousel_id,
        title: data.title,
        subtitle: data.subtitle ?? null,
        image_url: data.image_url,
        link_url: data.link_url,
        position: count ?? 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ─── Staff: update a carousel item ───────────────────────────
export const updateCarouselItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      title?: string;
      subtitle?: string | null;
      image_url?: string;
      link_url?: string;
      position?: number;
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.subtitle !== undefined) patch.subtitle = data.subtitle;
    if (data.image_url !== undefined) patch.image_url = data.image_url;
    if (data.link_url !== undefined) patch.link_url = data.link_url;
    if (data.position !== undefined) patch.position = data.position;
    const { error } = await supabaseAdmin
      .from("home_carousel_items")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Staff: delete a carousel item ───────────────────────────
export const deleteCarouselItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("home_carousel_items")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
