import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  Search,
  Globe,
  Music,
  Loader2,
  Radio,
  WifiOff,
  X,
} from "lucide-react";
import { usePlayer } from "@/stores/player";

interface RadioStation {
  id: string;
  name: string;
  country: string;
  genre: string;
  url: string;
  favicon?: string;
}

export const Route = createFileRoute("/radio")({
  component: RadioPage,
});

const M3U_URL = "https://iprd-org.github.io/iprd/site_data/all_stations.m3u";
const CACHE_KEY = "radio_stations_cache";
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

/** Parse a batch of raw M3U text lines into stations */
function parseLinesIntoStations(
  lines: string[],
  startIndex: number,
  currentPendingRef: React.MutableRefObject<Partial<RadioStation>>
): { stations: RadioStation[]; nextIndex: number } {
  const stations: RadioStation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const nameParts = line.split(",");
      const name = nameParts[nameParts.length - 1].trim();

      currentPendingRef.current = {
        name: name || "Unknown Station",
        favicon: logoMatch?.[1],
        genre: groupMatch?.[1] || "General",
        country: "Global",
      };
    } else if (!line.startsWith("#") && currentPendingRef.current.name) {
      const station: RadioStation = {
        ...(currentPendingRef.current as Omit<RadioStation, "id" | "url">),
        url: line,
        id: `radio-${startIndex + stations.length + 1}`,
      };
      stations.push(station);
      currentPendingRef.current = {};
    }
  }

  return { stations, nextIndex: startIndex + stations.length };
}

function RadioPage() {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loadingState, setLoadingState] = useState<"loading" | "streaming" | "done" | "error">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const [playState, setPlayState] = useState<"idle" | "buffering" | "playing" | "paused" | "error">(
    "idle"
  );
  const [volume, setVolume] = useState(1);
  const [visibleCount, setVisibleCount] = useState(80);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingStationRef = useRef<Partial<RadioStation>>({});
  const stationIndexRef = useRef(0);
  const exitSong = usePlayer((s) => s.exitSong);

  // ── Load stations (cache → stream) ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadStations() {
      // 1. Try cache first for instant load
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data, ts } = JSON.parse(raw) as { data: RadioStation[]; ts: number };
          if (Date.now() - ts < CACHE_TTL && data.length > 0) {
            if (!cancelled) {
              setStations(data);
              stationIndexRef.current = data.length;
              setLoadingState("done");
              // Still re-fetch in background to refresh cache silently
              fetchAndStream(true);
              return;
            }
          }
        }
      } catch {
        /* ignore cache errors */
      }

      // 2. No valid cache — stream parse
      fetchAndStream(false);
    }

    async function fetchAndStream(silent: boolean) {
      if (!silent) setLoadingState("loading");
      try {
        const res = await fetch(M3U_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let totalParsed = 0;
        let allStations: RadioStation[] = silent ? [...stations] : [];

        if (!silent) setLoadingState("streaming");

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // process complete lines only
          const lastNewline = buffer.lastIndexOf("\n");
          if (lastNewline === -1) continue;

          const chunk = buffer.slice(0, lastNewline + 1);
          buffer = buffer.slice(lastNewline + 1);

          const lines = chunk.split("\n");
          const { stations: newStations, nextIndex } = parseLinesIntoStations(
            lines,
            totalParsed,
            pendingStationRef
          );

          if (newStations.length > 0) {
            totalParsed = nextIndex;
            allStations = silent ? allStations : [...allStations, ...newStations];
            if (!silent) {
              setStations((prev) => [...prev, ...newStations]);
            } else {
              allStations = [...allStations, ...newStations];
            }
          }
        }

        if (!cancelled) {
          setLoadingState("done");
          // Persist to cache
          try {
            if (!silent) {
              localStorage.setItem(
                CACHE_KEY,
                JSON.stringify({ data: allStations, ts: Date.now() })
              );
            }
          } catch {
            /* quota exceeded or private browsing */
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          if (!silent) {
            setError(err.message || "Failed to load radio stations");
            setLoadingState("error");
          }
        }
      }
    }

    loadStations();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtering & pagination ─────────────────────────────────────────────
  const filteredStations = useMemo(() => {
    if (!searchQuery) return stations;
    const query = searchQuery.toLowerCase();
    return stations.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.genre.toLowerCase().includes(query)
    );
  }, [stations, searchQuery]);

  const displayedStations = useMemo(
    () => filteredStations.slice(0, visibleCount),
    [filteredStations, visibleCount]
  );

  const uniqueGenres = useMemo(() => {
    const genres = new Set<string>();
    stations.forEach((s) => {
      s.genre.split(",").forEach((g) => {
        const t = g.trim();
        if (t && t !== "General" && t !== "") genres.add(t);
      });
    });
    return Array.from(genres).slice(0, 14);
  }, [stations]);

  // ── Playback ───────────────────────────────────────────────────────────
  const playStation = useCallback(
    (station: RadioStation) => {
      exitSong(); // stop global music player

      const audio = audioRef.current;
      if (!audio) return;

      setSelectedStation(station);
      setPlayState("buffering");

      audio.src = station.url;
      audio.load();
      audio
        .play()
        .then(() => setPlayState("playing"))
        .catch(() => {
          setPlayState("error");
          setFailedIds((prev) => new Set(prev).add(station.id));
        });
    },
    [exitSong]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !selectedStation) return;
    if (playState === "playing") {
      audio.pause();
      setPlayState("paused");
    } else {
      setPlayState("buffering");
      audio
        .play()
        .then(() => setPlayState("playing"))
        .catch(() => setPlayState("error"));
    }
  }, [playState, selectedStation]);

  const stopStation = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setSelectedStation(null);
    setPlayState("idle");
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const isCurrentlyPlaying = (s: RadioStation) =>
    selectedStation?.id === s.id && (playState === "playing" || playState === "buffering");

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 py-8 pb-36">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Radio className="size-8 text-primary animate-pulse" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              World Radio
            </h1>
          </div>
          <p className="text-muted-foreground text-base max-w-md mx-auto">
            {loadingState === "streaming"
              ? `Loading… ${stations.length.toLocaleString()} stations found so far`
              : loadingState === "done"
              ? `${stations.length.toLocaleString()} stations from around the world`
              : "Stream free IP radio stations from around the globe."}
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by station name or genre…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(80);
              }}
              className="w-full bg-card border border-border rounded-full pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/45 text-foreground placeholder:text-muted-foreground shadow-sm"
            />
          </div>
        </div>

        {/* Initial loading spinner — only shown before first stations arrive */}
        {loadingState === "loading" && stations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Fetching radio playlist…</p>
          </div>
        )}

        {loadingState === "error" && stations.length === 0 && (
          <div className="text-center py-12 text-destructive">
            <WifiOff className="size-10 mx-auto mb-3 opacity-70" />
            <p className="font-semibold">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-full text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {stations.length > 0 && (
          <>
            {/* Genre Filter Tags */}
            {uniqueGenres.length > 0 && (
              <div className="mb-8">
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setVisibleCount(80);
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase transition-colors ${
                      searchQuery === ""
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    All
                  </button>
                  {uniqueGenres.map((genre) => (
                    <button
                      key={genre}
                      onClick={() => {
                        setSearchQuery(genre);
                        setVisibleCount(80);
                      }}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase transition-colors ${
                        searchQuery.toLowerCase() === genre.toLowerCase()
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedStations.map((station) => {
                const active = selectedStation?.id === station.id;
                const playing = isCurrentlyPlaying(station);
                const buffering = active && playState === "buffering";
                const failed = failedIds.has(station.id);

                return (
                  <div
                    key={station.id}
                    onClick={() => !failed && playStation(station)}
                    className={`bg-card border rounded-xl p-4 transition-all group shadow-sm flex flex-col gap-3 ${
                      failed
                        ? "border-destructive/40 opacity-60 cursor-not-allowed"
                        : active
                        ? "border-primary ring-2 ring-primary/20 cursor-pointer"
                        : "border-border/60 hover:border-primary/50 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Logo / icon */}
                      <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center shrink-0 overflow-hidden">
                        {station.favicon ? (
                          <img
                            src={station.favicon}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music className="size-5 text-primary/60" />
                        )}
                      </div>

                      {/* Name + genre */}
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`font-semibold mb-0.5 truncate transition-colors ${
                            active ? "text-primary" : "text-foreground group-hover:text-primary"
                          }`}
                        >
                          {station.name}
                        </h3>
                        <span className="text-xs text-muted-foreground truncate block">
                          {station.genre}
                        </span>
                      </div>

                      {/* Play / buffering / error button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (failed) return;
                          if (active) {
                            togglePlay();
                          } else {
                            playStation(station);
                          }
                        }}
                        disabled={failed}
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          failed
                            ? "bg-destructive/20 text-destructive cursor-not-allowed"
                            : playing || buffering
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
                        }`}
                      >
                        {failed ? (
                          <WifiOff className="size-4" />
                        ) : buffering ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : active && playState === "playing" ? (
                          <Pause className="size-4" />
                        ) : (
                          <Play className="size-4 ml-0.5" />
                        )}
                      </button>
                    </div>

                    {failed && (
                      <p className="text-xs text-destructive/80 leading-tight">
                        Stream unavailable — try another station
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Streaming progress hint */}
            {loadingState === "streaming" && (
              <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Still loading more stations…
              </div>
            )}

            {/* Load More */}
            {filteredStations.length > visibleCount && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setVisibleCount((p) => p + 80)}
                  className="px-6 py-2.5 bg-secondary text-foreground hover:bg-secondary/80 rounded-full text-sm font-semibold transition-colors"
                >
                  Load more ({(filteredStations.length - visibleCount).toLocaleString()} remaining)
                </button>
              </div>
            )}

            {filteredStations.length === 0 && searchQuery && (
              <div className="text-center py-12">
                <Music className="size-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No stations match "{searchQuery}".</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Now Playing Bar ──────────────────────────────────────────────── */}
      {selectedStation && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border p-3 z-40 shadow-2xl">
          <div className="container mx-auto flex items-center gap-4 max-w-4xl">
            {/* Logo */}
            <div className="w-11 h-11 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
              {selectedStation.favicon ? (
                <img
                  src={selectedStation.favicon}
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="size-5 text-white" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate text-sm">
                {selectedStation.name}
              </h3>
              <p className="text-xs text-muted-foreground truncate">{selectedStation.genre}</p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Play / pause */}
              <button
                onClick={togglePlay}
                disabled={playState === "buffering" || playState === "error"}
                className="w-11 h-11 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-md disabled:opacity-50"
              >
                {playState === "buffering" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : playState === "playing" ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5 ml-1" />
                )}
              </button>

              {/* Volume */}
              <div className="hidden sm:flex items-center gap-2">
                <Volume2 className="size-4 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 accent-primary h-1 cursor-pointer"
                />
              </div>

              {/* Close */}
              <button
                onClick={stopStation}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                title="Stop radio"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onPlaying={() => setPlayState("playing")}
        onPause={() => setPlayState((p) => (p === "buffering" ? "buffering" : "paused"))}
        onWaiting={() => setPlayState("buffering")}
        onError={() => {
          setPlayState("error");
          if (selectedStation) {
            setFailedIds((prev) => new Set(prev).add(selectedStation.id));
          }
        }}
        onStalled={() => setPlayState("buffering")}
      />
    </div>
  );
}
