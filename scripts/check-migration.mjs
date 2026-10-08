/**
 * Structural check on a SQL migration.
 *
 * There is no Postgres and no Supabase CLI in this environment, so migrations
 * cannot be executed before they reach the user. A real syntax error then only
 * surfaces after they have pasted it into the SQL editor — which is exactly how
 * `MIN(uuid)` shipped and came back as 42883.
 *
 * This does not prove the SQL is valid. It catches the cheap structural
 * failures that are easy to make by hand: unbalanced dollar quoting (the
 * plpgsql body), unbalanced parentheses, unterminated string literals, and
 * aggregates Postgres does not have (there is no min()/max() for uuid).
 *
 * Usage: node scripts/check-migration.mjs supabase/migrations/<file>.sql
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/check-migration.mjs <file.sql>");
  process.exit(2);
}

const sql = readFileSync(path, "utf8");
const problems = [];

/**
 * Blank out `--` comments before scanning quotes.
 *
 * Comments are full of apostrophes ("the album's tracks", "the trigger's
 * album branch"). Treating those as string delimiters makes the scanner think a
 * literal opened and swallow the remainder of the file, so it reports phantom
 * unterminated strings and unbalanced parens. That is worse than no check: a
 * checker that cries wolf on a valid file gets ignored.
 *
 * Done with a placeholder rather than deletion so offsets stay meaningful and
 * a stray `--` inside a real string literal is not mistaken for a comment.
 */
const code = sql.replace(/--[^\n]*/g, (m) => " ".repeat(m.length));

// --- dollar quoting: every $$ opens or closes a plpgsql body ---
const dollars = (code.match(/\$\$/g) ?? []).length;
if (dollars % 2 !== 0) {
  problems.push(
    `unbalanced $$ quoting: found ${dollars} occurrences. A plpgsql body was opened and never closed (or vice versa), so the rest of the file would be swallowed as a string.`,
  );
}

// --- parentheses and string literals, ignoring anything inside quotes ---
let depth = 0;
let lowest = 0;
let inString = false;
for (let i = 0; i < code.length; i++) {
  const c = code[i];
  if (inString) {
    if (c === "'") {
      if (code[i + 1] === "'") {
        i++;
        continue;
      }
      inString = false;
    }
    continue;
  }
  if (c === "'") inString = true;
  else if (c === "(") depth++;
  else if (c === ")") {
    depth--;
    if (depth < lowest) lowest = depth;
  }
}
if (depth !== 0) {
  problems.push(
    `unbalanced parentheses: net depth ${depth} (lowest ${lowest}).` +
      (lowest < 0 ? " A ')' appears before its '('." : " A '(' was never closed."),
  );
}
if (inString) problems.push("unterminated single-quoted string literal.");

// --- aggregates Postgres does not provide for uuid ---
// min()/max() are defined for numeric types and text, but NOT uuid. Grouping
// "the smallest id per group" therefore fails at runtime with 42883, and it
// fails on the user's database rather than in review.
const UUID_AGG = /\b(MIN|MAX)\s*\(\s*([A-Za-z_][\w$]*\.)?id\s*\)/gi;
for (const m of code.matchAll(UUID_AGG)) {
  problems.push(
    `${m[0]} — Postgres has no ${m[1].toUpperCase()}() aggregate for uuid (error 42883). Use DISTINCT ON (group cols) col ORDER BY group cols, created_at, id to pick one row per group.`,
  );
}

if (problems.length) {
  console.error(`FAIL ${path}\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\n  Structural only. This does not prove the SQL executes.");
  process.exit(1);
}

console.log(
  `  ${path}: structure ok ($$ x${dollars}, parens balanced, no uuid aggregates)`,
);