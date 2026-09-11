import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSavedAlbumIds, saveAlbum, unsaveAlbum } from "@/lib/saved-albums.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

/** Reads/toggles whether the signed-in user has saved (liked) an album. */
export function useSavedAlbum(albumId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedAlbumIds);
  const saveFn = useServerFn(saveAlbum);
  const unsaveFn = useServerFn(unsaveAlbum);

  const idsQ = useQuery({
    queryKey: ["saved-album-ids", user?.id],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const isSaved = !!(albumId && idsQ.data?.includes(albumId));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!albumId) return;
      if (isSaved) {
        const result = await unsaveFn({ data: { album_id: albumId } });
        return result;
      } else {
        const result = await saveFn({ data: { album_id: albumId } });
        return result;
      }
    },
    onMutate: async () => {
      if (!albumId) return;
      await qc.cancelQueries({ queryKey: ["saved-album-ids", user?.id] });
      const prev = qc.getQueryData<string[]>(["saved-album-ids", user?.id]) ?? [];
      const next = isSaved ? prev.filter((id) => id !== albumId) : [...prev, albumId];
      qc.setQueryData(["saved-album-ids", user?.id], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["saved-album-ids", user?.id], ctx.prev);
      toast.error("Unable to update saved albums. Please try again.");
    },
    onSuccess: (result) => {
      if (result?.action === "saved") {
        toast.success("Added to library");
      } else if (result?.action === "unsaved") {
        toast.success("Removed from library");
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved-album-ids", user?.id] });
      qc.invalidateQueries({ queryKey: ["for-you", user?.id] });
      qc.invalidateQueries({ queryKey: ["library", user?.id] });
    },
  });

  return { isSaved, toggle: () => mutation.mutate(), loading: mutation.isPending };
}
