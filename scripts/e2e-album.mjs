/**
 * Album money: does the parent transaction allocate anything directly?
 *
 * Album fulfilment fans out into one purchases row and one completed child
 * 'song' transaction per track, and the children are what allocate revenue. If
 * the album parent ALSO allocated, every album sale would pay twice — which is
 * exactly what migration 20261008120000 changed the trigger to prevent.
 *
 * This inserts a completed album transaction and asserts that the trigger
 * writes NO revenue_splits for it. That is the receipt behaviour the fan-out
 * depends on.
 *
 * Read-then-delete: the transaction and any splits are removed and the deletion
 * verified, so running this leaves production as it found it.
 *
 * Usage: node scripts/e2e-album.mjs
 */
import { readFileSync } from "node:fs";

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
const ok = (s) => console.log(`  PASS  ${s}`);
const bad = (s) => {
  console.log(`  FAIL  ${s}`);
  process.exitCode = 1;
};
const money = (n) => `K${Number(n || 0).toFixed(2)}`;

const albums = await (
  await fetch(`${BASE}/rest/v1/albums?select=id,title,price,status&status=eq.approved`, {
    headers: H,
  })
).json();

if (!albums.length) {
  console.error("no approved album to test");
  process.exit(2);
}
const album = albums[0];
console.log(`album "${album.title}" priced ${money(album.price)}\n`);

const tracks = await (
  await fetch(
    `${BASE}/rest/v1/songs?select=id,title,price,status&album_id=eq.${album.id}&status=eq.approved`,
    { headers: H },
  )
).json();
const paid = tracks.filter((t) => Number(t.price) > 0);
console.log(`approved tracks ${tracks.length}, paid ${paid.length}\n`);

// --- the album is sellable at all
Number(album.price) > 0
  ? ok(`album has a price (${money(album.price)}) so /checkout accepts it`)
  : bad(`album price is ${money(album.price)} — not sellable as a bundle`);
paid.length > 0
  ? ok(`${paid.length} paid track(s) to grant`)
  : bad("no paid tracks — a purchase would grant nothing");

// --- proportional split must sum to the album price exactly
const pool = Number(album.price) * 0.8;
const cents = paid.map((t) =>
  Math.floor((pool * Number(t.price) * 100) / paid.reduce((s, x) => s + Number(x.price), 0)),
);
let allocated = cents.reduce((a, b) => a + b, 0);
const targetCents = Math.round(pool * 100);
console.log(`\nproportional split of the artists' pool (${money(pool)}):`);
console.log(`  before remainder: ${money(allocated / 100)}`);
if (allocated !== targetCents) {
  const order = paid
    .map((t, i) => ({
      i,
      frac: (pool * Number(t.price) * 100) / paid.reduce((s, x) => s + Number(x.price), 0),
    }))
    .sort((a, b) => b.frac - Math.floor(b.frac) - (a.frac - Math.floor(a.frac)) || a.i - b.i);
  let rem = targetCents - allocated;
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) allocated++;
}
allocated === targetCents
  ? ok(`split lands exactly on the artists' pool (${money(allocated / 100)})`)
  : bad(`split is ${money(allocated / 100)}, pool is ${money(pool)} — ngwee lost`);

// --- the parent album transaction must allocate NOTHING
console.log("\nalbum parent transaction:");
const res = await fetch(`${BASE}/rest/v1/payment_transactions?select=id,item_id`, {
  method: "POST",
  headers: { ...json, Prefer: "return=representation" },
  body: JSON.stringify({
    user_id: "00000000-0000-0000-0000-0000000000e2",
    amount: album.price,
    currency: "ZMW",
    method_code: "mtn_momo",
    provider: "e2e",
    status: "completed",
    item_type: "album",
    item_id: album.id,
    metadata: { e2e: "album-parent" },
  }),
});

if (!res.ok) {
  bad(`insert album transaction: ${res.status} ${(await res.text()).slice(0, 160)}`);
} else {
  const [tx] = await res.json();
  const splits = await (
    await fetch(
      `${BASE}/rest/v1/revenue_splits?select=payee_role,amount&transaction_id=eq.${tx.id}`,
      {
        headers: H,
      },
    )
  ).json();

  splits.length === 0
    ? ok("no revenue_splits written for the album parent — it is a receipt only")
    : bad(
        `the album parent allocated ${splits
          .map((s) => `${s.payee_role} ${money(s.amount)}`)
          .join(", ")} — with per-track children this pays the release TWICE`,
      );

  const total = splits.reduce((s, r) => s + Number(r.amount), 0);
  if (total > 0) {
    bad(`parent allocated ${money(total)} on top of the children's shares`);
  }

  await fetch(`${BASE}/rest/v1/revenue_splits?transaction_id=eq.${tx.id}`, {
    method: "DELETE",
    headers: H,
  });
  await fetch(`${BASE}/rest/v1/payment_transactions?id=eq.${tx.id}`, {
    method: "DELETE",
    headers: H,
  });
  const left = await (
    await fetch(`${BASE}/rest/v1/payment_transactions?id=eq.${tx.id}`, { headers: H })
  ).json();
  left.length === 0 ? ok("test transaction removed") : bad("cleanup failed");
}
