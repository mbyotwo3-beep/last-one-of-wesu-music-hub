/**
 * Detail of the album(s) in the catalogue: price, tracks, and whether the
 * album price is the sum of its tracks or a discount.
 *
 * That ratio decides whether the fan-out split is proportional — which it is,
 * by design — so a discounted release does not pay out more than was taken.
 *
 * Read only. Usage: node scripts/inspect-album.mjs
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

const albums = await (
  await fetch(`${BASE}/rest/v1/albums?select=id,title,status,price,release_date`, { headers: H })
).json();

if (!albums.length) console.log("no albums");

for (const a of albums) {
  const tracks = await (
    await fetch(
      `${BASE}/rest/v1/songs?select=id,title,price,status,track_number&album_id=eq.${a.id}&order=track_number.asc`,
      { headers: H },
    )
  ).json();

  const paid = tracks.filter((t) => Number(t.price) > 0);
  const sum = paid.reduce((s, t) => s + Number(t.price), 0);
  const approved = tracks.filter((t) => t.status === "approved");

  console.log(`\nALBUM: ${a.title}`);
  console.log(`  status          ${a.status}`);
  console.log(`  album price     K${a.price}`);
  console.log(`  tracks          ${tracks.length} (approved: ${approved.length})`);
  console.log(`  paid tracks     ${paid.length}`);
  console.log(`  sum of paid     K${sum.toFixed(2)}`);
  if (paid.length) {
    const diff = sum - Number(a.price);
    console.log(
      `  relationship    ${
        diff > 0.005
          ? `DISCOUNT — K${diff.toFixed(2)} cheaper than the sum of tracks`
          : diff < -0.005
            ? `PREMIUM — K${Math.abs(diff).toFixed(2)} more than the sum of tracks`
            : "exactly the sum of tracks"
      }`,
    );
    console.log(`  track prices    ${paid.map((t) => `K${t.price}`).join(", ")}`);
    console.log(
      `  visible on /albums: ${
        a.status === "approved" && approved.length > 0
          ? "yes"
          : "NO — invisible until approved with at least one approved track"
      }`,
    );
    if (approved.length && approved.length < tracks.length) {
      console.log(
        `  WARNING         ${tracks.length - approved.length} track(s) not approved; they will not appear`,
      );
    }
    if (a.status === "approved" && approved.length) {
      const per = Number(a.price) / approved.length;
      console.log(`  payout per track ~K${per.toFixed(2)} (proportional split)`);
    }
  } else {
    console.log("  no paid tracks — this release is free and unsellable as a bundle");
  }
}
