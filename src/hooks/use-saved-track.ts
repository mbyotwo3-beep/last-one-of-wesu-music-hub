import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listSavedTrackIds,
  saveTrack,
  unsaveTrack,
} from "@/lib/saved-tracks.functions";
import { useAuth } from "@/hooks/use-auth";

/**
 * Reads/toggles whether the signed-in user has saved (liked) a track.
 * Uses a single cached list of saved IDs so every player surface stays in sync.
 */
export function useSavedTrack(songId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedTrackIds);
  const saveFn = useServerFn(saveTrack);
  const unsaveFn = useServerFn(unsaveTrack);

  const idsQ = useQuery({
    queryKey: ["saved-track-ids", user?.id],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const isSaved = !!(songId && idsQ.data?.includes(songId));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!songId) return;
      if (isSaved) await unsaveFn({ data: { song_id: songId } });
      else await saveFn({ data: { song_id: songId } });
    },
    onMutate: async () => {
      if (!songId) return;
      await qc.cancelQueries({ queryKey: ["saved-track-ids", user?.id] });
      const prev = qc.getQueryData<string[]>(["saved-track-ids", user?.id]) ?? [];
      const next = isSaved ? prev.filter((id) => id !== songId) : [...prev, songId];
      qc.setQueryData(["saved-track-ids", user?.id], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["saved-track-ids", user?.id], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved-track-ids", user?.id] });
      qc.invalidateQueries({ queryKey: ["saved-tracks", user?.id] });
      qc.invalidateQueries({ queryKey: ["my-overview", user?.id] });
    },
  });

  return {
    isSaved,
    toggle: () => mutation.mutate(),
    loading: mutation.isPending,
  };
}
