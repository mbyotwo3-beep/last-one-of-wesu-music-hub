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

console.log("  privileged functions verify who is calling");
for (const n of notes) console.log(`    ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  process.exit(1);
}
console.log("    (labels, invitations, payments and contact use helper guards — read-verified, not proven here)");