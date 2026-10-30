import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Trash2, X } from "lucide-react";
import { clearDiagLog, getDiagLog, type DiagEntry } from "@/lib/diag-log";
import { copyTextToClipboard } from "@/lib/external-url";

type ProbeResult = {
  id: string;
  text: string;
  status: "ok" | "warn" | "bad";
  ms: number;
};

const ARRAY_PROBES = [
  ["getNewReleases", "New releases"],
  ["getFeaturedAlbums", "Featured albums"],
  ["getTrendingSongs", "Trending songs"],
  ["getTopArtists", "Top artists"],
  ["getRecentAlbums", "Recent albums"],
  ["getPublicPlaylists", "Public playlists"],
  ["getGenres", "Genres"],
] as const;

function summarizeArray(v: unknown) {
  if (Array.isArray(v)) {
    return {
      status: (v.length > 0 ? "ok" : "warn") as "ok" | "warn",
      text: `array(${v.length})`,
    };
  }
  return {
    status: "bad" as const,
    text: `NON-ARRAY ${v === null ? "null" : typeof v} ${
      JSON.stringify(v)?.slice(0, 90) ?? String(v).slice(0, 90)
    }`,
  };
}

function summarizeSearch(v: unknown) {
  if (!v || typeof v !== "object") {
    return { status: "bad" as const, text: `NON-OBJECT ${v === null ? "null" : typeof v}` };
  }
  const obj = v as Record<string, unknown>;
  const parts = ["songs", "albums", "artists"].map(
    (k) => `${k}:${Array.isArray(obj[k]) ? (obj[k] as unknown[]).length : typeof obj[k]}`,
  );
  const any = ["songs", "albums", "artists"].some(
    (k) => Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0,
  );
  return { status: (any ? "ok" : "warn") as "ok" | "warn", text: `{ ${parts.join(" ")} }` };
}

export function DeviceDiagnostics({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<DiagEntry[]>([]);
  const [build, setBuild] = useState<{ loaded: string; live: string; match: boolean | null }>({
    loaded: "",
    live: "",
    match: null,
  });
  const [env, setEnv] = useState<string[]>([]);
  const [copyNote, setCopyNote] = useState("");

  const refreshPressure = useCallback(() => {
    setEvents(getDiagLog().slice(0, 40));
  }, []);

  useEffect(() => {
    refreshPressure();
    const lines = [
      `route: ${window.location.pathname}${window.location.search}`,
      `online: ${navigator.onLine}`,
      `native: ${!!(window as any).Capacitor?.isNativePlatform?.()}`,
      `service worker: ${navigator.serviceWorker?.controller ? "controlling" : "not controlling"}`,
      `ua: ${navigator.userAgent}`,
    ];
    navigator.serviceWorker
      ?.getRegistrations?.()
      .then((regs) => lines.push(`registrations: ${regs.length}`))
      .catch(() => {})
      .finally(() => setEnv([...lines]));

    const scripts = Array.from(document.scripts)
      .map((s) => s.src)
      .filter(Boolean);
    const loadedIndex =
      scripts.find((s) => s.includes("/assets/index-")) ??
      scripts.find((s) => s.includes("/assets/")) ??
      "(no script src)";
    setBuild({ loaded: loadedIndex, live: "", match: null });
    fetch("/", { cache: "no-store" })
      .then((r) => r.text())
      .then((html) => {
        const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
        const live = m?.[0] ?? "(not found)";
        const loadedFile = loadedIndex.split("/").pop() ?? loadedIndex;
        const liveFile = live.split("/").pop() ?? live;
        setBuild({
          loaded: loadedIndex,
          live,
          match: loadedIndex !== "(no script src)" && liveFile === loadedFile,
        });
      })
      .catch(() => setBuild({ loaded: loadedIndex, live: "(fetch failed)", match: null }));
  }, [refreshPressure]);

  const runProbes = useCallback(async () => {
    setRunning(true);
    setResults([]);
    try {
      const mod = (await import("@/lib/music.functions")) as Record<string, any>;
      const out: ProbeResult[] = [];
      for (const [id, label] of ARRAY_PROBES) {
        const t0 = performance.now();
        try {
          const v = await mod[id]();
          const s = summarizeArray(v);
          out.push({ id: label, ...s, ms: Math.round(performance.now() - t0) });
        } catch (e) {
          out.push({
            id: label,
            status: "bad",
            text: (e as Error)?.message ?? String(e),
            ms: Math.round(performance.now() - t0),
          });
        }
      }
      {
        const t0 = performance.now();
        try {
          const v = await mod.globalSearch({ data: { q: "apo", limit: 30 } });
          const s = summarizeSearch(v);
          out.push({ id: "Search “apo”", ...s, ms: Math.round(performance.now() - t0) });
        } catch (e) {
          out.push({
            id: "Search “apo”",
            status: "bad",
            text: (e as Error)?.message ?? String(e),
            ms: Math.round(performance.now() - t0),
          });
        }
      }
      setResults(out);
    } finally {
      setRunning(false);
      setTimeout(refreshPressure, 100);
    }
  }, [refreshPressure]);

  useEffect(() => {
    void runProbes();
  }, [runProbes]);

  async function refreshApp() {
    if (!navigator.onLine) {
      setCopyNote("You're offline — connect to the internet before refreshing.");
      return;
    }
    setCopyNote("Clearing cached app files…");
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* ignore */
    }
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("wesu-")).map((k) => caches.delete(k)),
      );
    } catch {
      /* ignore */
    }
    location.reload();
  }

  async function copyReport() {
    const lines = [
      "Wesu+ diagnostics report",
      `time: ${new Date().toISOString()}`,
      ...env,
      `loaded: ${build.loaded}`,
      `live:   ${build.live}`,
      `stale:  ${build.match === false ? "YES" : build.match === true ? "no" : "unknown"}`,
      "",
      ...results.map((r) => `${r.status.toUpperCase()} ${r.id}: ${r.text} (${r.ms}ms)`),
      "",
      ...events.slice(0, 30).map((e) => `${new Date(e.t).toISOString()} ${e.k} ${e.d}`),
    ];
    const ok = await copyTextToClipboard(lines.join("\n"));
    setCopyNote(ok ? "Report copied" : "Clipboard unavailable — screenshot instead");
  }

  const icon = (s: ProbeResult["status"]) =>
    s === "ok" ? (
      <CheckCircle2 className="size-4 text-emerald-500" />
    ) : s === "warn" ? (
      <AlertTriangle className="size-4 text-amber-500" />
    ) : (
      <AlertTriangle className="size-4 text-destructive" />
    );

  return (
    <div className="fixed inset-0 z-[80] bg-background/98 backdrop-blur-xl overflow-y-auto">
      <div
        className="mx-auto max-w-2xl p-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="size-5 text-primary" /> App diagnostics
          </h2>
          <button onClick={onClose} className="p-2 text-muted-foreground" aria-label="Close">
            <X className="size-6" />
          </button>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Build freshness</h3>
          <p className="text-xs text-muted-foreground break-all">loaded: {build.loaded || "…"}</p>
          <p className="text-xs text-muted-foreground break-all mt-1">live: {build.live || "…"}</p>
          <p
            className={`text-xs mt-2 font-semibold ${
              build.match === true
                ? "text-emerald-500"
                : build.match === false
                  ? "text-destructive"
                  : "text-amber-500"
            }`}
          >
            {build.match === true
              ? "This app is running the current deploy"
              : build.match === false
                ? "STALE CLIENT — this app is running an older deploy. Refresh app."
                : "Could not compare with the live deploy"}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Environment</h3>
          <ul className="space-y-1">
            {env.map((l) => (
              <li key={l} className="text-[11px] text-muted-foreground break-all">
                {l}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Live data probes</h3>
            <button
              onClick={runProbes}
              disabled={running}
              className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {running ? "Running…" : "Run again"}
            </button>
          </div>
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs">
                {icon(r.status)}
                <span className="flex-1">
                  <span className="font-medium">{r.id}:</span>{" "}
                  <span className="text-muted-foreground">{r.text}</span>{" "}
                  <span className="text-muted-foreground/70">({r.ms}ms)</span>
                </span>
              </li>
            ))}
            {results.length === 0 && <li className="text-xs text-muted-foreground">Running…</li>}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Recent app events</h3>
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {events.length === 0 && (
              <li className="text-xs text-muted-foreground">No warnings or errors recorded.</li>
            )}
            {events.map((e, i) => (
              <li key={`${e.t}-${i}`} className="text-[11px] text-muted-foreground break-all">
                <span className="text-foreground/80">{e.k}</span> {e.d}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap gap-2 pb-10">
          <button
            onClick={refreshApp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            <RefreshCw className="size-4" /> Refresh app
          </button>
          <button
            onClick={copyReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm font-medium"
          >
            Copy report
          </button>
          <button
            onClick={() => {
              clearDiagLog();
              setEvents([]);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm font-medium"
          >
            <Trash2 className="size-4" /> Clear events
          </button>
        </div>
        {copyNote && <p className="text-xs text-muted-foreground pb-8">{copyNote}</p>}
      </div>
    </div>
  );
}
