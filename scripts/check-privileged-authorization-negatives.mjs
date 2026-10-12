/**
 * Negative tests for check-privileged-authorization.
 *
 * This gate protects a security boundary, so "it passes" means nothing until it
 * has been shown to fail. Two shapes matter:
 *
 *   1. a guard removed from a function
 *   2. a guard present in the PREVIOUS function, which is the mistake that is
 *      invisible by eye — the file still "has" a guard, just not this one
 *
 * The second is the reason this parses bodies instead of counting occurrences.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/check-privileged-authorization.mjs";
const ADMIN = "src/lib/admin.functions.ts";
const SUPER = "src/lib/superadmin.functions.ts";

const onLine = (find, replacement) => (src) => {
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(find));
  if (i === -1) return src;
  lines[i] = lines[i].replace(find, replacement);
  return lines.join(eol);
};

/**
 * Strip the guard from ONE named function's own body.
 *
 * The first version targeted moderateArtist, which turned out to have had
 * `await assertStaff(...)` all along — so removing the assertAdmin line changed
 * nothing and the gate correctly stayed green. That is the gate working and the
 * test being wrong.
 *
 * It also means the mutation must remove EVERY guard shape in that body, not one
 * named helper.
 */
const stripGuards = (src, fnName) => {
  const start = src.indexOf(`export const ${fnName} = createServerFn`);
  if (start === -1) return src;
  const end = src.indexOf("export const ", start + 10);
  const body = src.slice(start, end === -1 ? undefined : end);
  const stripped = body.replace(
    /[ \t]*await (?:assertAdmin|assertStaff|ensureStaff|isStaffUser|getAdmin)\([^)]*\);\r?\n/g,
    "",
  );
  return src.slice(0, start) + stripped + (end === -1 ? "" : src.slice(end));
};

const cases = [
  {
    name: "the guard is stripped from moderateArtist, the self-approval path",
    file: ADMIN,
    apply: (src) => stripGuards(src, "moderateArtist"),
    expect: "NO role guard",
  },
  {
    name: "the guard is stripped from reviewPayout",
    file: ADMIN,
    apply: (src) => stripGuards(src, "reviewPayout"),
    expect: "NO role guard",
  },
  {
    name: "the guard is stripped from suspendArtist",
    file: ADMIN,
    apply: (src) => stripGuards(src, "suspendArtist"),
    expect: "NO role guard",
  },
  {
    name: "the guard is stripped from moderateAlbum",
    file: ADMIN,
    apply: (src) => stripGuards(src, "moderateAlbum"),
    expect: "NO role guard",
  },
  {
    name: "the guard is stripped from a superadmin function",
    file: SUPER,
    apply: (src) => {
      const lines = src.split(/\r?\n/);
      const i = lines.findIndex((l) => /await (assertStaff|assertAdmin|isStaffUser|getAdmin)\w*\s*\(/.test(l));
      if (i === -1) return src;
      lines[i] = "      /* removed */";
      return lines.join(src.includes("\r\n") ? "\r\n" : "\n");
    },
    expect: "NO role guard",
  },
  {
    // Every guard shape in the file gone: the state the gate must catch.
    name: "every guard is stripped from admin.functions.ts",
    file: ADMIN,
    apply: (src) =>
      src.replace(
        /[ \t]*await (?:assertAdmin|assertStaff|ensureStaff|isStaffUser|getAdmin)\([^)]*\);\r?\n/g,
        "",
      ),
    expect: "NO role guard",
  },
  {
    // The INLINE guard is the shape the first version of this gate missed, and it
    // reported getSettings as an open hole when it is in fact correctly
    // protected. If the inline check is not recognised here, that mistake comes
    // straight back.
    name: "getSettings loses its INLINE role check",
    file: SUPER,
    apply: (src) => {
      const start = src.indexOf("export const getSettings = createServerFn");
      const end = src.indexOf("export const ", start + 10);
      const body = src.slice(start, end === -1 ? undefined : end);
      const stripped = body.replace(
        /const \{ data: roles \} = await supabaseAdmin[\s\S]{0,200}?\.eq\("user_id", context\.userId\);/,
        "const roles: any[] = [];",
      );
      return src.slice(0, start) + stripped + (end === -1 ? "" : src.slice(end));
    },
    expect: "NO role guard",
  },
];

let bad = 0;
for (const c of cases) {
  const original = readFileSync(c.file, "utf8");
  const mutated = c.apply(original);
  if (mutated === original) {
    console.log(`  SKIP  ${c.name} - mutation did not apply`);
    bad++;
    continue;
  }
  writeFileSync(c.file, mutated);
  let out = "";
  try {
    out = execFileSync("node", [GATE], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  } finally {
    writeFileSync(c.file, original);
  }
  const fired = out.includes(c.expect);
  console.log(`  ${fired ? "ok  " : "FAIL"}  ${c.name}`);
  if (!fired) bad++;
}

console.log(bad ? `\n  ${bad} mutation(s) slipped through` : "\n  every mutation was caught");
process.exit(bad ? 1 : 0);