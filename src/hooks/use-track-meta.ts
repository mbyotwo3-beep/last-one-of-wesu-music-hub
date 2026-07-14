import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches artist_id, album_id, price, and artist name for the current
 * playing track so the player can render Spotify-style links to the
 * artist and album pages and a Buy CTA when the track is paid.
 */
export function useTrackMeta(songId: string | null | undefined) {
  return useQuery({
    queryKey: ["track-meta", songId],
    enabled: !!songId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id, artist_id, album_id, price, artists:artist_id(id,name), albums:album_id(id,title)")
        .eq("id", songId!)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
  });
}
