import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSavedAlbumIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("saved_albums")
      .select("album_id")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => r.album_id as string);
  });

export const saveAlbum = createServerFn({ method: "POST" })
  .validator((d: { album_id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("saved_albums")
      .insert({ user_id: userId, album_id: data.album_id } as any);
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const unsaveAlbum = createServerFn({ method: "POST" })
  .validator((d: { album_id: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("saved_albums")
      .delete()
      .eq("user_id", userId)
      .eq("album_id", data.album_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
