/**
 * No tappable control may be hover-only.
 *
 * `opacity-0 group-hover:opacity-100` is fine on a pointer. On a touch device
 * there is no hover, so the control stays invisible while still occupying its
 * slot in the row and still swallowing taps meant for the track behind it.
 *
 * Three real instances of this shipped: the playlist row's share menu, its
 * reorder arrows and its remove button were all unreachable from a phone, and
 * the album tile's share menu was invisible while the heart beside it — same
 * tile, same component — was visible.
 *
 * The fix is a breakpoint escape hatch so the control is visible below `sm`/`md`
 * and hover-revealed above it:
 *
 *   opacity-0 group-hover:opacity-100 max-sm:opacity-100
 *
 * This check is deliberately narrow. It only inspects className strings that
 * hide an element with opacity-0 *and* reveal it on group-hover, and only flags
 * those with no small-screen escape. Decorations (scrollbars, progress knobs,
 * a scrim that fades in on hover) are excluded because they are not controls;
 * where that is hard to judge, the finding is a prompt to look, not a verdict.
 *
 * Usage: node scripts/check-hover-only-controls.mjs
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";

/**
 * Is this className on something the user can actually press?
 *
 * The first version of this check flagged 11 sites. Ten were decorative scrims
 * — `absolute inset-0 bg-…` overlays that fade in on hover to show a PARENT's
 * clickable region — and one sat inside a `hidden lg:block` sidebar. None were
 * unreachable controls, so the check would have trained everyone to ignore it.
 *
 * So require positive evidence of interactivity on the element itself.
 */
const INTERACTIVE =
  /<(button|a|Link|ShareMenu|DownloadButton|Input|textarea|select)\b|cursor-pointer/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const findings = [];

for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // Must hide with opacity-0 and reveal on group-hover.
    if (!/opacity-0/.test(line)) return;
    if (!/group-hover:opacity-100/.test(line)) return;
    // A small-screen escape: shown by default below sm/md, or never hidden.
    if (/max-sm:opacity-100|max-md:opacity-100|max-lg:opacity-100/.test(line)) return;
    if (/md:opacity-0|lg:opacity-0/.test(line)) return; // hidden only on pointer widths
    // A full-bleed overlay is a scrim for a parent, not a control in itself.
    if (/absolute inset-0/.test(line)) return;
    // Must look like something pressable.
    if (!INTERACTIVE.test(line)) return;

    findings.push({ file, line: i + 1, text: line.trim().slice(0, 100) });
  });
}

if (!findings.length) {
  console.log("no hover-only controls without a small-screen escape");
} else {
  console.log(`${findings.length} hover-only control(s) with no mobile escape:\n`);
  for (const f of findings) {
    console.log(`  ${f.file}:${f.line}`);
    console.log(`    ${f.text}`);
  }
  console.log("\n  Add max-sm:opacity-100 (or md:opacity-0 if pointer-only) to each.");
  process.exit(1);
}
