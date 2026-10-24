/**
 * Every privileged server function must verify the caller's role.
 *
 * WHAT THIS WAS WRITTEN FOR
 *
 * admin.functions.ts exposes 28 server functions. Two of them called assertAdmin.
 * Twenty-six did not — and their writes go through `supabaseAdmin`, the
 * service-role client, which bypasses row level security entirely.
 *
 * That means RLS was not a backstop. A signed-in listener could call, without
 * touching the UI:
 *
 *   moderateArtist   — approve their own application AND write user_roles
 *   moderateSong     — publish or unpublish any song
 *   moderateAlbum    — publish or unpublish any album
 *   reviewPayout     — approve a payout
 *   suspendArtist    — suspend any artist
 *   deleteEditorialPlaylist, setPlaylistPublished, and 20 more
 *
 * The RoleGate on /admin hides buttons. It does not authenticate a request, and
 * the endpoint is callable without it.
 *
 * WHY PARSING AND NOT READING
 *
 * Twenty-eight functions is more than anyone should trust themselves to eyeball,
 * and the failure mode is invisible: a guard written in the PREVIOUS function
 * looks correct while leaving this one open. So each createServerFn is sliced out
 * and checked for a guard inside its OWN body.
 *
 * SCOPE, STATED PLAINLY
 *
 * This covers admin.functions.ts and superadmin.functions.ts — the two genuinely
 * privileged surfaces, both of which write through the service-role client.
 *
 * It deliberately does NOT claim the rest of the surface is safe. labels,
 * invitations, payments and contact were audited and use helper-based guards
 * ("resolve a label only for its owner or a member of staff") that no regex
 * recognises. Those were checked by reading and look correctly guarded, but they
 * are not proven here and should get a human pass.
 */
import { readFileSync, existsSync } from "node:fs";

const problems = [];
const notes = [];

/**
 * What counts as checking who is calling.
 *
 * Two shapes exist in this codebase and the gate has to know both:
 *
 *   1. a named helper  — await assertStaff(context.supabase, context.userId)
 *   2. an inline check — read the CALLER's own roles from user_roles and throw
 *                        if none of them qualify. getSettings does this.
 *
 * Matching only the helpers flagged getSettings as unguarded, on the first run,
 * with the file actually correct. A gate that reports a security hole that does
 * not exist gets ignored, and then the real one gets through too.
 *
 * The inline form is recognised by READING the caller's roles scoped to their
 * own id. The scope clause is not optional decoration: a looser version matched
 * any reference to user_roles, and moderateArtist — which WRITES user_roles to
 * approve somebody — then looked guarded while its own check was deleted. That
 * is the most dangerous possible false negative: the self-approval hole reported
 * itself as protected.
 */
const NAMED_GUARD =
  /\b(?:assertStaff|assertAdmin|assertSuperadmin|ensureStaff|isStaffUser|isSuperadminUser|assertMediaStaff|getAdmin|requireRole|requireAdmin)\s*\(/;
const INLINE_GUARD =
  /from\(\s*["']user_roles["']\s*\)[\s\S]{0,300}?\.select\(\s*["']role["']\s*\)[\s\S]{0,300}?\.eq\(\s*["']user_id["']\s*,\s*(context\.userId|userId)/;
const GUARD = new RegExp(`${NAMED_GUARD.source}|${INLINE_GUARD.source}`);

const PRIVILEGED = [
  "src/lib/admin.functions.ts",
  "src/lib/superadmin.functions.ts",
];

for (const file of PRIVILEGED) {
  if (!existsSync(file)) {
    problems.push(`${file} is missing, so privileged functions cannot be checked`);
    continue;
  }
  const src = readFileSync(file, "utf8");

  const starts = [...src.matchAll(/export const (\w+) = createServerFn/g)];
  if (!starts.length) {
    problems.push(`${file} exposes no server functions — did the file get renamed?`);
    continue;
  }

  const open = [];
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1].index : src.length;
    const body = src.slice(m.index, to);
    if (!GUARD.test(body)) open.push(m[1]);
  }

  // Only report the file as safe if it also writes through the service role,
  // because that is what makes a missing guard exploitable rather than untidy.
  const serviceWrites = (src.match(/supabaseAdmin\s*\.\s*from\(/g) ?? []).length;

  if (open.length) {
    problems.push(
      `${file}: ${open.length} of ${starts.length} server functions have NO role guard\n` +
        "          " +
        open.join(", ") +
        "\n" +
        `          ${serviceWrites} of its writes go through supabaseAdmin, which BYPASSES row level\n` +
        "          security. A missing guard here means any signed-in listener can call the\n" +
        "          function directly. The RoleGate on /admin hides buttons; it does not\n" +
        "          authenticate a request.",
    );
  } else {
    notes.push(`${file.split("/").pop()}: all ${starts.length} functions verify the caller's role`);
  }
}

// --- 5. staff (admin + superadmin) ride free on paid music — deliberate
//
// History: getSignedAudioUrl and getDownloadAudioUrl carried a staff bypass
// that any admin or superadmin rode for full playback and permanent downloads
// of every paid song ("QA and moderation"). Removed in fa36ac6 (2026-10-23);
// owners subsequently decided a superadmin phone must reach every song,
// including offline downloads, without buying — the bypass was restored on
// 2026-10-24 as an explicit product decision.
//
// This gate now pins the PRESENCE of the staff leg (and the owner-artist leg)
// in both server functions, so a future refactor cannot silently drop the
// staff ride (or narrow it to shapes the client no longer mirrors). Comments
// are stripped before scanning: the comment below explains the history and a
// naive wildcard scan would match prose, not code.
const listenerFunctions = "src/lib/listener.functions.ts";
if (existsSync(listenerFunctions)) {
  const src = readFileSync(listenerFunctions, "utf8");
  const starts = [...src.matchAll(/export const (\w+) = createServerFn/g)];
  const bodyOf = (name) => {
    const i = starts.findIndex((m) => m[1] === name);
    if (i === -1) return null;
    const to = i + 1 < starts.length ? starts[i + 1].index : src.length;
    return src.slice(starts[i].index, to);
  };
  for (const name of ["getSignedAudioUrl", "getDownloadAudioUrl"]) {
    const body = bodyOf(name);
    if (body === null) {
      problems.push(
        `${listenerFunctions}: ${name} is missing — the playback/download entitlement\n` +
          "          surface must not be renamed silently",
      );
      continue;
    }
    // Braces are sliced, then comments stripped — a comment like "restored the
    // isStaffUser call" matches prose in a naive wildcard scan, not the code
    // (same trap as the ServiceWorkerController negatives).
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    if (!/\bisStaffUser\s*\(/.test(code)) {
      problems.push(
        `${listenerFunctions}: ${name} lost the staff leg — admin and superadmin must\n` +
          "          ride free on paid music (QA and moderation), restored 2026-10-24",
      );
    }
    if (!/!isStaff\s*&&\s*!isOwnerArtist/.test(code)) {
      problems.push(
        `${listenerFunctions}: ${name} no longer orders the paid gate as\n` +
          "          (!isStaff && !isOwnerArtist) — the staff and owner-artist\n" +
          "          exceptions must both short-circuit the purchase requirement",
      );
    }
    if (!/\bisOwnerArtist\b/.test(code)) {
      problems.push(
        `${listenerFunctions}: ${name} lost the owner-artist path — artists would no\n` +
          "          longer be able to hear their own uploads",
      );
    }
    notes.push(`${name}: staff (admin/superadmin) and the song's own artist ride free; everyone else needs a completed purchase`);
  }
} else {
  problems.push(`${listenerFunctions} is missing — the entitlement functions cannot be checked`);
}

// The client mirror must agree with the server, or the UI offers a Buy button
// to a staff member whom the server then plays (and downloads) for free — a
// desync that shows in the app the moment a superadmin opens a paid song.
// The staff leg consults user_roles (own rows are RLS-readable); that must
// stay. Comments are stripped first — the file explains history in prose and
// a naive scan matches the explanation rather than the code (same trap as the
// negatives gates).
const entitlementHook = "src/hooks/use-song-entitlement.ts";
if (existsSync(entitlementHook)) {
  const code = readFileSync(entitlementHook, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (!(/\.from\("user_roles"\)/.test(code) && /\bin\("role",\s*\["admin",\s*"superadmin"\]\)/.test(code))) {
    problems.push(
      `${entitlementHook}: the staff leg (user_roles admin/superadmin select) is missing —\n` +
        "          the mirror must keep granting staff the same ride the server does",
    );
  }
  if (!/\bartist_id\b/.test(code)) {
    problems.push(
      `${entitlementHook}: the owner-artist leg is missing — artists would see Buy\n` +
        "          on their own uploads",
    );
  }
  notes.push("use-song-entitlement mirrors the staff ride + owner-artist rule");
}

console.log("  privileged functions verify who is calling");
for (const n of notes) console.log(`    ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  process.exit(1);
}
console.log("    (labels, invitations, payments and contact use helper guards — read-verified, not proven here)");