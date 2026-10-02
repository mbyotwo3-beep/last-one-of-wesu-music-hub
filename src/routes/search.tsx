import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { globalSearch } from "@/lib/music.functions";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Music, Disc3, Mic2 } from "lucide-react";
import { StorageImage } from "@/components/StorageImage";
import { DownloadButton } from "@/components/DownloadButton";
import { ShareMenu } from "@/components/ShareMenu";

const searchSchema = z.object({
  q: z.string().optional().default(""),
  tab: z.enum(["all", "songs", "artists", "albums"]).optional().default("all"),
});

export const Route = createFileRoute("/search")({
  validateSearch: (s) => searchSchema.parse(s),
  head: ({ match }) => {
    const q = (match.search as { q?: string })?.q ?? "";
    const title = q ? `Search: ${q} — Wesu+` : "Search — Wesu+";
    return {
      meta: [
        { title },
        { name: "description", content: `Search songs, artists, and albums on Wesu+.` },
      ],
    };
  },
  component: SearchPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Search failed: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Nothing here.</div>,
});

function SearchPage() {
  const { q, tab } = Route.useSearch();
  const navigate = useNavigate();
  const searchFn = useServerFn(globalSearch);
  const [term, setTerm] = useState(q);

  useEffect(() => setTerm(q), [q]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["globalSearch", q],
    queryFn: () => searchFn({ data: { q, limit: 30 } }),
    enabled: !!q.trim(),
  });

  function setTab(t: "all" | "songs" | "artists" | "albums") {
    navigate({ to: "/search", search: { q, tab: t } });
  }

  const tabs: Array<{ id: "all" | "songs" | "artists" | "albums"; label: string }> = [
    { id: "all", label: "All" },
    { id: "songs", label: "Songs" },
    { id: "artists", label: "Artists" },
    { id: "albums", label: "Albums" },
  ];

  const songs = data?.songs ?? [];
  const artists = data?.artists ?? [];
  const albums = data?.albums ?? [];

  // How many results the ACTIVE tab can show. The old check summed all three
  // lists, so switching to a tab with no matches (e.g. Artists when the query
  // only matched songs) rendered an entirely blank page — every section was
  // gated on its own list AND the "no results" message was gated on all three
  // being empty at once.
  const visibleCount =
    tab === "songs"
      ? songs.length
      : tab === "artists"
        ? artists.length
        : tab === "albums"
          ? albums.length
          : songs.length + artists.length + albums.length;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <h1 className="text-2xl font-bold mb-4">Search</h1>

      <div className="mb-4 md:hidden">
        <GlobalSearch variant="mobile" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/search", search: { q: term, tab } });
        }}
        className="hidden md:block mb-6"
      >
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search songs, artists, albums"
          className="w-full max-w-xl bg-secondary/50 border border-input rounded-full px-5 py-3 text-base focus:outline-none focus:border-ring"
        />
      </form>

      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!q.trim() ? (
        <p className="text-muted-foreground">Type a song, artist, or album to get started.</p>
      ) : isLoading ? (
        <p className="text-muted-foreground">Searching…</p>
      ) : isError ? (
        <div className="text-center py-10">
          <p className="text-destructive mb-2">
            Search failed{(error as Error)?.message ? `: ${(error as Error).message}` : ""}.
          </p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {(tab === "all" || tab === "artists") && artists.length > 0 && (
            <ResultSection title="Artists" icon={<Mic2 className="size-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {artists.map((a) => (
                  <Link
                    key={a.id}
                    to="/artists/$id"
                    params={{ id: a.id }}
                    className="group text-center"
                  >
                    <StorageImage
                      bucket="artist-images"
                      path={a.avatar_url}
                      alt={a.name}
                      className="w-full aspect-square rounded-full object-cover bg-muted mb-2 group-hover:opacity-90 transition-opacity"
                    />
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-muted-foreground">Artist</div>
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}

          {(tab === "all" || tab === "songs") && songs.length > 0 && (
            <ResultSection title="Songs" icon={<Music className="size-4" />}>
              <div className="rounded-xl border border-border overflow-hidden">
                {songs.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent border-b border-border last:border-b-0 transition-colors"
                  >
                    <Link
                      to="/songs/$id"
                      params={{ id: s.id }}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <StorageImage
                        bucket="album-art"
                        path={s.cover_url}
                        alt={s.title}
                        className="size-12 rounded object-cover bg-muted"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{s.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {(s.artist as { name?: string } | null)?.name ?? "Unknown"}
                        </div>
                      </div>
                    </Link>
                    <DownloadButton
                      songId={s.id}
                      title={s.title}
                      artistName={(s.artist as { name?: string } | null)?.name}
                      coverUrl={s.cover_url}
                    />
                    <ShareMenu
                      songId={s.id}
                      songTitle={s.title}
                      coverUrl={s.cover_url}
                      artistName={(s.artist as { name?: string } | null)?.name}
                      type="song"
                    />
                  </div>
                ))}
              </div>
            </ResultSection>
          )}

          {(tab === "all" || tab === "albums") && albums.length > 0 && (
            <ResultSection title="Albums" icon={<Disc3 className="size-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {albums.map((a) => (
                  <Link key={a.id} to="/albums/$id" params={{ id: a.id }} className="group">
                    <StorageImage
                      bucket="album-art"
                      path={a.cover_url}
                      alt={a.title}
                      className="w-full aspect-square rounded-lg object-cover bg-muted mb-2 group-hover:opacity-90 transition-opacity"
                    />
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(a.artist as { name?: string } | null)?.name ?? "Unknown"}
                    </div>
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}

          {visibleCount === 0 && (
            <div className="py-8 text-center space-y-3">
              <p className="text-muted-foreground">
                No {tab === "all" ? "results" : tab.replace(/s$/, "")} for “{q}”.
              </p>
              {/* A dead end with nothing to tap is how a search sends someone
                  back to Spotify. Always offer a way forward. */}
              <div className="flex flex-wrap gap-2 justify-center">
                <Link
                  to="/browse"
                  className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
                >
                  Browse all music
                </Link>
                <Link
                  to="/artists"
                  className="px-5 py-2 rounded-full bg-secondary border border-border text-sm font-semibold"
                >
                  All artists
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}
