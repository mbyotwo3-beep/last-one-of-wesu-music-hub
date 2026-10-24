import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Whether the signed-in listener may download / fully play a song:
 * free tracks are always fine, paid tracks need a completed single or
 * album purchase (same rule the server enforces in getDownloadAudioUrl),
 * or the caller is staff (admin / superadmin ride for QA and moderation)
 * or the song's artist owner. The staff leg was removed 2026-10-23 and
 * restored 2026-10-24 as an explicit product decision — keep both legs in
 * step with the server.
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
      // Staff leg mirrors isStaffUser: own user_roles rows are RLS-readable,
      // so a plain select on user_id is safe client-side. Restored
      // 2026-10-24 in step with the server functions — keep both sides in
      // sync (checked by check-privileged-authorization).
      const [{ data: roles }, { data: song }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId!)
          .in("role", ["admin", "superadmin"]),
        supabase.from("songs").select("artist_id").eq("id", songId!).maybeSingle(),
      ]);
      if ((roles?.length ?? 0) > 0) return true;
      // Owner-artist leg mirrors the server (artist row owned by caller).
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
