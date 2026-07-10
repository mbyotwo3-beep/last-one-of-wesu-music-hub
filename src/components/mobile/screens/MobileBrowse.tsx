import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { searchSongs } from "@/lib/music.functions";
import { SongRow } from "@/components/mobile/shared/SongRow";

/**
 * Mobile-optimised browse/search screen.
 * Search input at top, 300ms debounce, genre chips, single-column song list.
 *
 * Feature: wesu-plus-completion
 */
export function MobileBrowse() {
  const searchFn = useServerFn(searchSongs);
  const [query, setQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string, genre: string | null) => {
      setLoading(true);
      try {
        const results = await searchFn({ data: { q: q || undefined, genre: genre || undefined } });
        setSongs(results);
      } catch {
        setSongs([]);
      } finally {
        setLoading(false);
      }
    },
    [searchFn],
  );

  // Initial load
  useEffect(() => {
    doSearch("", null);
  }, [doSearch]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(value, selectedGenre);
    }, 300);
  }

  function handleGenreSelect(genre: string | null) {
    setSelectedGenre(genre);
    doSearch(query, genre);
  }

  // Derive unique genres from results
  const genres = Array.from(new Set(songs.map((s) => s.genre).filter(Boolean))) as string[];

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search songs, artists..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/50"
            aria-label="Search songs"
          />
        </div>
      </div>

      {/* Genre chips */}
      {genres.length > 0 && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => handleGenreSelect(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedGenre === null
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground"
            }`}
          >
            All
          </button>
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => handleGenreSelect(genre)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedGenre === genre
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground"
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}

      {/* Song list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Searching…</div>
        ) : songs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {query ? "No songs found." : "No music yet."}
          </div>
        ) : (
          songs.map((song) => (
            <SongRow
              key={song.id}
              song={{
                id: song.id,
                title: song.title,
                artistName: (song.artist as { name?: string } | null)?.name ?? "Unknown",
                coverUrl: song.cover_url,
                price: song.price,
                durationSeconds: song.duration,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
