import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getArtistById } from "@/lib/music.functions";
import { getFollowState, toggleFollow, getSimilarArtists } from "@/lib/follow.functions";
import { CheckCircle2, Play, UserPlus, UserCheck, ShoppingBag } from "lucide-react";
import { usePlayer } from "@/stores/player";
import { StorageImage } from "@/components/StorageImage";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/stores/currency";
import { useEffect, useState } from "react";
import { resolveImageUrl } from "@/lib/storage-url";
import { toast } from "sonner";

const artistQO = (id: string) =>
  queryOptions({
    queryKey: ["artist", id],
    queryFn: () => getArtistById({ data: { id } }),
  });

export const Route = createFileRoute("/artists/$id")({
  loader: async ({ context, params }) => {
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
  errorComponent: ({ error }) => <div className="p-12 text-center">Failed: {error.message}</div>,
  notFoundComponent: () => <div className="p-12 text-center">Artist not found.</div>,
});

function ArtistPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(artistQO(id));
  const setTrack = usePlayer((s) => s.setTrack);
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const a = data.artist!;

  const [coverBg, setCoverBg] = useState<string | null>(null);
  useEffect(() => {
    if (!a.cover_url) return;
    resolveImageUrl("artist-images", a.cover_url).then(setCoverBg).catch(() => {});
  }, [a.cover_url]);

  const followQK = ["follow", id, user?.id ?? null];
  const followQuery = useQuery({
    queryKey: followQK,
    queryFn: () => getFollowState({ data: { artist_id: id, user_id: user?.id ?? null } }),
  });
  const similarQuery = useQuery({
    queryKey: ["similar-artists", id],
    queryFn: () => getSimilarArtists({ data: { artist_id: id } }),
    enabled: !!followQuery.data?.following,
  });

  const follow = useMutation({
    mutationFn: () => toggleFollow({ data: { artist_id: id } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: followQK });
      qc.invalidateQueries({ queryKey: ["similar-artists", id] });
      toast.success(res.following ? `Following ${a.name}` : `Unfollowed ${a.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFollow = () => {
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      navigate({
        to: "/auth",
        search: { redirect: currentPath, action: "follow", artistId: id }
      });
      return;
    }
    follow.mutate();
  };

  const playAll = () => {
    const first = data.topSongs[0];
    if (!first) return;
    setTrack({
      id: first.id,
      title: first.title,
      artistName: a.name,
      coverUrl: first.cover_url,
      durationSeconds: first.duration,
    });
  };

  const following = !!followQuery.data?.following;
  const followerCount = followQuery.data?.count ?? 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Spotify-style hero */}
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
              className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
              aria-label="Play"
            >
              <Play className="size-6 fill-current ml-0.5" />
            </button>
            <button
              onClick={handleFollow}
              disabled={follow.isPending}
              className={`px-6 py-2 rounded-full border font-semibold text-sm transition-colors flex items-center gap-2 ${
                following
                  ? "border-primary text-primary bg-primary/10"
                  : "border-white/30 hover:border-white text-white"
              }`}
            >
              {following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
              {following ? "Following" : "Follow"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-10">
        {a.bio && (
          <p className="text-sm text-muted-foreground max-w-2xl mb-10 leading-relaxed">{a.bio}</p>
        )}

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Popular</h2>
          {data.topSongs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No songs yet.</p>
          ) : (
            <div className="space-y-1">
              {data.topSongs.map((s, i) => (
                <div
                  key={s.id}
                  className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <button
                    onClick={() =>
                      setTrack({
                        id: s.id,
                        title: s.title,
                        artistName: a.name,
                        coverUrl: s.cover_url,
                        durationSeconds: s.duration,
                      })
                    }
                    className="flex items-center gap-4 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <span className="w-6 text-sm text-muted-foreground group-hover:hidden">{i + 1}</span>
                    <Play className="w-6 text-sm hidden group-hover:block size-4 fill-current" />
                    <StorageImage
                      bucket="album-art"
                      path={s.cover_url}
                      alt={s.title}
                      className="size-10 rounded-md overflow-hidden bg-card object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(s.play_count ?? 0).toLocaleString()} plays
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {useCurrency.getState().formatPrice(s.price)}
                    </span>
                    {Number(s.price ?? 0) > 0 && (
                      <Link
                        to="/checkout"
                        search={{ item: "song", id: s.id }}
                        className="p-2 rounded-full bg-secondary hover:bg-accent transition-colors cursor-pointer"
                        aria-label={`Buy ${s.title}`}
                      >
                        <ShoppingBag className="size-4" />
                      </Link>
                    )}
                  </div>
                </div>
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
                    <p className="text-xs text-muted-foreground">
                      {useCurrency.getState().formatPrice(al.price)}
                    </p>
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
