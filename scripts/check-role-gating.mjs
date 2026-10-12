/**
 * Does a failed role check ever get reported to a listener as a missing role?
 *
 * WHY THIS EXISTS
 *
 * A real artist opened /artist-dashboard and was told "You need a different
 * account type. This page is for artists. Your account isn't one yet." — with a
 * "Become an Artist" button on their own dashboard.
 *
 * The cause was not what it looked like. Two hypotheses were checked against the
 * live database and BOTH were wrong:
 *
 *   - "nothing writes user_roles"      — false, moderateArtist upserts on approval
 *   - "RLS blocks users reading roles"  — false, a signed-in probe account read
 *                                        its own row back fine
 *
 * The actual cause was that useUserRoles destructured only { data, isPending } and
 * discarded isError. A failed read became roles: [], which is indistinguishable
 * from a real denial, so the gate turned a connection problem into an accusation
 * — and with a five minute staleTime, a refresh did not clear it.
 *
 * A second, independent bug: the sidebar rendered "Become an Artist"
 * unconditionally, to everyone, artists included.
 *
 * The rule here is the general one: NEVER tell someone they lack a role when the
 * answer might be that we failed to look.
 */
import { readFileSync, existsSync } from "node:fs";

const problems = [];
const notes = [];

const ROLES = "src/hooks/use-roles.tsx";
const GATE = "src/components/RoleGate.tsx";

if (!existsSync(ROLES) || !existsSync(GATE)) {
  problems.push("use-roles.tsx or RoleGate.tsx is missing, so roles cannot be gated");
} else {
  const roles = readFileSync(ROLES, "utf8");
  const gate = readFileSync(GATE, "utf8");

  // 1. The hook must expose whether the read FAILED. Without this the caller
  //    cannot tell a denial from an outage.
  if (!/isError/.test(roles)) {
    problems.push(
      "use-roles does not look at isError — a failed read is indistinguishable\n" +
        "        from a genuine denial, so an artist is told they are not an artist\n" +
        "        whenever the connection hiccups",
    );
  } else {
    notes.push("use-roles distinguishes a failed read from a real answer");
  }

  // 2. The gate must have a screen for "we could not check". Rendering the
  //    denial on that path is the whole bug.
  //
  //    Matched on the BRANCH, not the word. Checking /failed/ was satisfied by
  //    the destructuring and the effect dependency array, so deleting the branch
  //    itself still passed — the tenth time a check matched something other than
  //    the code it was written for.
  if (!/if\s*\(\s*failed\s*\)/.test(gate)) {
    problems.push(
      "RoleGate has no 'we could not check' branch, so it falls through to the\n" +
        "        denial screen when the roles read fails",
    );
  } else if (!/Try again/.test(gate)) {
    problems.push(
      "RoleGate's failed branch offers no way to retry — the listener is stuck\n" +
        "        on a dead end until they restart the app",
    );
  } else {
    notes.push("a failed role check offers a retry instead of a denial");
  }

  // 3. The denial screen must not be reachable while the answer is unknown.
  //    The denial block has to come AFTER the failure block.
  const failedAt = gate.indexOf("if (failed)");
  const deniedAt = gate.search(/if \(!ok\)/);
  if (failedAt !== -1 && deniedAt !== -1 && failedAt > deniedAt) {
    problems.push(
      "RoleGate's denial screen renders BEFORE the failed-check screen, so a\n" +
        "        failed read still shows 'your account isn't one yet'",
    );
  } else if (failedAt !== -1 && deniedAt !== -1) {
    notes.push("the failure screen is checked before the denial screen");
  }

  // 4. "Become an Artist" must not be offered to someone we could not check.
  //
  //    For each link, walk back to the `{` that opened its JSX condition and
  //    require `checked` in that condition specifically. Two looser versions
  //    came before this one: matching the word `failed` anywhere in the file,
  //    and accepting `checked` anywhere within 400 characters — both of which the
  //    explanatory comments satisfy by themselves.
  for (const f of [
    "src/components/AppleMusicSidebar.tsx",
    "src/components/Navbar.tsx",
    "src/components/mobile/BottomTabBar.tsx",
  ]) {
    if (!existsSync(f)) continue;
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    const spots = [...src.matchAll(/become-artist/g)];
    if (!spots.length) continue;

    const unguarded = [];
    for (const m of spots) {
      const before = src.slice(0, m.index);
      /*
       * Find the last CONDITIONAL that encloses this link.
       *
       * Walking back to the nearest "{" is wrong: `navigate({ to: "/become-artist" })`
       * puts a brace closer than the guard, so a correctly guarded link looked
       * unguarded. Matching only `{ … && (` finds the real conditional.
       */
      let guard = "";
      for (const g of before.matchAll(/\{([^{}]*?&&\s*\()/g)) guard = g[1];
      if (!/\bchecked\b/.test(guard)) unguarded.push(m.index);
    }
    if (unguarded.length) {
      problems.push(
        `${f} offers "Become an Artist" without first establishing the account\n` +
          "        is not already an artist — it showed to an artist on their own dashboard",
      );
    } else {
      notes.push(`${f.split("/").pop()} only offers it once roles are known`);
    }
  }

  // 5. A staleTime long enough to survive a refresh turns a transient failure
  //    into a persistent wrong answer. Worth a floor on retry, not a ceiling on
  //    staleTime, because a warm cache is what stops the gate flashing.
  if (!/retry:\s*[3-9]/.test(roles) && !/retry:\s*\d{2,}/.test(roles)) {
    problems.push(
      "use-roles retries fewer than 3 times — an access token refreshed mid-request\n" +
      "        is the common cause of the read this hook depends on",
    );
  } else {
    notes.push("the roles read retries enough to survive a token refresh");
  }
}

console.log("  a failed check is never reported as a missing role");
for (const n of notes) console.log(`    ${n}`);

if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error("\n  artists can be told they are not artists");
  process.exit(1);
}