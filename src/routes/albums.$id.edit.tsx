import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAlbumWithSongs } from "@/lib/music.functions";
import { StorageImage } from "@/components/StorageImage";
import { useAuth } from "@/hooks/use-auth";
import { Play, Pause, ArrowLeft, Save, Upload, X, ChevronUp, ChevronDown, GripVertical, CheckCircle2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { updateAlbum, updateSong, deleteSong } from "@/lib/artist.functions";
import { uploadFileToBucket } from "@/lib/storage";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { audit } from "@/lib/artist.functions";
import { supabase } from "@/integrations/supabase/client";

const albumQO = (id: string) =>
  queryOptions({
    queryKey: ["album", id],
    queryFn: () => getAlbumWithSongs({ data: { id } }),
    staleTime: 0,
  });

export const Route = createFileRoute("/albums/$id/edit")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(albumQO(params.id));
    if (!data.album) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Edit ${loaderData?.album?.title ?? "Album"} — Wesu+` },
      { name: "description", content: `Edit ${loaderData?.album?.title ?? "this album"} on Wesu+.` },
    ],
  }),
  component: AlbumEditPage,
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Album not found.</div>,
});

function AlbumEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(albumQO(id));
  const updateAlbumFn = useServerFn(updateAlbum);
  const updateSongFn = useServerFn(updateSong);
  const deleteSongFn = useServerFn(deleteSong);

  const album = data.album!;
  const artist = (album as { artist?: { id: string; name: string; user_id: string } | null }).artist ?? null;

  // Permission check
  if (artist && artist.user_id !== user?.id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You don't have permission to edit this album.</p>
        <Link to="/albums/$id" params={{ id }} className="text-primary underline">
          View album instead
        </Link>
      </div>
    );
  }

  // Form state
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description || "");
  const [genre, setGenre] = useState(album.genre || "");
  const [releaseDate, setReleaseDate] = useState(album.release_date || "");
  const [price, setPrice] = useState(Number(album.price || 0));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track ordering state
  const [tracks, setTracks] = useState(
    data.songs.map((s: any) => ({
      id: s.id,
      title: s.title,
      track_number: s.track_number || 0,
      price: Number(s.price || 0),
      explicit: s.explicit || false,
    }))
  );

  const coverInputRef = useRef<HTMLInputElement>(null);

  // Update album mutation
  const updateAlbumMutation = useMutation({
    mutationFn: updateAlbumFn,
    onSuccess: () => {
      toast.success("Album updated successfully!");
      qc.invalidateQueries({ queryKey: ["album", id] });
      qc.invalidateQueries({ queryKey: ["my-albums"] });
    },
    onError: (error) => {
      toast.error(`Failed to update album: ${(error as Error).message}`);
    },
  });

  // Update song mutation
  const updateSongMutation = useMutation({
    mutationFn: updateSongFn,
    onSuccess: () => {
      toast.success("Track updated successfully!");
      qc.invalidateQueries({ queryKey: ["album", id] });
    },
    onError: (error) => {
      toast.error(`Failed to update track: ${(error as Error).message}`);
    },
  });

  // Delete song mutation
  const deleteSongMutation = useMutation({
    mutationFn: deleteSongFn,
    onSuccess: () => {
      toast.success("Track deleted successfully!");
      qc.invalidateQueries({ queryKey: ["album", id] });
      qc.invalidateQueries({ queryKey: ["my-songs"] });
    },
    onError: (error) => {
      toast.error(`Failed to delete track: ${(error as Error).message}`);
    },
  });

  const handleCoverUpload = async () => {
    if (!coverFile || !user) return;

    try {
      setIsSubmitting(true);
      const cover_url = await uploadFileToBucket("album-art", user.id, coverFile);
      await updateAlbumMutation.mutateAsync({
        data: { id, cover_url },
      });
      setCoverFile(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
    } catch (error) {
      toast.error(`Failed to upload cover: ${(error as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAlbum = async () => {
    try {
      setIsSubmitting(true);
      await updateAlbumMutation.mutateAsync({
        data: {
          id,
          title,
          description,
          genre,
          release_date,
          price,
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForApproval = async () => {
    try {
      setIsSubmitting(true);

      // Update album status to pending
      await updateAlbumMutation.mutateAsync({
        data: { id, status: "pending" },
      });

      // Update all songs in the album to pending status
      await Promise.all(
        tracks.map((track) =>
          updateSongMutation.mutateAsync({
            data: { id: track.id, status: "pending" },
          })
        )
      );

      // Audit log
      if (user) {
        await audit(supabase, user.id, "album.submit_for_approval", "album", id, {
          title: album.title,
          track_count: tracks.length,
        });
      }

      toast.success("Album submitted for approval!");
      navigate({ to: "/artist-dashboard" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const moveTrack = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= tracks.length) return;

    setTracks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      // Update track numbers
      return next.map((t, i) => ({ ...t, track_number: i + 1 }));
    });
  };

  const updateTrackTitle = (trackId: string, newTitle: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, title: newTitle } : t))
    );
  };

  const saveTrackOrder = async () => {
    try {
      setIsSubmitting(true);
      await Promise.all(
        tracks.map((track) =>
          updateSongMutation.mutateAsync({
            data: { id: track.id, track_number: track.track_number },
          })
        )
      );
      toast.success("Track order updated successfully!");
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveTrackTitle = async (trackId: string, title: string) => {
    try {
      await updateSongMutation.mutateAsync({
        data: { id: trackId, title },
      });
    } catch (error) {
      toast.error(`Failed to update track title: ${(error as Error).message}`);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    if (!confirm("Are you sure you want to delete this track? This action cannot be undone.")) {
      return;
    }

    try {
      await deleteSongMutation.mutateAsync({ data: { id: trackId } });
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (error) {
      toast.error(`Failed to delete track: ${(error as Error).message}`);
    }
  };

  const canSubmit = album.status === "draft";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/albums/$id"
            params={{ id }}
            className="p-2 rounded-full bg-secondary hover:bg-accent transition"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Edit Album</h1>
            <p className="text-sm text-muted-foreground">
              {album.status === "draft" ? "Draft" : album.status === "pending" ? "Pending Approval" : "Published"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canSubmit && (
            <button
              onClick={handleSubmitForApproval}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Submit for Approval
            </button>
          )}
          <button
            onClick={handleSaveAlbum}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-full bg-secondary border border-border text-sm font-semibold disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Album Metadata */}
        <div className="lg:col-span-1 space-y-6">
          {/* Cover Art */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold mb-4">Cover Art</h3>
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-secondary mb-4">
              <StorageImage
                bucket="album-art"
                path={album.cover_url}
                alt={album.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground cursor-pointer hover:brightness-110 transition">
                <Upload className="size-4" />
                Change Cover
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setCoverFile(file);
                  }}
                />
              </label>
              {coverFile && (
                <button
                  onClick={handleCoverUpload}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-secondary border border-border text-sm font-semibold disabled:opacity-40"
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Upload"}
                </button>
              )}
            </div>
          </div>

          {/* Album Details */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold">Album Details</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border min-h-[80px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Genre</label>
                <input
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Afrobeats, Hip-Hop..."
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Release Date</label>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Price (ZMW)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Tracklist */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Tracklist</h3>
              <button
                onClick={saveTrackOrder}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-semibold disabled:opacity-40"
              >
                {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                Save Order
              </button>
            </div>

            {tracks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No tracks in this album yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tracks.map((track, i) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3 group"
                  >
                    {/* Track number */}
                    <span className="shrink-0 size-7 rounded-lg bg-secondary border border-border/80 flex items-center justify-center text-xs font-bold font-mono text-muted-foreground">
                      #{i + 1}
                    </span>

                    {/* Move controls */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveTrack(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        onClick={() => moveTrack(i, 1)}
                        disabled={i === tracks.length - 1}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed transition cursor-pointer"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>

                    {/* Drag handle */}
                    <div className="shrink-0 p-1 cursor-grab active:cursor-grabbing text-muted-foreground">
                      <GripVertical className="size-4" />
                    </div>

                    {/* Editable title */}
                    <input
                      type="text"
                      value={track.title}
                      onChange={(e) => updateTrackTitle(track.id, e.target.value)}
                      onBlur={() => saveTrackTitle(track.id, track.title)}
                      className="flex-1 min-w-0 bg-background/60 border border-border/80 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    />

                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteTrack(track.id)}
                      className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                      title="Delete track"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <h4 className="font-semibold text-sm mb-2">Editing Guidelines</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Use ↑↓ arrows to reorder tracks</li>
              <li>• Click track titles to edit them</li>
              <li>• Save track order after reordering</li>
              <li>• Submit for approval when ready to publish</li>
              <li>• Draft albums are not visible to public</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
