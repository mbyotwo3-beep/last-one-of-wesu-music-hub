import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Whether the signed-in listener may download / fully play a song:
 * free tracks are always fine, paid tracks need a completed single or
 * album purchase (same rule the server enforces in getDownloadAudioUrl),
 * or the caller is the song's artist owner (same exception). There is no
 * staff override — admins and superadmins buy their music.
 * Used to swap Buy CTAs for Download controls after purchase.
 */
export function useSongEntitlement(
  songId: string | null | undefined,
  price: number | null | undefined,
  albumId?: string | null,
) {
  const { user } = useAuth();
  const paid = Number(price ?? 0) > 0;
  const bypassQ = useEntitlementBypass(user?.id, songId, paid);

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
          .limit(1)
          .maybeSingle(),
        albumId
          ? supabase
              .from("purchases")
              .select("id")
              .eq("user_id", user!.id)
              .eq("album_id", albumId)
              .eq("status", "completed")
              // Album fulfilment writes a receipt row plus one row per track,
              // all with album_id set. maybeSingle() would throw on the second
              // one and leave the track looking unpurchased — the Buy button
              // would come back after the listener had already paid.
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return !!(single || album);
    },
  });

  return {
    owned: !paid || bypassQ.data === true || purchaseQ.data === true,
    loading: paid && (purchaseQ.isLoading || bypassQ.isLoading),
  };
}

function useEntitlementBypass(
  userId: string | undefined,
  songId: string | null | undefined,
  paid: boolean,
) {
  return useQuery({
    queryKey: ["song-entitlement-bypass", userId, songId],
    enabled: !!userId && !!songId && paid,
    staleTime: 60_000,
    queryFn: async () => {
      // Owner-artist only — this mirrors the server exactly. The staff leg is
      // gone: admin and superadmin pay for music like any listener, so the UI
      // keeps showing Buy for paid songs they have not bought instead of
      // silently swapping in a Download control the server would refuse.
      const { data: song } = await supabase.from("songs").select("artist_id").eq("id", songId!).maybeSingle();
      const artistId = (song as { artist_id?: string | null } | null)?.artist_id;
      if (!artistId) return false;
      const { data: artist } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId!)
        .maybeSingle();
      return !!artist && (artist as { id: string }).id === artistId;
    },
  });
}
