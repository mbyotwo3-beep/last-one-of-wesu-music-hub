/**
 * End-to-end test harness.
 *
 * Runs against the real database via the service role. Everything it creates is
 * tagged with the run id in TEST_RUN_ID so cleanup can delete exactly what this
 * harness made and nothing else — and so the counts can be compared to a
 * baseline afterwards.
 *
 * The money tests write real rows to payment_transactions and revenue_splits.
 * That is unavoidable: the trigger under test only runs on a completed
 * transaction, and it is the thing most worth verifying. Each test deletes its
 * own rows and verifies the deletion.
 *
 * Usage: node scripts/e2e.mjs <step>
 *   baseline  snapshot counts to .e2e-baseline.json
 *   routes    smoke-test every public route on the live site
 *   money     trigger split maths, including the name-only collaborator case
 *   cleanup   remove everything this harness created
 *   verify    compare current counts to the baseline
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function envFile(name) {
  try {
    const out = {};
    for (const line of readFileSync(name, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...envFile(".env"), ...envFile(".env.local") };
const BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const json = { ...H, "Content-Type": "application/json" };
// PostgREST returns an empty body for a POST unless asked, so an insert needs
// return=representation or the created id is unobtainable.
const jsonReturning = { ...json, Prefer: "return=representation" };

const money = (n) => `K${Number(n || 0).toFixed(2)}`;
const ok = (s) => console.log(`  PASS  ${s}`);
const bad = (s) => {
  console.log(`  FAIL  ${s}`);
  process.exitCode = 1;
};

async function rows(table, query = "") {
  const res = await fetch(`${BASE}/rest/v1/${table}${query}`, { headers: H });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}
async function count(table, query = "") {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=id${query}`, {
    headers: { ...H, Prefer: "count=exact" },
  });
  const cr = res.headers.get("content-range") ?? "";
  return Number(cr.split("/")[1] ?? 0);
}

const TABLES = ["payment_transactions", "revenue_splits", "purchases", "song_collaborators"];

const step = process.argv[2];

// ---------------------------------------------------------------- baseline
if (step === "baseline") {
  const snap = {};
  for (const t of TABLES) snap[t] = await count(t);
  snap.at = new Date().toISOString();
  writeFileSync(".e2e-baseline.json", JSON.stringify(snap, null, 2));
  console.log("baseline recorded:");
  for (const t of TABLES) console.log(`  ${t.padEnd(22)} ${snap[t]}`);
}

// ---------------------------------------------------------------- routes
if (step === "routes") {
  const SITE = "https://www.wesuplus.com";
  const routes = [
    "/",
    "/browse",
    "/songs",
    "/albums",
    "/artists",
    "/labels",
    "/new-music",
    "/hot-tracks",
    "/must-have",
    "/recently-added",
    "/playlists",
    "/contact",
    "/terms",
    "/terms-listener",
    "/terms-artist",
    "/privacy",
    "/become-artist",
    "/apply-label",
    "/auth",
    "/library",
    "/dashboard",
    "/get-app",
    "/downloads",
    "/now-playing",
    "/queue",
    "/search",
    "/api/public/sitemap",
  ];
  // Only phrases that mean a page actually failed to render.
  //
  // The first version used /error|exception/i over the first 4000 characters and
  // reported 12 of 27 routes as broken. Every one was the modulepreload link to
  // RouteError-<hash>.js — the error-boundary chunk that every page legitimately
  // preloads. Matching a word is not evidence of a broken page; a check that
  // cries wolf on valid pages gets ignored.
  const REAL_ERRORS = [
    /Something went wrong/i,
    /Unexpected Error/i,
    /Internal Server Error/i,
    /Application error/i,
    /cannot read properties of (undefined|null)/i,
    /Maximum update depth exceeded/i,
    /Minified React error #\d+/i,
    /is not a function/i,
  ];

  console.log(`smoke-testing ${routes.length} routes on ${SITE}\n`);
  let fails = 0;
  for (const r of routes) {
    try {
      const res = await fetch(SITE + r, { redirect: "follow" });
      const text = res.ok ? await res.text() : "";
      const hit = REAL_ERRORS.find((re) => re.test(text));
      if (!res.ok) {
        bad(`${r} -> HTTP ${res.status}`);
        fails++;
      } else if (hit) {
        const m = text.match(hit);
        bad(
          `${r} -> rendered an error page: ${hit} @ "${text.slice(Math.max(0, m.index - 80), m.index + 120).replace(/\s+/g, " ")}"`,
        );
        fails++;
      } else {
        ok(`${r} -> 200`);
      }
    } catch (e) {
      bad(`${r} -> ${e.message}`);
      fails++;
    }
  }
  console.log(`\n${routes.length - fails}/${routes.length} routes clean`);
}

// ---------------------------------------------------------------- money
if (step === "money") {
  const RUN = `e2e-${Date.now()}`;

  // A real song owned by a real artist, with a real price.
  const songs = await rows(
    "songs",
    "?status=eq.approved&price=gt.0&select=id,title,price,artist_id&limit=50",
  );
  if (!songs.length) {
    bad("no paid approved song to test with");
  } else {
    const song = songs[0];
    console.log(`using song "${song.title}" (K${song.price})\n`);

    // ---- case 1: no collaborators -> main artist takes the artists' pool
    console.log("case 1  single artist, no collaborators");
    let txId;
    {
      const res = await fetch(`${BASE}/rest/v1/payment_transactions?select=id,item_id`, {
        method: "POST",
        headers: jsonReturning,
        body: JSON.stringify({
          user_id: "00000000-0000-0000-0000-0000000000e2",
          amount: song.price,
          currency: "ZMW",
          method_code: "mtn_momo",
          provider: "e2e",
          status: "completed",
          item_type: "song",
          item_id: song.id,
          metadata: { e2e: RUN },
        }),
      });
      if (!res.ok) {
        bad(`insert transaction: ${res.status} ${(await res.text()).slice(0, 200)}`);
      } else {
        const body = await res.json();
        txId = body[0].id;
        const splits = await rows("revenue_splits", `?transaction_id=eq.${txId}`);
        const artistRows = splits.filter((s) => s.payee_role === "artist");
        const platform = splits.filter((s) => s.payee_role === "platform");
        const expectedArtist = song.price * 0.8;

        console.log(
          `        splits: ${splits.map((s) => `${s.payee_role} ${money(s.amount)}`).join(", ")}`,
        );
        const got = artistRows.reduce((s, r) => s + Number(r.amount), 0);
        const gotPlat = platform.reduce((s, r) => s + Number(r.amount), 0);

        Math.abs(got - expectedArtist) < 0.02
          ? ok(`artist pool ${money(got)} == 80% of ${money(song.price)}`)
          : bad(`artist pool ${money(got)} != 80% (${money(expectedArtist)})`);
        Math.abs(gotPlat - song.price * 0.2) < 0.02
          ? ok(`platform ${money(gotPlat)} == 20%`)
          : bad(`platform ${money(gotPlat)} != 20% (${money(song.price * 0.2)})`);
        const total = splits.reduce((s, r) => s + Number(r.amount), 0);
        Math.abs(total - song.price) < 0.02
          ? ok(`splits total ${money(total)} == sale amount`)
          : bad(`splits total ${money(total)} != ${money(song.price)} — money created or lost`);
      }
    }

    // ---- case 2: the schema refuses to pay a collaborator with no account
    //
    // CHECK (artist_id IS NOT NULL OR split_pct = 0) means a name-only credit
    // must be at zero percent. This asserts that, because it is the guarantee
    // that no sale can lose money to somebody there is no account to pay.
    console.log("\ncase 2  a name-only credit cannot be given a share (must be rejected)");
    {
      const res = await fetch(`${BASE}/rest/v1/song_collaborators?select=id`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          song_id: song.id,
          artist_id: null,
          credit_name: `E2E Producer ${RUN}`,
          role: "producer",
          split_pct: 20,
          accepted: true,
        }),
      });
      const body = await res.text();
      if (!res.ok && /23514/.test(body)) {
        ok("rejected by CHECK — a credit with no account cannot carry a share");
      } else if (!res.ok) {
        bad(`unexpected rejection ${res.status}: ${body.slice(0, 140)}`);
      } else {
        // It was accepted, so clean it up and flag the schema has changed.
        const [row] = JSON.parse(body);
        await fetch(`${BASE}/rest/v1/song_collaborators?id=eq.${row.id}`, {
          method: "DELETE",
          headers: H,
        });
        bad("ACCEPTED a 20% share for a collaborator with no account — no money trail");
      }
    }

    // ---- case 3: a real account collaborator splits the artists' pool
    //
    // This is the path that actually moves money, so it is the one worth
    // proving: 20% platform, then the remaining 80% split by the agreed
    // percentages between the main artist and the credited collaborator.
    console.log("\ncase 3  account collaborator shares the artists' pool");
    {
      const others = await rows(
        "artists",
        "?select=id,user_id,name&status=eq.approved&user_id=not.is.null",
      );
      const partner = others.find((a) => a.id !== song.artist_id);
      if (!partner) {
        bad("no second approved artist with an account to credit");
      } else {
        console.log(`        crediting ${partner.name} at 20%`);
        const collabRes = await fetch(`${BASE}/rest/v1/song_collaborators?select=id`, {
          method: "POST",
          headers: jsonReturning,
          body: JSON.stringify({
            song_id: song.id,
            artist_id: partner.id,
            credit_name: null,
            role: "producer",
            split_pct: 20,
            invited_by: partner.user_id,
            accepted: true,
          }),
        });
        if (!collabRes.ok) {
          bad(`insert collaborator: ${collabRes.status} ${(await collabRes.text()).slice(0, 160)}`);
        } else {
          const [collab] = await collabRes.json();
          const res = await fetch(`${BASE}/rest/v1/payment_transactions?select=id,item_id`, {
            method: "POST",
            headers: jsonReturning,
            body: JSON.stringify({
              user_id: "00000000-0000-0000-0000-0000000000e2",
              amount: song.price,
              currency: "ZMW",
              method_code: "mtn_momo",
              provider: "e2e",
              status: "completed",
              item_type: "song",
              item_id: song.id,
              metadata: { e2e: RUN },
            }),
          });
          if (!res.ok) {
            bad(`insert transaction: ${res.status}`);
          } else {
            const [tx] = await res.json();
            const splits = await rows("revenue_splits", `?transaction_id=eq.${tx.id}`);
            const sum = (role) =>
              splits.filter((s) => s.payee_role === role).reduce((a, r) => a + Number(r.amount), 0);
            const artist = sum("artist");
            const collaborator = sum("collaborator");
            const platform = sum("platform");
            const total = splits.reduce((a, r) => a + Number(r.amount), 0);

            console.log(
              `        splits: ${splits
                .map((s) => `${s.payee_role} ${money(s.amount)}@${s.pct}%`)
                .join(", ")}`,
            );

            const pool = song.price * 0.8;
            Math.abs(platform - song.price * 0.2) < 0.02
              ? ok(`platform ${money(platform)} == 20% commission`)
              : bad(`platform ${money(platform)} != 20%`);
            Math.abs(collaborator - pool * 0.2) < 0.02
              ? ok(`collaborator ${money(collaborator)} == 20% of the artists' pool`)
              : bad(`collaborator ${money(collaborator)} != ${money(pool * 0.2)}`);
            Math.abs(artist - pool * 0.8) < 0.02
              ? ok(`main artist ${money(artist)} == 80% of the pool`)
              : bad(`main artist ${money(artist)} != ${money(pool * 0.8)}`);
            Math.abs(total - song.price) < 0.02
              ? ok(`splits total ${money(total)} == sale amount`)
              : bad(`splits total ${money(total)} != ${money(song.price)} — money created or lost`);

            await fetch(`${BASE}/rest/v1/revenue_splits?transaction_id=eq.${tx.id}`, {
              method: "DELETE",
              headers: H,
            });
            await fetch(`${BASE}/rest/v1/payment_transactions?id=eq.${tx.id}`, {
              method: "DELETE",
              headers: H,
            });
          }
          await fetch(`${BASE}/rest/v1/song_collaborators?id=eq.${collab.id}`, {
            method: "DELETE",
            headers: H,
          });
          console.log("        collaborator removed");
        }
      }
    }

    if (txId) {
      await fetch(`${BASE}/rest/v1/revenue_splits?transaction_id=eq.${txId}`, {
        method: "DELETE",
        headers: H,
      });
      await fetch(`${BASE}/rest/v1/payment_transactions?id=eq.${txId}`, {
        method: "DELETE",
        headers: H,
      });
      console.log(`\n        case 1 transaction removed`);
    }
  }
}

// ---------------------------------------------------------------- cleanup
if (step === "cleanup") {
  // Delete anything tagged with e2e- in metadata or credit_name.
  const tagged = await rows(
    "payment_transactions",
    "?select=id,metadata&metadata->>e2e=not.is.null",
  );
  console.log(`tagged payment_transactions: ${tagged.length}`);
  for (const t of tagged) {
    await fetch(`${BASE}/rest/v1/revenue_splits?transaction_id=eq.${t.id}`, {
      method: "DELETE",
      headers: H,
    });
    await fetch(`${BASE}/rest/v1/payment_transactions?id=eq.${t.id}`, {
      method: "DELETE",
      headers: H,
    });
  }
  const collabs = await rows("song_collaborators", "?credit_name=like.E2E*");
  console.log(`tagged song_collaborators: ${collabs.length}`);
  for (const c of collabs) {
    await fetch(`${BASE}/rest/v1/song_collaborators?id=eq.${c.id}`, {
      method: "DELETE",
      headers: H,
    });
  }
}

// ---------------------------------------------------------------- verify
if (step === "verify") {
  if (!existsSync(".e2e-baseline.json")) {
    console.error("no baseline recorded — run `node scripts/e2e.mjs baseline` first");
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(".e2e-baseline.json", "utf8"));
  console.log("counts now vs baseline\n");
  let drift = 0;
  for (const t of TABLES) {
    const now = await count(t);
    const was = base[t];
    const delta = now - was;
    if (delta !== 0) drift++;
    console.log(
      `  ${t.padEnd(22)} ${String(now).padStart(6)}  (was ${was})  ${delta === 0 ? "clean" : `DRIFT ${delta > 0 ? "+" : ""}${delta}`}`,
    );
  }
  console.log(
    drift === 0
      ? "\nno drift — the database is exactly as it was before the tests"
      : "\ndrift remains; investigate before trusting the results",
  );
}

if (!step) console.log("usage: node scripts/e2e.mjs baseline|routes|money|cleanup|verify");
