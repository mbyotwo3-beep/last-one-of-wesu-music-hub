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

// --- 5. paid content is not free for staff
//
// getSignedAudioUrl and getDownloadAudioUrl used to hand FULL playback and
// permanent downloads of every paid song to any admin or superadmin with no
// purchase ("staff bypass — QA and moderation"). In practice that meant a
// superadmin's phone accessed everything without buying — a straight revenue
// leak, and a support trap the moment anyone else is granted an admin role.
// entitlement is now one rule: completed purchase, or the song's own artist.
// Moderation lost nothing: no admin surface ever consumed that bypass.
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
    // Braces are sliced, then comments stripped — a comment like "this used to
    // call isStaffUser" matches prose in a naive wildcard scan, not the code
    // (same trap as the ServiceWorkerController negatives).
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    if (/\bisStaffUser\b/.test(code)) {
      problems.push(
        `${listenerFunctions}: ${name} still calls isStaffUser — staff used to ride free\n` +
          "          on every paid song; the only purchase-free access is the song's own artist",
      );
    }
    if (!/\bisOwnerArtist\b/.test(code)) {
      problems.push(
        `${listenerFunctions}: ${name} lost the owner-artist path — artists would no\n` +
          "          longer be able to hear their own uploads",
      );
    }
    notes.push(`${name}: paid songs require a purchase for everyone but the song's own artist`);
  }
} else {
  problems.push(`${listenerFunctions} is missing — the entitlement functions cannot be checked`);
}

// The client mirror must agree with the server, or the UI offers an access
// button the server then refuses — and, worse, must not keep consulting
// user_roles to hand admin/superadmin a free pass the server no longer grants.
//
// Comments are stripped first: the file legitimately EXPLAINS the removed
// bypass in prose, and a naive scan matches the explanation rather than the
// code (same trap as the ServiceWorkerController negatives in
// check-app-distribution.mjs).
const entitlementHook = "src/hooks/use-song-entitlement.ts";
if (existsSync(entitlementHook)) {
  const code = readFileSync(entitlementHook, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (/\b(admin|superadmin|user_roles)\b/.test(code)) {
    problems.push(
      `${entitlementHook}: the entitlement mirror still consults user_roles / admin roles —\n` +
        "          the server charges staff now, and the UI free-passing them desyncs the two",
    );
  } else {
    notes.push("use-song-entitlement mirrors the owner-artist rule only");
  }
}

console.log("  privileged functions verify who is calling");
for (const n of notes) console.log(`    ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  process.exit(1);
}
console.log("    (labels, invitations, payments and contact use helper guards — read-verified, not proven here)");