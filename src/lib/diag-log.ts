/**
 * On-device diagnostics for the native shell.
 *
 * "The page is blank / says no music" is indistinguishable from the outside
 * between a stale cached client, a malformed server-fn response, a service
 * worker problem and a real network failure. This module records the facts on
 * the device so one screenshot of the diagnostics panel answers the question.
 *
 * It is deliberately cheap: RPC metadata only (status, content type, timing),
 * a capped ring buffer, and console warnings/errors. Response bodies are never
 * read here — that would fight the caller for the stream.
 */

export type DiagEntry = {
  /** epoch ms */
  t: number;
  /** rpc | rpc-fail | warn | error | rejection */
  k: string;
  /** short description */
  d: string;
};

const KEY = "wesu:diag-log";
const MAX = 120;

let installed = false;
let entries: DiagEntry[] = [];
let loaded = false;

function load(): DiagEntry[] {
  if (loaded) return entries;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed.slice(-MAX);
    }
  } catch {
    /* private mode / quota — in-memory only */
  }
  return entries;
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    /* ignore */
  }
}

export function logDiag(kind: string, detail: string) {
  if (typeof window === "undefined") return;
  load();
  entries.push({ t: Date.now(), k: kind, d: detail.slice(0, 600) });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
}

export function getDiagLog(): DiagEntry[] {
  if (typeof window === "undefined") return [];
  return [...load()].reverse();
}

export function clearDiagLog() {
  entries = [];
  loaded = true;
  persist();
}

function brief(value: unknown): string {
  try {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === "string") return value;
    return JSON.stringify(value)?.slice(0, 500) ?? String(value);
  } catch {
    return String(value);
  }
}

export function installDiagLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  load();

  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    try {
      logDiag("warn", args.map(brief).join(" "));
    } catch {
      /* never let logging break the app */
    }
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    try {
      logDiag("error", args.map(brief).join(" "));
    } catch {
      /* ignore */
    }
    origError(...args);
  };

  window.addEventListener("error", (e) => {
    logDiag("error", `${e.message || "error"} @ ${e.filename || "?"}:${e.lineno || 0}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logDiag("rejection", brief(e.reason));
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const isRpc = url.includes("/_serverFn/");
    const started = Date.now();
    try {
      const res = await origFetch(input as RequestInfo, init);
      if (isRpc) {
        const id = url.split("/_serverFn/")[1]?.slice(0, 12) ?? "?";
        logDiag(
          "rpc",
          `${res.status} ct=${res.headers.get("content-type") ?? "-"} ser=${
            res.headers.get("x-tss-serialized") ?? "-"
          } ${Date.now() - started}ms fn=${id}`,
        );
      }
      return res;
    } catch (err) {
      if (isRpc) {
        logDiag("rpc-fail", `${Date.now() - started}ms ${brief(err)}`);
      }
      throw err;
    }
  };
}
