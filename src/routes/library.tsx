import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Music, Users, Disc, UserCheck, UserMinus, X, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { getFollowState, toggleFollow } from "@/lib/follow.functions";
import { RoleGate } from "@/components/RoleGate";
import { useAuth } from "@/hooks/use-auth";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { usePlayer } from "@/stores/player";
import { supabase } from "@/integrations/supabase/client";
import { StorageImage } from "@/components/StorageImage";
import { DownloadButton } from "@/components/DownloadButton";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "My Library — Wesu+" }] }),
  component: () => (
    <RoleGate require="user">
      <LibraryRoute />
    </RoleGate>
  ),
  errorComponent: ({ error }) => <div className="p-12 text-center">{error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Not found</div>,
});

function LibraryRoute() {
  return <Page />;
}

function hasId(value: unknown): value is { id: string } {
  if (!value || typeof value !== "object") return false;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0;
}

function Page() {
  const { user } = useAuth();

  const { data: likedSongs, isLoading: likedLoading } = useQuery({
    queryKey: ["liked-songs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("saved_tracks")
        .select("songs(*, artists(name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []).map((item: any) => item.songs).filter(hasId);
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const { data: purchasedSongs, isLoading: purchasedLoading } = useQuery({
    queryKey: ["purchased-songs", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("purchases")
        .select("songs(*, artists(name))")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .is("album_id", null)
        .order("created_at", { ascending: false });
      return (data ?? []).map((item: any) => item.songs).filter(hasId);
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const { data: purchasedAlbums, isLoading: purchasedAlbumsLoading } = useQuery({
    queryKey: ["purchased-albums", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("purchases")
        .select("albums(*, artists(name))")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .not("album_id", "is", null)
        .order("created_at", { ascending: false });
      return (data ?? []).map((item: any) => item.albums).filter(hasId);
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  const { data: followedArtists, isLoading: followingLoading } = useQuery({
    queryKey: ["followed-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("artist_followers")
        .select("artists(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []).map((item: any) => item.artists).filter(hasId);
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure immediate updates
  });

  if (likedLoading || purchasedLoading || purchasedAlbumsLoading || followingLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  // Relationships can be null when a referenced row was deleted or hidden by
  // RLS. Keep rendering defensive even if a cached query contains one.
  const safeLikedSongs = (likedSongs ?? []).filter(hasId);
  const safePurchasedSongs = (purchasedSongs ?? []).filter(hasId);
  const safePurchasedAlbums = (purchasedAlbums ?? []).filter(hasId);
  const safeFollowedArtists = (followedArtists ?? []).filter(hasId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold mb-6">My Library</h1>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Followed Artists</h2>
        </div>
        {safeFollowedArtists.length === 0 ? (
          <p className="text-muted-foreground">No followed artists yet. Follow artists to see them here.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {safeFollowedArtists.map((artist: any) => (
              <FollowedArtistCard key={artist.id} artist={artist} userId={user?.id ?? null} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Heart className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">Liked Songs</h2>
          </div>
          {safeLikedSongs.length > 0 && (
            <Link
              to="/liked-songs"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        {safeLikedSongs.length === 0 ? (
          <p className="text-muted-foreground">No liked songs yet.</p>
        ) : (
          <div className="space-y-2">
            {safeLikedSongs.slice(0, 5).map((song: any) => (
              <LikedSongCard key={song.id} song={song} userId={user?.id ?? null} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Music className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Purchased Singles</h2>
        </div>
        {safePurchasedSongs.length === 0 ? (
          <p className="text-muted-foreground">No purchased singles yet.</p>
        ) : (
          <div className="space-y-2">
            {safePurchasedSongs.map((song: any) => (
              <PurchasedSongCard key={song.id} song={song} userId={user?.id ?? null} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2 mb-4">
          <Disc className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Purchased Albums</h2>
        </div>
        {safePurchasedAlbums.length === 0 ? (
          <p className="text-muted-foreground">No purchased albums yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {safePurchasedAlbums.map((album: any) => (
              <Link
                key={album.id}
                to="/albums/$id"
                params={{ id: album.id }}
                className="group text-center p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-border cursor-pointer"
              >
                <StorageImage
                  bucket="album-art"
                  path={album.cover_url}
                  alt={album.title}
                  className="aspect-square w-full rounded-lg overflow-hidden bg-card ring-1 ring-white/5 mb-3 object-cover"
                />
                <p className="font-semibold text-sm truncate">{album.title}</p>
                <p className="text-xs text-muted-foreground truncate">{album.artists?.name ?? "Unknown"}</p>
                <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full mt-2 inline-block">
                  Owned
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One followed artist, with a Spotify-style Following/Unfollow control.
 * The toggle updates the count and the button optimistically, and removes the
 * card from this list as soon as the unfollow lands.
 */
function FollowedArtistCard({ artist, userId }: { artist: any; userId: string | null }) {
  const qc = useQueryClient();
  const followQK = ["follow", artist.id, userId];

  const followQuery = useQuery({
    queryKey: followQK,
    queryFn: () => getFollowState({ data: { artist_id: artist.id, user_id: userId } }),
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: () => toggleFollow({ data: { artist_id: artist.id } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: followQK });
      await qc.cancelQueries({ queryKey: ["followed-artists", userId] });
      const prev = qc.getQueryData<{ count: number; following: boolean }>(followQK);
      const prevFollowed = qc.getQueryData<any[]>(["followed-artists", userId]) ?? [];
      if (prev) {
        qc.setQueryData(followQK, {
          following: !prev.following,
          count: Math.max(0, prev.count + (prev.following ? -1 : 1)),
        });
      }
      // Optimistically remove from followed artists list if unfollowing
      if (prev?.following) {
        qc.setQueryData(["followed-artists", userId], prevFollowed.filter((a) => a.id !== artist.id));
      }
      return { prev, prevFollowed };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(followQK, ctx.prev);
      if (ctx?.prevFollowed) qc.setQueryData(["followed-artists", userId], ctx.prevFollowed);
      toast.error(e.message);
    },
    onSuccess: (res) => {
      toast.success(res.action === "followed" ? `❤️ Following ${artist.name}!` : `👋 Unfollowed ${artist.name}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["followed-artists", userId] });
      qc.invalidateQueries({ queryKey: ["library", userId] });
    },
  });

  const following = !!followQuery.data?.following;
  const count = followQuery.data?.count ?? 0;

  return (
    <div className="text-center p-4 rounded-xl hover:bg-accent/40 transition-colors border border-transparent hover:border-border">
      <Link to="/artists/$id" params={{ id: artist.id }} className="group block">
        <StorageImage
          bucket="artist-images"
          path={artist.avatar_url}
          alt={artist.name}
          className="aspect-square w-full rounded-full overflow-hidden bg-card ring-1 ring-border mb-3 object-cover"
        />
        <p className="font-semibold text-sm truncate">{artist.name}</p>
        <p className="text-xs text-muted-foreground">
          {count.toLocaleString()} follower{count === 1 ? "" : "s"}
        </p>
      </Link>
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        aria-pressed={following}
        className={`group mt-3 w-full px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
          following
            ? "border-primary text-primary bg-primary/10 hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
            : "border-foreground/30 hover:border-foreground text-foreground"
        }`}
      >
        {following ? (
          <>
            <UserCheck className="size-3.5 group-hover:hidden" />
            <UserMinus className="size-3.5 hidden group-hover:block" />
            <span className="group-hover:hidden">Following</span>
            <span className="hidden group-hover:inline">Unfollow</span>
          </>
        ) : (
          "Follow"
        )}
      </button>
    </div>
  );
}

/**
 * Liked song card with like button, preview/play functionality, and remove from library.
 */
function LikedSongCard({ song, userId }: { song: any; userId: string | null }) {
  const qc = useQueryClient();
  const { isSaved, toggle, loading } = useSavedTrack(song.id);
  const player = usePlayer();

  const isPlaying = player.playing && player.track?.id === song.id;

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) {
      player.togglePlay();
      return;
    }
    player.setTrack({
      id: song.id,
      title: song.title,
      artistName: song.artists?.name ?? "Unknown",
      coverUrl: song.cover_url,
      durationSeconds: song.duration,
    });
  };

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("saved_tracks")
        .delete()
        .eq("user_id", userId)
        .eq("song_id", song.id);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["liked-songs", userId] });
      const prev = qc.getQueryData<any[]>(["liked-songs", userId]) ?? [];
      const next = prev.filter((s) => s.id !== song.id);
      qc.setQueryData(["liked-songs", userId], next);
      return { prev };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["liked-songs", userId], ctx.prev);
      toast.error(`Failed to remove: ${(error as Error).message}`);
    },
    onSuccess: () => {
      toast.success(`🗑️ Removed "${song.title}" from liked songs`);
      qc.invalidateQueries({ queryKey: ["liked-songs", userId] });
      qc.invalidateQueries({ queryKey: ["saved-track-ids", userId] });
      qc.invalidateQueries({ queryKey: ["library", userId] });
    },
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 group hover:bg-accent/30 transition-colors">
      <div className="relative shrink-0">
        <StorageImage
          bucket="album-art"
          path={song.cover_url}
          alt={song.title}
          className="size-14 rounded-lg object-cover bg-muted"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          disabled={loading}
          className="absolute -top-1.5 -right-1.5 size-7 bg-background rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform border border-border"
          title={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
        >
          <Heart 
            className={`size-4 ${isSaved ? "fill-red-500 text-red-500" : "text-foreground"}`} 
          />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-foreground">{song.title}</p>
        <p className="text-sm text-muted-foreground truncate">{song.artists?.name ?? "Unknown"}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handlePlay}
          className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl"
          title={isPlaying ? "Pause" : (isPaid ? "Preview (15s)" : "Play")}
        >
          {isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
        {Number(song.price ?? 0) <= 0 && <DownloadButton songId={song.id} />}
        {song.price && Number(song.price) > 0 && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
            ZMW {Number(song.price).toFixed(2)}
          </span>
        )}
        <button
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="size-8 rounded-full hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
          title="Remove from liked songs"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Purchased song card with play/pause and like functionality.
 */
function PurchasedSongCard({ song, userId }: { song: any; userId: string | null }) {
  const { isSaved, toggle, loading } = useSavedTrack(song.id);
  const player = usePlayer();

  const isPlaying = player.playing && player.track?.id === song.id;

  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isPlaying) {
      player.togglePlay();
      return;
    }
    player.setTrack({
      id: song.id,
      title: song.title,
      artistName: song.artists?.name ?? "Unknown",
      coverUrl: song.cover_url,
      durationSeconds: song.duration,
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 group hover:bg-accent/30 transition-colors">
      <div className="relative shrink-0">
        <StorageImage
          bucket="album-art"
          path={song.cover_url}
          alt={song.title}
          className="size-14 rounded-lg object-cover bg-muted"
        />
        {userId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            disabled={loading}
            className="absolute -top-1.5 -right-1.5 size-7 bg-background rounded-full shadow-md flex items-center justify-center hover:scale-110 transition-transform border border-border"
            title={isSaved ? "Remove from Liked Songs" : "Add to Liked Songs"}
          >
            <Heart 
              className={`size-4 ${isSaved ? "fill-red-500 text-red-500" : "text-foreground"}`} 
            />
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-foreground">{song.title}</p>
        <p className="text-sm text-muted-foreground truncate">{song.artists?.name ?? "Unknown"}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handlePlay}
          className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg hover:shadow-xl"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="size-4 fill-current" />
          )}
        </button>
        <DownloadButton songId={song.id} />
        <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full font-medium">
          Owned
        </span>
      </div>
    </div>
  );
}
