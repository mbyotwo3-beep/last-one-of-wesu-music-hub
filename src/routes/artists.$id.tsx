import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { routeErrorComponent } from "@/components/RouteError";
import {
  queryOptions,
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getArtistById } from "@/lib/music.functions";
import {
  getFollowerCount,
  getFollowState,
  toggleFollow,
  getSimilarArtists,
} from "@/lib/follow.functions";
import { CheckCircle2, Play, Pause, UserPlus, UserCheck, UserMinus, Heart } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/stores/currency";
import { useEffect, useState } from "react";
import { resolveImageUrl } from "@/lib/storage-url";
import { toast } from "sonner";
import { DownloadButton } from "@/components/DownloadButton";
import { SocialLinks } from "@/components/SocialLinks";
import { ShareMenu } from "@/components/ShareMenu";
import { useSavedTrack } from "@/hooks/use-saved-track";
import { isUuid } from "@/lib/route-params";

const artistQO = (id: string) =>
  queryOptions({
    queryKey: ["artist", id],
    queryFn: () => getArtistById({ data: { id } }),
    staleTime: 5 * 60 * 1000,
  });

export const Route = createFileRoute("/artists/$id")({
  loader: async ({ context, params }) => {
    // Reject a malformed id before it reaches the uuid column, which would
    // otherwise 500 with a raw Postgres error.
    if (!isUuid(params.id)) throw notFound();
    const data = await context.queryClient.ensureQueryData(artistQO(params.id));
    if (!data.artist) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.artist?.name ?? "Artist"} — Wesu+` },
      {
        name: "description",
        content: loaderData?.artist?.bio?.slice(0, 160) ?? "Artist profile on Wesu+",
      },
    ],
  }),
  component: ArtistPage,
  errorComponent: routeErrorComponent(),
  notFoundComponent: () => <div className="p-12 text-center">Artist not found.</div>,
});

function ArtistPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(artistQO(id));
  const setQueue = usePlayer((s) => s.setQueue);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const a = data.artist!;

  const [coverBg, setCoverBg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!a.cover_url) {
      setCoverBg(null);
      return;
    }
    resolveImageUrl("artist-images", a.cover_url)
      .then((url) => {
        if (!cancelled) setCoverBg(url);
      })
      .catch(() => {
        if (!cancelled) setCoverBg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [a.cover_url]);

  const formatPrice = useCurrency((c) => c.formatPrice);
  const followQK = ["follow", id, user?.id ?? null];
  // Public: renders for signed-out visitors too, so the count never blanks.
  const countQK = ["follower-count", id];
  const countQuery = useQuery({
    queryKey: countQK,
    queryFn: () => getFollowerCount({ data: { artist_id: id } }),
    enabled: !!id,
    staleTime: 60_000,
  });
  // Personal flag: auth-scoped (RLS returns the caller's own row only).
  const followQuery = useQuery({
    queryKey: followQK,
    queryFn: () => getFollowState({ data: { artist_id: id } }),
    enabled: !!id && !!user,
    staleTime: 60_000,
  });
  const similarQuery = useQuery({
    queryKey: ["similar-artists", id],
    queryFn: () => getSimilarArtists({ data: { artist_id: id } }),
    // "Fans also like" is for discovery — gating it on following hid it
    // from nearly every visitor.
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const follow = useMutation({
    mutationFn: () => toggleFollow({ data: { artist_id: id } }),
    onMutate: async () => {
      // Optimistic on both: the personal flag and the public counter.
      await qc.cancelQueries({ queryKey: followQK });
      await qc.cancelQueries({ queryKey: countQK });
      const prev = qc.getQueryData<{ following: boolean }>(followQK);
      const prevCount = qc.getQueryData<number>(countQK);
      const next = !prev?.following;
      if (prev) qc.setQueryData(followQK, { following: next });
      if (typeof prevCount === "number") {
        qc.setQueryData(countQK, Math.max(0, prevCount + (next ? 1 : -1)));
      }
      return { prev, prevCount };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(followQK, ctx.prev);
      if (typeof ctx?.prevCount === "number") qc.setQueryData(countQK, ctx.prevCount);
      toast.error(e.message);
    },
    onSuccess: (res) => {
      // Only the boolean: onMutate already applied the count delta, and
      // re-applying it here made the number jump by 2.
      qc.setQueryData(followQK, { following: res.following });
      toast.success(
        res.action === "followed"
          ? `❤️ You're now following ${a.name}!`
          : `👋 Unfollowed ${a.name}`,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: followQK });
      qc.invalidateQueries({ queryKey: countQK });
      qc.invalidateQueries({ queryKey: ["followed-artists"] });
      qc.invalidateQueries({ queryKey: ["similar-artists", id] });
    },
  });

  const handleFollow = () => {
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      navigate({
        to: "/auth",
        search: { redirect: currentPath, action: "follow", artistId: id },
      });
      return;
    }
    follow.mutate();
  };

  const topSongTracks = data.topSongs.map((s) => ({
    id: s.id,
    title: s.title,
    artistName: a.name,
    coverUrl: s.cover_url,
    durationSeconds: s.duration,
  }));

  const isArtistPlaying = playing && data.topSongs.some((s) => s.id === currentTrackId);

  const playAll = () => {
    if (data.topSongs.length === 0) return;
    if (isArtistPlaying) {
      togglePlay();
      return;
    }
    const currentIndex = data.topSongs.findIndex((s) => s.id === currentTrackId);
    if (currentIndex !== -1) {
      togglePlay();
    } else {
      setQueue(topSongTracks, 0);
    }
  };

  const handlePlaySong = (song: any, index: number) => {
    if (currentTrackId === song.id) {
      togglePlay();
      return;
    }
    setQueue(topSongTracks, index);
  };

  const following = !!followQuery.data?.following;
  // Public counter — renders for signed-out visitors too.
  const followerCount = countQuery.data ?? 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Artist hero */}
      <div className="relative">
        <div
          className="h-64 md:h-96 w-full bg-gradient-to-b from-primary/40 via-primary/20 to-background relative overflow-hidden"
          style={
            coverBg
              ? {
                  backgroundImage: `url(${coverBg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {coverBg && (
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          )}
        </div>
        <div className="max-w-7xl mx-auto px-6 -mt-32 md:-mt-40 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
            <StorageImage
              bucket="artist-images"
              path={a.avatar_url}
              alt={a.name}
              className="size-40 md:size-56 rounded-full overflow-hidden bg-card ring-4 ring-background shadow-2xl shrink-0 object-cover"
            />
            <div className="pb-2">
              {a.verified && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-2">
                  <CheckCircle2 className="size-4" /> Verified Artist
                </div>
              )}
              <h1 className="text-4xl md:text-7xl font-black tracking-tight">{a.name}</h1>
              <p className="text-sm text-muted-foreground mt-3">
                {(a.monthly_listeners ?? 0).toLocaleString()} monthly listeners
                {a.genre ? ` · ${a.genre}` : ""}
                {" · "}
                {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={playAll}
              disabled={data.topSongs.length === 0}
              className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
              aria-label={isArtistPlaying ? "Pause" : "Play"}
            >
              {isArtistPlaying ? (
                <Pause className="size-6 fill-current" />
              ) : (
                <Play className="size-6 fill-current ml-0.5" />
              )}
            </button>
            <ShareMenu
              artistId={a.id}
              artistName={a.name}
              type="artist"
              className="relative z-20"
            />
            <button
              onClick={handleFollow}
              disabled={follow.isPending}
              aria-pressed={following}
              title={following ? `Unfollow ${a.name}` : `Follow ${a.name}`}
              className={`group px-6 py-2 rounded-full border font-semibold text-sm transition-colors flex items-center gap-2 min-w-[7.5rem] justify-center ${
                following
                  ? "border-primary text-primary bg-primary/10 hover:bg-destructive/10 hover:border-destructive hover:text-destructive"
                  : "border-foreground/30 hover:border-foreground text-foreground"
              }`}
            >
              {following ? (
                <>
                  <UserCheck className="size-4 group-hover:hidden" />
                  <UserMinus className="size-4 hidden group-hover:block" />
                  <span className="group-hover:hidden">Following</span>
                  <span className="hidden group-hover:inline">Unfollow</span>
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  Follow
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-10">
        {a.bio && (
          <p className="text-sm text-muted-foreground max-w-2xl mb-10 leading-relaxed">{a.bio}</p>
        )}
        <div className="mb-10">
          <SocialLinks links={a.social_links} />
        </div>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Popular</h2>
          {data.topSongs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No songs yet.</p>
          ) : (
            <div className="space-y-1">
              {data.topSongs.map((s, i) => (
                <ArtistTopSongRow
                  key={s.id}
                  song={s}
                  index={i}
                  artistId={a.id}
                  artistName={a.name}
                  onPlay={() => handlePlaySong(s, i)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Discography</h2>
          {data.albums.length === 0 ? (
            <p className="text-muted-foreground text-sm">No albums yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {data.albums.map((al) => (
                <div key={al.id} className="group">
                  <Link to="/albums/$id" params={{ id: al.id }}>
                    <StorageImage
                      bucket="album-art"
                      path={al.cover_url}
                      alt={al.title}
                      className="aspect-square w-full rounded-xl overflow-hidden bg-card ring-1 ring-white/5 mb-2 object-cover"
                    />
                    <p className="font-semibold text-sm truncate">{al.title}</p>
                  </Link>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">{formatPrice(al.price)}</p>
                    {Number(al.price ?? 0) > 0 && (
                      <Link
                        to="/checkout"
                        search={{ item: "album", id: al.id }}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary text-primary-foreground hover:brightness-110 transition"
                      >
                        Buy
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {following && (similarQuery.data?.length ?? 0) > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-1">Fans also like</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Similar artists based on what you follow.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {similarQuery.data!.map((sa) => (
                <Link
                  key={sa.id}
                  to="/artists/$id"
                  params={{ id: sa.id }}
                  className="group text-center p-4 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <StorageImage
                    bucket="artist-images"
                    path={sa.avatar_url}
                    alt={sa.name}
                    className="aspect-square w-full rounded-full overflow-hidden bg-card ring-1 ring-white/5 mb-3 object-cover"
                  />
                  <p className="font-semibold text-sm truncate">{sa.name}</p>
                  <p className="text-xs text-muted-foreground">Artist</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Extracted so hooks (useSavedTrack etc.) run in a stable component —
// calling hooks inside .map breaks hook order when the list length changes.
function ArtistTopSongRow({
  song: s,
  index: i,
  artistId,
  artistName,
  onPlay,
}: {
  song: any;
  index: number;
  artistId: string;
  artistName: string;
  onPlay: () => void;
}) {
  const { isSaved, toggle } = useSavedTrack(s.id);
  const playing = usePlayer((s) => s.playing);
  const currentTrackId = usePlayer((s) => s.track?.id);
  const formatPrice = useCurrency((c) => c.formatPrice);
  const isPlayingThisTrack = playing && currentTrackId === s.id;

  return (
    <div className="w-full flex items-center gap-2 sm:gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
      <button
        onClick={onPlay}
        className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 text-left cursor-pointer"
      >
        {isPlayingThisTrack ? (
          <Pause className="w-6 text-sm size-4 shrink-0 fill-current text-primary" />
        ) : (
          <>
            {/* The row number is decorative and the cover already carries the
                artwork. On a 360px phone it spent 32px on a digit and pushed
                the title into the price. */}
            <span className="hidden sm:block w-6 text-sm text-muted-foreground group-hover:hidden">
              {i + 1}
            </span>
            <Play className="hidden sm:block w-6 text-sm group-hover:block size-4 shrink-0 fill-current text-primary" />
          </>
        )}
        <StorageImage
          bucket="album-art"
          path={s.cover_url}
          alt={s.title}
          className="size-9 sm:size-10 rounded-md overflow-hidden bg-card object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
            {s.title}
          </p>
          {/* truncate is the fix for the overlap. Without it a six-figure play
              count ("1,234,567 plays") had no width constraint at all and
              painted straight over the price sitting beside it on a phone. */}
          <p className="text-xs text-muted-foreground truncate tabular-nums">
            {(s.play_count ?? 0).toLocaleString()} plays
          </p>
        </div>
      </button>
      {/* shrink-0 + min-w-0: the text column gives ground, the icon targets never
          do, and neither may ever overlap the other. */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
        <span className="text-xs font-semibold text-muted-foreground tabular-nums truncate">
          {formatPrice(s.price)}
        </span>
        {/* The separate ShoppingBag link is gone. DownloadButton already becomes
            a Buy link for an unowned paid song, so this row carried two buy
            affordances and spent 40px on the duplicate. */}
        <DownloadButton
          songId={s.id}
          title={s.title}
          coverUrl={s.cover_url}
          artistName={artistName}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full opacity-0 group-hover:opacity-100 max-sm:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
          aria-label={isSaved ? "Unlike" : "Like"}
        >
          <Heart
            className={`size-4 ${isSaved ? "fill-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          />
        </button>
        <ShareMenu
          songId={s.id}
          songTitle={s.title}
          albumId={s.album_id ?? undefined}
          artistId={artistId}
          artistName={artistName}
          type="song"
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground relative z-20"
        />
      </div>
    </div>
  );
}
