import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Trash2, ListMusic, ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { removeFromPlaylist } from "@/lib/listener.functions";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { toast } from "sonner";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareButton } from "@/components/ShareButton";
import { useAuth } from "@/hooks/use-auth";

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
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["playlist", id],
    queryFn: async () => {
      const { data: pl } = await supabase
        .from("playlists")
        .select("*, playlist_songs(position, song:songs(id,title,duration,price,cover_url,artist:artists(id,name)))")
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
  const isOwner = (data as any).user_id === user?.id;
  const isPublic = (data as any).is_public === true;

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
      <button onClick={() => navigate({ to: "/playlists" })} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 cursor-pointer transition-colors group">
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" /> Back
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
          {!isPublic && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Private playlist
            </p>
          )}
        </div>
      </div>

      <button
        onClick={playAll}
        disabled={!songs.length}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-obsidian font-bold hover:brightness-110 hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 cursor-pointer mb-6"
      >
        <Play className="size-5 fill-current" /> Play
      </button>
      {isPublic && (
        <ShareButton
          path={`/playlists/${id}`}
          title={(data as any).name}
          text={`Listen to ${(data as any).name} on Wesu+`}
          className="ml-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-6 py-3 text-sm font-bold transition-colors hover:bg-accent"
        />
      )}

      {songs.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No songs yet. Add from any song page.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {songs.map((s: any, i: number) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border last:border-b-0 cursor-pointer group"
              onClick={() =>
                usePlayer.getState().setTrack({
                  id: s.id,
                  title: s.title,
                  artistName: s.artist?.name ?? "Unknown",
                  coverUrl: s.cover_url,
                  durationSeconds: s.duration,
                })
              }
            >
              <span className="text-sm text-muted-foreground w-6 text-right group-hover:hidden">{i + 1}</span>
              <Play className="size-4 text-primary fill-current hidden group-hover:block w-6" />
              <StorageImage bucket="album-art" path={s.cover_url} alt="" className="size-10 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.title}</div>
              <Link to="/artists/$id" params={{ id: s.artist?.id ?? "" }} className="text-xs text-muted-foreground truncate hover:underline cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  {s.artist?.name ?? "Unknown"}
                </Link>
              </div>
              {Number(s.price ?? 0) <= 0 && <DownloadButton songId={s.id} />}
              <ShareButton
                path={`/songs/${s.id}`}
                title={s.title}
                text={`Listen to ${s.title} by ${s.artist?.name ?? "an artist"} on Wesu+`}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              />
              {isOwner && (
                <button
                onClick={(e) => { e.stopPropagation(); remove.mutate({ data: { playlist_id: id, song_id: s.id } }); }}
                className="text-muted-foreground hover:text-destructive p-2 cursor-pointer transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="size-4" />
              </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
