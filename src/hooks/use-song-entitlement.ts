import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Whether the signed-in listener may download / fully play a song:
 * free tracks are always fine, paid tracks need a completed single or
 * album purchase (same rule the server enforces in getDownloadAudioUrl),
 * unless the caller is staff or the song's artist owner (same bypasses).
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
      // Staff bypass mirrors isStaffUser (own user_roles rows are RLS-readable).
      const [{ data: roles }, { data: song }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId!)
          .in("role", ["admin", "superadmin"]),
        supabase.from("songs").select("artist_id").eq("id", songId!).maybeSingle(),
      ]);
      if ((roles?.length ?? 0) > 0) return true;
      // Owner-artist bypass mirrors the server (artist row owned by caller).
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
