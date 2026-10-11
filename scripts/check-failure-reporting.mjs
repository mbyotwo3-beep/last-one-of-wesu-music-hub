/**
 * Why /library failed — read out, not inferred.
 *
 * WHAT WAS REPORTED
 *
 * A signed-in listener playing a preview saw "This page didn't load" with a Try
 * again button, while the music kept playing. That is the route error boundary.
 *
 * WHAT WAS RULED OUT, BY READING
 *
 *   - no loader on /library, so it is a RENDER-time throw, not a fetch failure
 *   - all four queryFn blocks are guarded and fall back to []
 *   - no unguarded nested property access anywhere in the file
 *   - the one explicit `throw error` sits in a mutation with an onError handler
 *   - /library server-renders fine (200, real content) for an anonymous visitor
 *
 * Every hypothesis was wrong. The remaining difference between the passing case
 * and the failing one is simply THAT THE USER IS SIGNED IN, and reading the code
 * cannot tell which of the signed-in branches throws.
 *
 * WHY THE ERROR BOUNDARY IS THE REAL PROBLEM
 *
 * Whatever the underlying fault is, the listener is shown "This page didn't
 * load" and a Try again button. That destroys their library and tells us nothing.
 * The boundary already knows the error — it is passed in — and throws it away.
 *
 * So: keep the error, log it, and put a short reference on screen. The next
 * report carries the reason instead of a screenshot that can only be guessed at.
 * This is the same lesson as the offline diagnostics: a failure that cannot be
 * identified from the outside costs several rounds of guessing every time.
 */
import { readFileSync, existsSync } from "node:fs";

const problems = [];
const notes = [];

// --- the boundary must log, not swallow
//
// Read from components/RouteError.tsx. An earlier version read
// src/lib/route-error-boundary.tsx, which existed only to satisfy a re-export and
// has since been removed — the check then read a file that is no longer there
// and reported a healthy boundary as silent.
const boundaryPath = existsSync("src/components/RouteError.tsx")
  ? "src/components/RouteError.tsx"
  : "src/lib/route-error-boundary.tsx";
const boundary = readFileSync(boundaryPath, "utf8");

const logsError = /console\.error\(/.test(boundary);
if (!logsError) {
  problems.push(
    "the route error boundary does not log the error — the reason a page failed is\n" +
      "        thrown away, so every report is a screenshot that has to be guessed at",
  );
} else {
  notes.push("route errors are logged with their cause");
}

// --- and must show a short reference the user can quote back
//
// Matched on the RENDERED value, not the helper name. A previous version matched
// /errorRef/i, which is a substring of `errorReference` — the FUNCTION — so
// deleting the whole "quote reference K4M2QP" paragraph from the screen left the
// gate passing. It was checking that a function existed, not that anyone could
// see its output.
const showsRef = /\{ref\}/.test(boundary) && /errorReference/.test(boundary);
if (!showsRef) {
  problems.push(
    "the route error boundary shows no error reference — the listener has nothing\n" +
      "        to quote back, so the next report is still just a screenshot",
  );
} else {
  notes.push("a failed page shows a short reference for support");
}

// --- Report button? No. But the reference must be visible enough for a person
// to read back. A screen-reader-only reference helps nobody reporting a bug.
if (showsRef && /sr-only[^\n]*\bref\b/i.test(boundary)) {
  problems.push("the error reference is screen-reader-only, so a listener cannot read it back");
}

// --- the offline branch must not swallow a real error into "You're offline"
if (!/isOfflineTransportFailure/.test(boundary)) {
  problems.push(
    "the boundary no longer checks isOfflineTransportFailure — it cannot tell a\n" +
      "        connectivity failure from a real fault",
  );
} else {
  notes.push("connectivity failures are distinguished from real faults");
}

// --- /library specifically: the page reported broken
const lib = "src/routes/library.tsx";
if (existsSync(lib)) {
  const src = readFileSync(lib, "utf8");
  // usePlayer() with no selector subscribes the component to EVERY state change.
  // progressSeconds updates several times a second while a preview plays, so a
  // Library page with cards re-renders constantly on the exact device profile
  // most likely to hit it. That is a real cost, and it is measured here rather
  // than asserted.
  const whole = (src.match(/usePlayer\(\)/g) ?? []).length;
  if (whole > 0) {
    problems.push(
      `${lib} calls usePlayer() with NO selector ${whole} time(s).\n` +
        "        That subscribes the component to the entire store, including\n" +
        "        progressSeconds, which updates several times a second during\n" +
        "        playback. The whole page re-renders on every tick.",
    );
  } else {
    notes.push("/library subscribes to individual player fields, not the whole store");
  }
}

console.log("  failures explain themselves");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  a broken page currently reports nothing useful");
  process.exit(1);
}
console.log("  a failed page says why, and logs it");
