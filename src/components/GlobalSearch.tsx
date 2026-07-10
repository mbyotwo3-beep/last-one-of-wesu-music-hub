import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X, Music, Disc3, Mic2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { globalSearch } from "@/lib/music.functions";

type Results = Awaited<ReturnType<typeof globalSearch>> | null;

/**
 * Spotify-style typeahead search.
 * 250ms debounce, groups results by Songs / Artists / Albums,
 * keyboard: Esc closes, Enter navigates to /search?q=..., click a row to go to the item.
 */
export function GlobalSearch({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const searchFn = useServerFn(globalSearch);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (!term) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchFn({ data: { q: term, limit: 5 } });
        setResults(res);
      } catch {
        setResults({ songs: [], albums: [], artists: [] });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, searchFn]);

  function submit() {
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    navigate({ to: "/search", search: { q: term } });
  }

  function clear() {
    setQ("");
    setResults(null);
  }

  const empty =
    results &&
    results.songs.length === 0 &&
    results.albums.length === 0 &&
    results.artists.length === 0;

  const widthClass = variant === "mobile" ? "w-full" : "w-64 md:w-80";

  return (
    <div ref={containerRef} className={`relative ${variant === "mobile" ? "w-full" : ""}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search songs, artists, albums"
        aria-label="Search"
        className={`bg-secondary/50 border border-input rounded-full pl-9 pr-9 py-2 text-sm ${widthClass} focus:outline-none focus:border-ring text-foreground placeholder:text-muted-foreground transition-colors`}
      />
      {q && (
        <button
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          type="button"
        >
          <X className="size-4" />
        </button>
      )}

      {open && q.trim() && (
        <div className="absolute left-0 right-0 md:right-auto md:w-96 mt-2 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {loading && !results ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Searching…</div>
          ) : empty ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No results for “{q}”
            </div>
          ) : results ? (
            <>
              {results.artists.length > 0 && (
                <Section title="Artists" icon={<Mic2 className="size-3.5" />}>
                  {results.artists.map((a) => (
                    <Link
                      key={a.id}
                      to="/artists/$id"
                      params={{ id: a.id }}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors"
                    >
                      <img
                        src={a.avatar_url ?? "/images/wesu-mark.png"}
                        alt=""
                        className="size-10 rounded-full object-cover bg-muted"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Artist{a.genre ? ` · ${a.genre}` : ""}
                        </div>
                      </div>
                    </Link>
                  ))}
                </Section>
              )}
              {results.songs.length > 0 && (
                <Section title="Songs" icon={<Music className="size-3.5" />}>
                  {results.songs.map((s) => (
                    <Link
                      key={s.id}
                      to="/browse"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors"
                    >
                      <img
                        src={s.cover_url ?? "/images/wesu-mark.png"}
                        alt=""
                        className="size-10 rounded object-cover bg-muted"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{s.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Song · {(s.artist as { name?: string } | null)?.name ?? "Unknown"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </Section>
              )}
              {results.albums.length > 0 && (
                <Section title="Albums" icon={<Disc3 className="size-3.5" />}>
                  {results.albums.map((a) => (
                    <Link
                      key={a.id}
                      to="/albums"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors"
                    >
                      <img
                        src={a.cover_url ?? "/images/wesu-mark.png"}
                        alt=""
                        className="size-10 rounded object-cover bg-muted"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Album · {(a.artist as { name?: string } | null)?.name ?? "Unknown"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </Section>
              )}
              <button
                onClick={submit}
                className="w-full text-center text-xs font-semibold text-primary py-2.5 border-t border-border hover:bg-accent transition-colors"
              >
                See all results for “{q}”
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
