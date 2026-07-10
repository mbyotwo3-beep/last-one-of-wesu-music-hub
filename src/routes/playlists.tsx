import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, Plus, Trash2, Edit2 } from "lucide-react";
import { RoleGate } from "@/components/RoleGate";
import { createPlaylist, deletePlaylist, addToPlaylist } from "@/lib/listener.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/playlists")({
  head: () => ({ meta: [{ title: "My Playlists — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <Page />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createPlaylist);
  const deleteFn = useServerFn(deletePlaylist);
  const addFn = useServerFn(addToPlaylist);

  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState({ name: "", description: "", is_public: false });

  const { data: playlists, isLoading } = useQuery({
    queryKey: ["my-playlists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("playlists")
        .select("*, playlist_songs(song_id)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      setShowCreate(false);
      setNewPlaylist({ name: "", description: "", is_public: false });
      toast.success("Playlist created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create playlist: ${error.message}`);
    },
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      toast.success("Playlist deleted successfully");
    },
    onError: (error) => {
      toast.error(`Failed to delete playlist: ${error.message}`);
    },
  });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ListMusic className="size-6 text-primary" />
          <h1 className="text-3xl font-bold">My Playlists</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold"
        >
          <Plus className="size-4" /> Create Playlist
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-4">Create new playlist</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createM.mutate({ data: newPlaylist });
            }}
            className="space-y-4"
          >
            <input
              required
              placeholder="Playlist name"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              value={newPlaylist.name}
              onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })}
            />
            <textarea
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border"
              value={newPlaylist.description}
              onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newPlaylist.is_public}
                onChange={(e) => setNewPlaylist({ ...newPlaylist, is_public: e.target.checked })}
              />{" "}
              Make playlist public
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createM.isPending}
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
              >
                {createM.isPending ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-full bg-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!playlists || playlists.length === 0 ? (
        <div className="text-center py-12">
          <ListMusic className="size-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No playlists yet. Create your first one!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {playlists.map((playlist: any) => (
            <div
              key={playlist.id}
              className="bg-card border border-border rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold hover:text-primary transition-colors cursor-pointer">
                  {playlist.name}
                </div>
                <p className="text-sm text-muted-foreground">
                  {playlist.is_public ? "Public" : "Private"} • {playlist.playlist_songs?.length || 0} songs
                </p>
                {playlist.description && (
                  <p className="text-xs text-muted-foreground mt-1">{playlist.description}</p>
                )}
              </div>
              <button
                onClick={() => deleteM.mutate({ data: { id: playlist.id } })}
                className="text-destructive hover:text-destructive/80"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
