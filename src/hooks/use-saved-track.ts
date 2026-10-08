import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { listSavedTrackIds, saveTrack, unsaveTrack } from "@/lib/saved-tracks.functions";
import { useAuth } from "@/hooks/use-auth";
import { nextSavedIds, shouldSaveTrack } from "@/lib/liked-songs-state";
import { toast } from "sonner";

/**
 * Reads/toggles whether the signed-in user has saved (liked) a track.
 * Uses a single cached list of saved IDs so every player surface stays in sync.
 */
export function useSavedTrack(songId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listSavedTrackIds);
  const saveFn = useServerFn(saveTrack);
  const unsaveFn = useServerFn(unsaveTrack);

  const idsQ = useQuery({
    queryKey: ["saved-track-ids", user?.id],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const isSaved = !!(songId && idsQ.data?.includes(songId));

  const mutation = useMutation({
    // `shouldSave` is the decision made at tap time, before any optimistic
    // write. It must NOT be re-derived from the cache in here: React Query runs
    // onMutate before mutationFn, so by the time this ran, the cache already
    // reflected the tap and re-reading it produced the opposite intent. That
    // inverted this button — pressing like called unsave, and the server
    // truthfully reported it, so the toast said "Removed from Liked Songs".
    mutationFn: async (shouldSave: boolean) => {
      if (!songId) return;
      return shouldSave
        ? saveFn({ data: { song_id: songId } })
        : unsaveFn({ data: { song_id: songId } });
    },
    onMutate: async (shouldSave: boolean) => {
      if (!songId) return;
      await qc.cancelQueries({ queryKey: ["saved-track-ids", user?.id] });
      const prev = qc.getQueryData<string[]>(["saved-track-ids", user?.id]) ?? [];
      qc.setQueryData(["saved-track-ids", user?.id], nextSavedIds(prev, songId, shouldSave));
      return { prev };
    },
    onError: (error, _v, ctx) => {
      console.error("[useSavedTrack] Error toggling saved track:", error);
      if (ctx?.prev) qc.setQueryData(["saved-track-ids", user?.id], ctx.prev);
      toast.error("Unable to update liked songs. Please try again.");
    },
    onSuccess: (result) => {
      if (result?.action === "saved") {
        toast.success("Added to Liked Songs");
      } else if (result?.action === "unsaved") {
        toast.success("Removed from Liked Songs");
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved-track-ids", user?.id] });
      qc.invalidateQueries({ queryKey: ["saved-tracks", user?.id] });
      qc.invalidateQueries({ queryKey: ["my-overview", user?.id] });
      qc.invalidateQueries({ queryKey: ["library", user?.id] });
      // /liked-songs lists under its own key. Without this the optimistic
      // heart emptied but the row stayed on screen until the 30s staleTime
      // expired — the page looked like the un-save had failed.
      qc.invalidateQueries({ queryKey: ["liked-songs", user?.id] });
      // Prefix invalidate: the player bar and any shelf that hides saved
      // tracks filter on the generic key.
      qc.invalidateQueries({ queryKey: ["saved-track-ids"] });
    },
  });

  return {
    isSaved,
    toggle: () => {
      // Anonymous taps previously fired a mutation that could only 401.
      // Send them to sign in first — /auth replays the like afterwards.
      if (!user) {
        const currentPath = window.location.pathname + window.location.search;
        navigate({
          to: "/auth",
          search: {
            redirect: currentPath,
            action: "like",
            itemId: songId ?? undefined,
            itemType: "song",
          },
        });
        return;
      }
      if (!songId) return;
      // Decide the intent HERE, at tap time, while the cache still describes
      // reality — before onMutate rewrites it. Reading the live cache rather
      // than the render closure still means two taps in one tick compute
      // opposite intents. The decision then travels as the mutation variable
      // instead of being re-derived downstream.
      const current = qc.getQueryData<string[]>(["saved-track-ids", user?.id]) ?? idsQ.data ?? [];
      if (!mutation.isPending) mutation.mutate(shouldSaveTrack(current, songId));
    },
    loading: mutation.isPending,
  };
}
