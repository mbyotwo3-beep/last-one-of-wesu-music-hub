import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Trash2, ListMusic, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { removeFromPlaylist } from "@/lib/listener.functions";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { toast } from "sonner";

export const Route = createFileRoute("/playlists/$id")({
  head: () => ({ meta: [{ title: "Playlist — Wesu+" }] }),
  component: Page,
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Playlist not found</div>,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setQueue = usePlayer((s) => s.setQueue);
  const removeFn = useServerFn(removeFromPlaylist);

  const { data, isLoading } = useQuery({
    queryKey: ["playlist", id],
    queryFn: async () => {
      const { data: pl } = await supabase
        .from("playlists")
        .select("*, playlist_songs(position, song:songs(id,title,duration,cover_url,artist:artists(id,name)))")
        .eq("id", id)
        .maybeSingle();
      return pl;
    },
  });

  const remove = useMutation({
    mutationFn: removeFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist", id] });
      toast.success("Removed");
    },
  });

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-12 text-center">Playlist not found</div>;

  const songs = ((data as any).playlist_songs ?? [])
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((ps: any) => ps.song)
    .filter(Boolean);

  function playAll() {
    if (!songs.length) return;
    setQueue(
      songs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artistName: s.artist?.name ?? "Unknown",
        coverUrl: s.cover_url,
        durationSeconds: s.duration,
      })),
      0,
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-32">
      <button onClick={() => navigate({ to: "/playlists" })} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1">
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="flex items-end gap-6 mb-8">
        <div className="size-48 bg-gradient-to-br from-primary/40 to-primary/10 rounded-lg flex items-center justify-center">
          <ListMusic className="size-16 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground uppercase">Playlist</p>
          <h1 className="text-5xl font-bold mb-2">{(data as any).name}</h1>
          {(data as any).description && (
            <p className="text-muted-foreground mb-2">{(data as any).description}</p>
          )}
          <p className="text-sm text-muted-foreground">{songs.length} songs</p>
        </div>
      </div>

      <button
        onClick={playAll}
        disabled={!songs.length}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-obsidian font-bold hover:brightness-110 disabled:opacity-40 mb-6"
      >
        <Play className="size-5 fill-current" /> Play
      </button>

      {songs.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No songs yet. Add from any song page.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {songs.map((s: any, i: number) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border last:border-b-0"
            >
              <span className="text-sm text-muted-foreground w-6 text-right">{i + 1}</span>
              <StorageImage bucket="album-art" path={s.cover_url} alt="" className="size-10 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.title}</div>
                <Link to="/artists/$id" params={{ id: s.artist?.id ?? "" }} className="text-xs text-muted-foreground truncate hover:underline">
                  {s.artist?.name ?? "Unknown"}
                </Link>
              </div>
              <button
                onClick={() => remove.mutate({ data: { playlist_id: id, song_id: s.id } })}
                className="text-muted-foreground hover:text-destructive p-2"
                aria-label="Remove"
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
