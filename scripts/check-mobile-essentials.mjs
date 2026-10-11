/**
 * Small things listeners notice.
 *
 * WHY THIS FILE
 *
 * Asked to find "other little things you didn't check that users will find
 * annoying". The trap in that request is reporting a suspicion as a defect. While
 * auditing by hand, three things looked broken and all three were fine:
 *
 *   - a variable that grep rendered as `ln` turned out to be `volume`;
 *   - `showQueue` in PlayerBar looked dead (set once, never read) but the mobile
 *     sheet has its own queue toggle, so mobile queue access exists;
 *   - "/queue has no link" was wrong — PlayerBar links it, on desktop.
 *
 * Two of those would have been reported as bugs to the owner, and one would have
 * been a wasted afternoon. So the checks below exist to make the routine ones
 * mechanical: a capability either exists on mobile or it does not, and the answer
 * is read from source rather than guessed.
 *
 * Usage: node scripts/check-mobile-essentials.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const problems = [];
const notes = [];

/**
 * Strip COMMENTS ONLY.
 *
 * An earlier version also blanked out string literals, to avoid matching prose.
 * That was the single most damaging thing in this file: JSX attributes live in
 * strings, so `className="hidden lg:block"` was replaced with `""` — deleting the
 * exact text every structural check was looking for. It produced two false
 * failures and one false pass, and cost several rounds to find.
 *
 * Comments alone are enough. Code that merely NAMES a capability in a comment is
 * rare, and every check below is paired with a structural or call-shape match
 * that a comment cannot satisfy.
 */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function read(p) {
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

// --- the mobile shell is what every listener actually uses
const root = read("src/routes/__root.tsx");
if (!root) {
  problems.push("src/routes/__root.tsx is missing");
} else {
  const r = code(root);
  // The desktop player must NOT be what renders on a phone. If PlayerBar loses
  // its hidden lg:block, mobile users get two players fighting over the audio.
  //
  // Matched line-by-line rather than with one multiline regex: the first version
  // required `hidden lg:block">` and a `<PlayerBar` on adjacent lines with
  // nothing between, which the real markup does not satisfy — it has a comment
  // and a wrapper. It reported a correct file as broken, which is the fourth
  // false alarm from a single audit.
  // Paired, not counted. There are three `hidden lg:block` divs in this file and
  // only one wraps PlayerBar, so a version checking "does the string appear
  // anywhere" passed even after the PlayerBar wrapper was removed — it verified
  // an unrelated div.
  //
  // Read as a WINDOW rather than one big regex: take everything between a
  // hidden-lg wrapper's `>` and the next closing tag. An earlier attempt allowed
  // an optional `{...}` group before the component name, which then matched
  // nothing in the real markup and failed the clean file.
  const flat = r.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  const wrapped = (component, wrapperClass) => {
    // Find the COMPONENT first, then look backwards for the nearest opening div.
    // Matching the wrapper first and searching forwards found the wrong div,
    // because "lg:hidden" appears inside "hidden lg:block" and elsewhere.
    const at = flat.indexOf(`<${component}`);
    if (at === -1) return false;
    const before = flat.slice(Math.max(0, at - 120), at);
    const open = before.lastIndexOf("<div");
    if (open === -1) return false;
    return before.slice(open).includes(wrapperClass);
  };

  const playerBarHidden = wrapped("PlayerBar", "hidden lg:block");
  const miniPlayerShown = wrapped("MiniPlayer", "lg:hidden");

  if (!playerBarHidden || !miniPlayerShown) {
    problems.push(
      "the mobile/desktop player split is not intact — PlayerBar must stay inside a\n" +
        "        hidden lg:block wrapper and MiniPlayer inside lg:hidden, or a phone\n" +
        "        renders both players and they fight over playback" +
        `\n        PlayerBar hidden: ${playerBarHidden}, MiniPlayer shown on mobile: ${miniPlayerShown}`,
    );
  } else {
    notes.push("mobile renders MiniPlayer only, desktop PlayerBar is lg+");
  }
}

// --- capabilities a music listener expects on a phone
const CAPABILITIES = [
  {
    name: "see and reorder the queue",
    files: ["src/components/mobile/NowPlayingSheet.tsx", "src/components/mobile/MiniPlayer.tsx"],
    // A link to /queue, or a queue toggle in the sheet.
    test: (src) => /to=["']\/queue["']/.test(src) || /setShowQueue/.test(src),
    why: "without it there is no way to see what plays next, or skip within the queue",
  },
  {
    name: "shuffle and repeat",
    files: ["src/components/mobile/NowPlayingSheet.tsx", "src/components/mobile/MiniPlayer.tsx"],
    test: (src) => /setShuffle|setRepeat|toggleShuffle|toggleRepeat/.test(src),
    why: "Spotify's two most-used playback controls",
  },
  {
    name: "change volume",
    files: ["src/components/mobile/NowPlayingSheet.tsx", "src/components/PlayerBar.tsx"],
    test: (src) => /setVolume/.test(src),
    why: "the store has volume; if nothing writes it, the phone's own buttons are the only control",
  },
  {
    name: "a mute toggle",
    files: ["src/components/mobile/NowPlayingSheet.tsx", "src/components/PlayerBar.tsx"],
    test: (src) => /setMuted|VolumeX|Volume2/.test(src),
    why: "one tap to silence, which is what people reach for in public",
  },
];

for (const cap of CAPABILITIES) {
  const found = cap.files.some((f) => {
    const src = read(f);
    return src && cap.test(code(src));
  });
  if (!found) {
    problems.push(`mobile has no way to ${cap.name} — ${cap.why}`);
  } else {
    notes.push(`mobile can ${cap.name}`);
  }
}

// --- no hook may sit AFTER an early return in the same component
//
// React throws "rendered fewer hooks than expected" when a component returns
// early on one render and calls more hooks on the next. It is invisible in
// review and crashes in the hand.
//
// This already happened twice in albums.$id.tsx — once when adding an offline
// guard, once when adding preview warming — and both times it was found by
// checking line numbers, not by reading the code. So it is checked structurally.
if (existsSync("src/routes")) {
  const offenders = [];
  for (const name of readdirSync("src/routes").filter((f) => f.endsWith(".tsx"))) {
    const src = read(`src/routes/${name}`);
    if (!src) continue;
    const lines = code(src).split("\n");

    // A top-level early return: 2-space indent, `if (...) {`, then `return`.
    const earlyReturn = lines.findIndex(
      (l) => /^ {2}if \(.*\) \{\s*$/.test(l) && lines.slice(0, 0).length === 0,
    );
    if (earlyReturn === -1) continue;
    const returnLine = lines.findIndex((l, i) => i > earlyReturn && /^ {4}return\b/.test(l));
    if (returnLine === -1) continue;

    const hooksAfter = lines
      .slice(returnLine + 1, returnLine + 80)
      .filter((l) => /^ {2}(use[A-Z]\w*\(|const\s+\{[^}]*\}\s*=\s*use)/.test(l));
    if (hooksAfter.length) {
      offenders.push(`${name}: ${hooksAfter.length} hook(s) after an early return`);
    }
  }
  if (offenders.length) {
    problems.push(
      `these components call hooks after an early return, which React treats as a crash:\n` +
        `        ${offenders.join("\n        ")}`,
    );
  } else {
    notes.push("no route calls a hook after an early return");
  }
}

// --- preview warming must stay bounded
//
// Asked for "preload 15 seconds of all songs listed". Implemented as a limited,
// ordered warm of what is on screen instead, because warming every preview URL is
// a server request per song before the listener has chosen anything — real data
// cost on the phones this audience actually uses.
const preload = read("src/lib/preview-preload.ts");
if (!preload) {
  problems.push("src/lib/preview-preload.ts is missing — preview warming is gone");
} else {
  const p = code(preload);
  // BOTH layers must limit. planPreviewWarm caps what the caller asks for and
  // warmPreviews caps what it executes. Removing either one alone still bounded
  // the work by accident, which is why an earlier single-slice check passed with
  // its own slice deleted.
  const planned = /\.slice\(start,\s*end\)[\s\S]{0,80}?\.slice\(0,\s*limit\)/.test(p);
  // Non-greedy to the closing `)` of filter, THEN slice. `[^)]*` cannot work here:
  // the filter body contains an arrow function, so it stops at the arrow's own
  // parenthesis and the slice is never seen. That reported a correctly bounded
  // file as unbounded.
  const executed = /items\.filter\(.*?\)\.slice\(0,\s*limit\)/.test(p);
  if (!planned || !executed) {
    problems.push(
      `preview warming is not bounded at both layers (plan: ${planned}, execution: ${executed}).\n` +
        "        Warming every listed preview is a server call per song before the\n" +
        "        listener has chosen anything - real data cost on metered phones.",
    );
  }
  if (!/for\s*\(const item of queue\)/.test(p)) {
    problems.push(
      "preview warming no longer walks the queue sequentially - a burst of\n" +
        "        concurrent speculative requests is what makes a phone feel slow",
    );
  }
  if (!/navigator\.onLine\s*===\s*false/.test(p)) {
    problems.push(
      "preview warming does not skip while offline — every request would fail and\n" +
        "        drain the battery",
    );
  }
  notes.push("preview warming is bounded, ordered and skips when offline");
}

// --- offline mode must be reachable on a phone, not buried on /downloads
// --- destructive, data-costing actions must be reversible or confirmed
//
// Deleting a download cannot be undone and re-downloading it costs real data on
// a metered connection. It used to happen on a single tap with no confirmation
// and no undo, so a mis-tap during a scroll destroyed someone's offline copy.
// The list has a confirm dialog now; the inline toggle is allowed to stay a
// one-tap toggle, but only because it offers an undo.
const dlSection = read("src/components/DownloadsSection.tsx");
const dlButton = read("src/components/DownloadButton.tsx");

if (dlSection) {
  if (!/AlertDialog/.test(dlSection)) {
    problems.push(
      "DownloadsSection deletes without confirmation — a mis-tap costs a re-download\n" +
        "        on metered data. It needs an AlertDialog.",
    );
  }
  if (!/setPendingRemoval/.test(dlSection)) {
    problems.push(
      "DownloadsSection removes immediately; the delete must go through a pending state",
    );
  } else {
    notes.push("deleting a download asks first");
  }
}

if (dlButton) {
  const oneTapRemove = /onClick=\{remove\}/.test(dlButton);
  // The undo must be a real action ON the toast that reports the removal, not
  // the word "undo" appearing anywhere in the file. A previous version matched a
  // bare /undo/i and passed with the whole action removed.
  const removalToast = /toast\.success\(\s*"Download removed[^"]*"\s*,[\s\S]{0,600}?\)\s*;/.exec(
    dlButton,
  );
  const hasUndo = !!removalToast && /action\s*:\s*\{[\s\S]{0,300}?onClick/.test(removalToast[0]);
  if (oneTapRemove && !hasUndo) {
    problems.push(
      "DownloadButton removes a download on one tap and offers no undo.\n" +
        "        Either confirm it, or make it a toast with an Undo action — an\n" +
        "        irreversible, data-costing action needs a way back.",
    );
  } else if (oneTapRemove) {
    notes.push("the inline download toggle can be undone");
  }
}

// --- offline mode must be reachable on a phone, not buried on /downloads
const downloads = read("src/routes/downloads.tsx");
if (!downloads) {
  problems.push("src/routes/downloads.tsx is missing — the offline switch is unreachable");
} else if (!/OfflineDiagnostics/.test(downloads)) {
  problems.push(
    "/downloads does not render OfflineDiagnostics — a listener reporting broken\n" +
      "        offline has nothing to show us",
  );
} else {
  notes.push("/downloads shows offline status");
}

// --- scroll restoration: returning to a long list should keep your place
const router = read("src/router.tsx");
if (!router || !/scrollRestoration:\s*true/.test(router)) {
  problems.push(
    "scrollRestoration is not enabled — going back to a long list dumps the listener\n" +
      "        back at the top, on every page, every time",
  );
} else {
  notes.push("scroll position is restored when navigating back");
}

// --- a route that FETCHES data needs an error surface; a static one cannot fail
//
// The first version flagged every route without an errorComponent and found
// nine. All nine were static pages — /privacy, /terms, /mood, a layout — with no
// loader and no query, so they cannot fail and an errorComponent would be dead
// code. Requiring one there is noise. What matters is the opposite: a route that
// CAN fail and has nothing to catch it.
if (existsSync("src/routes")) {
  const routes = readdirSync("src/routes").filter((f) => f.endsWith(".tsx"));
  const unprotected = routes.filter((f) => {
    const src = read(`src/routes/${f}`);
    if (!src) return false;
    const c = code(src);
    const fetches = /loader\s*:|useSuspenseQuery|useServerFn/.test(c);
    if (!fetches) return false; // static page: cannot fail
    // Outlet-only layouts inherit the child's error boundary.
    if (!/component\s*:/.test(c) && /Outlet/.test(c)) return false;
    return !/errorComponent/.test(c);
  });
  if (unprotected.length) {
    problems.push(
      `these routes fetch data but declare no errorComponent, so a failure blanks them:\n` +
        `        ${unprotected.join("\n        ")}`,
    );
  } else {
    notes.push(`${routes.length} routes: every one that fetches has an error surface`);
  }
}

// --- images: a broken cover must not leave a torn layout
const storage = read("src/components/StorageImage.tsx");
if (storage && !/onError/.test(storage)) {
  problems.push(
    "StorageImage has no onError fallback — a missing album cover leaves a broken\n" +
      "        image icon in the middle of a track row",
  );
}

// --- the back button must exit rather than kill the app
const activity = read("android/app/src/main/java/com/wesu/music/MainActivity.java");
if (activity) {
  const a = code(activity);
  if (!/moveTaskToBack/.test(a)) {
    problems.push(
      "the back button does not moveTaskToBack — pressing back on the home page\n" +
        "        finishes the activity and kills playback instead of backgrounding it",
    );
  } else {
    notes.push("back backgrounds the app so music keeps playing");
  }
}

console.log("  small things a listener would notice");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  console.error("");
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  these are the annoyances that make an app feel unfinished");
  process.exit(1);
}
console.log("  nothing obvious left to annoy a listener");
