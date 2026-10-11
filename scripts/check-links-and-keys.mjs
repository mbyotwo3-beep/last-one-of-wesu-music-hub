/**
 * Does every internal link in the app point at a route that exists?
 *
 * WHY THIS EXISTS
 *
 * Three real bugs in this project were found by LOOKING at the app rather than by
 * reading the code: the offline page, the /library error, and the hero stuck on
 * one album. Reading produced a confident wrong answer every time.
 *
 * A dead internal link is the same kind of bug and is trivially checkable: it is
 * a string in one file that names a path no router will ever match. Tapping it
 * takes a listener to a 404, or worse to a blank page.
 *
 * The hard part is not collecting links, it is knowing which paths are real
 * without false-positives on dynamic segments. A link to /albums/$id is valid;
 * /albums/gone is not. So route paths are built the way TanStack builds them and
 * $params match anything, and anything that cannot be matched is reported.
 *
 * Query strings and hashes are stripped, because /browse?genre=afro is fine.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const problems = [];
const notes = [];
const srcFiles = [];
const routeFiles = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry.name)) {
      srcFiles.push(p);
      if (dir.includes("routes")) routeFiles.push(p);
    }
  }
}
if (existsSync("src")) walk("src");

// --- the real route paths, built the way the file-based router does
const realRoutes = new Set();
for (const f of routeFiles) {
  let base = relative("src/routes", f).replace(/\\/g, "/").replace(/\.tsx?$/, "");
  if (base === "index") {
    realRoutes.add("/");
    continue;
  }
  // albums.$id.tsx must become /albums/$id, NOT /albums/id.
  //
  // The first version replaced ".$" with "/" and dropped the param name, so
  // realRoutes held "/albums/id" while links hold "/albums/$id". Every dynamic
  // link then looked dead — 41 false alarms on correct code.
  base = base.replace(/\/index$/, "").replace(/\.\$/g, "/$").replace(/\./g, "/");
  realRoutes.add("/" + base);
  if (base.includes("/$")) realRoutes.add("/" + base.slice(0, base.indexOf("/$")));
}

/**
 * Does a path match a real route?
 *
 * `$name` in a LINK is a runtime placeholder — <Link to="/albums/$id"
 * params={{id}} /> is correct TanStack syntax, and TanStack substitutes it
 * before the router ever sees it. The first version compared the raw string and
 * reported 41 dead links that are all perfectly valid.
 *
 * So both sides are reduced to a shape: dynamic segments become a wildcard on
 * each side, then compared position by position.
 */
/**
 * A path that names a real file in public/ is an asset, not a dead route.
 *
 * /favicon.png, /manifest.webmanifest and the PWA icons are referenced from
 * <link> tags and from the manifest object, which the object-literal form of the
 * link regex now picks up. They are files, and they exist.
 */
function isStaticAsset(path) {
  const clean = path.split("?")[0].split("#")[0];
  // Up to 12 characters: "manifest.webmanifest" is an 11-character extension,
  // and a 2-5 cap quietly reported it as a dead route.
  if (!/\.[a-z0-9]{2,12}$/i.test(clean)) return false;
  try {
    return existsSync(join("public", decodeURIComponent(clean).replace(/^\//, "")));
  } catch {
    return false;
  }
}

function shape(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith("$") || s.startsWith(":") ? "*" : s));
}
const routeShapes = new Set([...realRoutes].map((r) => shape(r).join("/")));

function matches(path) {
  if (realRoutes.has(path)) return true;
  return routeShapes.has(shape(path).join("/"));
}

/**
 * Collect internal link targets.
 *
 * Both forms matter and the first version only had one:
 *
 *   to="/albums/$id"      JSX attribute
 *   { to: "/recently-added", ... }   object property
 *
 * The nav arrays in AppleMusicSidebar, PlayerBar and the mobile tab bar are all
 * object literals, so an attribute-only regex checked none of the primary
 * navigation — the most likely place for a renamed route to leave a dead link.
 */
const LINK =
  /(?:to|href)=["'`](\/[^"'`\s]*?)["'`]|\b(?:to|href):\s*["'`](\/[^"'`\s]*?)["'`]/g;
const dead = [];
let checked = 0;

for (const f of srcFiles) {
  const src = readFileSync(f, "utf8");
  // Strip comments so a path inside an explanation is not counted as a link.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const m of code.matchAll(LINK)) {
    let target = m[1] ?? m[2];
    if (!target) continue;
    // Skip template placeholders and non-navigation targets.
    if (target.includes("${") || target.startsWith("/@") || target.startsWith("//")) continue;
    target = target.split("?")[0].split("#")[0];
    if (!target || target === "/") continue;
    if (isStaticAsset(target)) continue;
    checked++;
    if (!matches(target)) {
      dead.push(`${relative(".", f).replace(/\\/g, "/")} -> ${target}`);
    }
  }
}

if (dead.length) {
  const uniq = [...new Set(dead)];
  problems.push(
    `${uniq.length} internal link(s) point at a route that does not exist:\n` +
      uniq
        .slice(0, 25)
        .map((d) => `          ${d}`)
        .join("\n") +
      (uniq.length > 25 ? `\n          ...and ${uniq.length - 25} more` : ""),
  );
} else {
  notes.push(`${checked} internal links all resolve to a real route`);
}

/**
 * Find the span of an arrow callback starting at `from` in a source string.
 *
 * Returns the text of the body, or null if it cannot be delimited. Braces,
 * parens and brackets are counted so strings and nested callbacks do not
 * confuse it; string literals are skipped so a `}` inside one does not end the
 * scan early.
 */
function arrowBody(src, from) {
  let i = from;
  // Find the => that introduces the body.
  while (i < src.length && !(src[i] === "=" && src[i + 1] === ">")) i++;
  if (i >= src.length) return null;
  i += 2;
  while (i < src.length && /\s/.test(src[i])) i++;
  const open = src[i];
  if (open === "<") {
    // Concise body: the element itself. Take to the end of the statement.
    return src.slice(i, i + 1200);
  }
  if (open !== "{" && open !== "(") return null; // ({...}) object literal, or a call

  const close = open === "{" ? "}" : open === "(" ? ")" : "]";
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return null;
}

/**
 * React keys: a missing key on a stateful list causes wrong-row bugs.
 *
 * Only JSX is checked, and only the callback's OWN body is examined.
 *
 * Three earlier versions of this rule were all wrong:
 *   - it scanned a fixed window, so `list.map(t => ({ … }))` in DownloadsSection
 *     was flagged because a `return (<JSX>)` appeared 20 lines later in an
 *     unrelated function
 *   - it only recognised concise arrow bodies, so every block-bodied card map
 *     was invisible
 *   - its path filter required a leading "/", so it checked zero files and
 *     printed "every JSX .map() has a key"
 */
const noKey = [];
let mapsConsidered = 0;
for (const f of srcFiles) {
  if (f.includes("__tests__")) continue;
  const norm = f.replace(/\\/g, "/");
  // No leading slash: join() produces "src/components/...", so requiring
  // "/src/components/" matched NOTHING.
  if (!norm.includes("src/components/") && !norm.includes("src/routes/")) continue;
  const code = readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  for (const m of code.matchAll(/\.map\s*\(\s*\(?[^)]*\)?\s*=>/g)) {
    const body = arrowBody(code, m.index + m[0].length - 2);
    if (!body) continue;
    // Does the body actually produce elements?
    const producesJsx = /=>\s*(?:\{[\s\S]*?)?\breturn\s*\(?\s*</.test(body) || /=>\s*</.test(body);
    if (!producesJsx) continue;
    mapsConsidered++;
    if (/key=\{/.test(body)) continue;
    const lineNo = code.slice(0, m.index).split(/\r?\n/).length;
    noKey.push(`${relative(".", f).replace(/\\/g, "/")}:${lineNo}`);
  }
}
if (noKey.length) {
  problems.push(
    `${noKey.length} JSX .map() with no key (out of ${mapsConsidered} JSX maps):\n` +
      noKey
        .slice(0, 15)
        .map((d) => `          ${d}`)
        .join("\n") +
      (noKey.length > 15 ? `\n          ...and ${noKey.length - 15} more` : ""),
  );
} else {
  notes.push(`all ${mapsConsidered} JSX .map() calls have a key`);
}

console.log("  links and keys");
for (const n of notes) console.log(`    ${n}`);
if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`  FAIL ${p}`);
  process.exit(1);
}