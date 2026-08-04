import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";

export type ShelfType =
  | "new_music"
  | "hot_tracks"
  | "featured_artists"
  | "must_have_albums"
  | "recently_played"
  | "by_genre"
  | "by_artist"
  | "by_playlist"
  | "custom";

export interface HomepageShelf {
  id: string;
  type: ShelfType;
  title: string;
  visible: boolean;
  query?: { genre?: string; artistId?: string; playlistId?: string; songIds?: string[] };
}

export interface HeroSlide {
  id: string;
  title: string;
  subtitle?: string;
  cover_url?: string;
  link_type?: "song" | "album" | "artist" | "playlist" | "url";
  link_id?: string;
  link_url?: string;
}

export interface HomepageLayout {
  hero_slides: HeroSlide[];
  shelves: HomepageShelf[];
}

export const DEFAULT_LAYOUTS: Record<string, HomepageLayout> = {
  home: {
    hero_slides: [],
    shelves: [
      { id: "s1", type: "recently_played", title: "Recently Played", visible: true },
      { id: "s2", type: "new_music", title: "Made For You", visible: true },
      { id: "s3", type: "hot_tracks", title: "Top Tracks", visible: true },
    ],
  },
  browse: {
    hero_slides: [],
    shelves: [
      { id: "b1", type: "new_music", title: "New Music", visible: true },
      { id: "b2", type: "must_have_albums", title: "Must-Have Albums", visible: true },
      { id: "b3", type: "hot_tracks", title: "Hot Tracks", visible: true },
      { id: "b4", type: "featured_artists", title: "Featured Artists", visible: true },
    ],
  },
  "listen-now": {
    hero_slides: [],
    shelves: [
      { id: "l1", type: "new_music", title: "New Music", visible: true },
      { id: "l2", type: "hot_tracks", title: "Trending Now", visible: true },
    ],
  },
};

async function readLayouts(): Promise<Record<string, HomepageLayout>> {
  const supabase = getPublicSupabase();
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "homepage_layouts")
    .maybeSingle();
  const stored = (data?.value ?? {}) as unknown as Record<string, HomepageLayout>;
  return { ...DEFAULT_LAYOUTS, ...stored };
}

export const getHomepageLayout = createServerFn({ method: "GET" })
  .validator((d: { page: string }) => d)
  .handler(async ({ data }) => {
    const layouts = await readLayouts();
    return layouts[data.page] ?? DEFAULT_LAYOUTS[data.page] ?? { hero_slides: [], shelves: [] };
  });

export const getAllHomepageLayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isSuper = await isSuperadminUser(context.supabase, context.userId);
    if (!isSuper) throw new Error("Forbidden");
    return await readLayouts();
  });

export const saveHomepageLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { page: string; layout: HomepageLayout }) => d)
  .handler(async ({ data, context }) => {
    const isSuper = await isSuperadminUser(context.supabase, context.userId);
    if (!isSuper) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "homepage_layouts")
      .maybeSingle();
    const current = ((existing?.value ?? {}) as unknown) as Record<string, HomepageLayout>;
    const next = { ...current, [data.page]: data.layout };
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: "homepage_layouts", value: next as any }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
