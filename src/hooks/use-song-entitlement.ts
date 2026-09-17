import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Whether the signed-in listener may download / fully play a song:
 * free tracks are always fine, paid tracks need a completed single or
 * album purchase (same rule the server enforces in getDownloadAudioUrl).
 * Used to swap Buy CTAs for Download controls after purchase.
 */
export function useSongEntitlement(
  songId: string | null | undefined,
  price: number | null | undefined,
  albumId?: string | null,
) {
  const { user } = useAuth();
  const paid = Number(price ?? 0) > 0;

  const purchaseQ = useQuery({
    queryKey: ["song-entitlement", songId, user?.id],
    enabled: !!user && !!songId && paid,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: single }, { data: album }] = await Promise.all([
        supabase
          .from("purchases")
          .select("id")
          .eq("user_id", user!.id)
          .eq("song_id", songId!)
          .eq("status", "completed")
          .maybeSingle(),
        albumId
          ? supabase
              .from("purchases")
              .select("id")
              .eq("user_id", user!.id)
              .eq("album_id", albumId)
              .eq("status", "completed")
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return !!(single || album);
    },
  });

  return {
    owned: !paid || purchaseQ.data === true,
    loading: paid && purchaseQ.isLoading,
  };
}
