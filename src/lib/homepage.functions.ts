import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPublicSupabase } from "./supabase-public.server";
import { isSuperadminUser } from "./roles";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHELF_TYPES: ShelfType[] = [
  "new_music",
  "hot_tracks",
  "featured_artists",
  "must_have_albums",
  "recently_played",
  "by_genre",
  "by_artist",
  "by_playlist",
  "custom",
];
const PAGES = ["home", "browse", "listen-now"];

export const saveHomepageLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { page: string; layout: HomepageLayout }) => d)
  .handler(async ({ data, context }) => {
    const isSuper = await isSuperadminUser(context.supabase, context.userId);
    if (!isSuper) throw new Error("Forbidden");
    if (!PAGES.includes(data.page)) throw new Error("Invalid page");

    // Sanitize shelves: unknown types, overlong titles, and malformed IDs
    // would otherwise render dead homepage sections.
    const shelves = (data.layout.shelves ?? []).slice(0, 20).map((s) => {
      if (!SHELF_TYPES.includes(s.type)) throw new Error(`Invalid shelf type: ${s.type}`);
      const q = s.query ?? {};
      if (q.artistId && !UUID_RE.test(q.artistId)) throw new Error("Invalid artistId");
      if (q.playlistId && !UUID_RE.test(q.playlistId)) throw new Error("Invalid playlistId");
      if (Array.isArray(q.songIds)) {
        for (const id of q.songIds.slice(0, 50)) {
          if (!UUID_RE.test(id)) throw new Error("Invalid song id in shelf");
        }
      }
      return {
        id: String(s.id).slice(0, 64),
        type: s.type,
        title: String(s.title ?? "").slice(0, 120),
        visible: s.visible !== false,
        query: {
          genre: q.genre ? String(q.genre).slice(0, 60) : undefined,
          artistId: q.artistId,
          playlistId: q.playlistId,
          songIds: q.songIds?.slice(0, 50),
        },
      };
    });
    const layout: HomepageLayout = {
      hero_slides: (data.layout.hero_slides ?? []).slice(0, 10),
      shelves,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "homepage_layouts")
      .maybeSingle();
    const current = (existing?.value ?? {}) as unknown as Record<string, HomepageLayout>;
    const next = { ...current, [data.page]: layout };
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: "homepage_layouts", value: next as any }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
