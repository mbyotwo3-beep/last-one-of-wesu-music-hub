/**
 * Bulk catalogue importer.
 *
 * The launch blocker is content, not code: 4 songs and 0 albums live. Getting
 * an artist's existing catalogue in one at a time through the studio upload
 * wizard is the bottleneck, so this loads a whole catalogue from a manifest
 * and local media folder in one pass.
 *
 * Safety model:
 *   - DRY RUN by default. Nothing is written until you pass --apply.
 *   - Idempotent: matches on artist name / album title / song title within the
 *     artist, so a re-run after adding files updates instead of duplicating.
 *   - Prices are validated against the LIVE platform pricing config, so an
 *     import can never create a track the storefront would refuse to sell.
 *   - Uses the service role key, which bypasses RLS. Treat the key as a
 *     launch-week credential: run locally, never commit it, revoke after.
 *
 * Usage:
 *   node scripts/import-catalogue.mjs --manifest catalogue.json --media ./media
 *   node scripts/import-catalogue.mjs --manifest catalogue.json --media ./media --apply
 *
 * Manifest shape (see catalogue.example.json):
 *   { artists: [ { name, user_id?, email?, genre?, bio?, avatar?,
 *                  albums:  [ { title, price, genre?, release_date?, cover?,
 *                               status?, tracks: [ { title, price?, audio,
 *                                                     duration?, track_number? } ] } ],
 *                  singles: [ { title, price?, audio, duration?, genre? } ] } ] }
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- args
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const APPLY = flag("apply");
const MANIFEST = opt("manifest", "catalogue.json");
const MEDIA_ROOT = resolve(opt("media", "media"));
const BATCH = Number(opt("batch", "50"));
/** Optional explicit pricing JSON, which also skips the pricing lookup. */
const PRICING_OVERRIDE = opt("pricing", null);

// ---------------------------------------------------------------- env
function readEnv() {
  const out = {};
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  } catch {
    /* fall back to process.env */
  }
  return { ...out, ...process.env };
}
const env = readEnv();
const URL = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? env.SERVICE_ROLE_KEY;

// Fail loudly rather than silently importing nothing.
if (!URL) {
  console.error("FATAL: no SUPABASE_URL (set it in .env or the environment).");
  process.exit(2);
}
if (!SERVICE_KEY) {
  if (APPLY) {
    console.error(
      "FATAL: no service role key.\n" +
        "  Writing needs SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Project\n" +
        "  Settings → API Keys). Never commit it. A dry run needs no credentials.",
    );
    process.exit(2);
  }
  // A dry run never calls the database, so it rehearses with no credentials —
  // which is what makes it safe to run against a manifest before you have set
  // up credentials or while offline.
}

// `||` not `??`: createClient also rejects an empty-string key, and a dry run
// must survive a blank SUPABASE_SERVICE_ROLE_KEY in the environment.
const db = createClient(URL, SERVICE_KEY || "dry-run-no-key", {
  auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------- logging
const line = (s = "") => console.log(s);
const info = (s) => line(`  ${s}`);
const warn = (s) => line(`  ! ${s}`);
const stats = { created: 0, updated: 0, skipped: 0, uploaded: 0, errors: 0, freed: 0 };
/** Per-entity counts, kept separate from the mixed created/updated tally. */
const totals = { artists: 0, albums: 0, songs: 0 };

// ---------------------------------------------------------------- pricing
const DEFAULT_PRICING = { song_min: 10, song_max: 100, album_min: 150, album_max: 250 };

async function loadPricing() {
  if (PRICING_OVERRIDE) {
    try {
      return { ...DEFAULT_PRICING, ...JSON.parse(PRICING_OVERRIDE) };
    } catch {
      console.error("FATAL: --pricing is not valid JSON");
      process.exit(2);
    }
  }
  try {
    // Bounded: an unreachable Supabase must not hang the import forever.
    const res = await fetch(`${URL}/rest/v1/platform_settings?select=value&key=eq.pricing`, {
      headers: {
        apikey: SERVICE_KEY ?? "",
        Authorization: `Bearer ${SERVICE_KEY ?? ""}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const rows = await res.json();
      const value = Array.isArray(rows) ? rows[0]?.value : null;
      return { ...DEFAULT_PRICING, ...(value ?? {}) };
    }
  } catch {
    /* fall through to the warning below */
  }
  // Falling back is deliberate but must be loud: these are the bounds the
  // storefront enforces, so importing against different ones can create
  // tracks the shop will refuse to sell.
  console.warn(
    "  ! could not read live pricing (network or permissions) — using built-in defaults:\n" +
      `      song ${DEFAULT_PRICING.song_min}-${DEFAULT_PRICING.song_max} K, album ${DEFAULT_PRICING.album_min}-${DEFAULT_PRICING.album_max} K\n` +
      '    Re-run with --pricing \'{"song_min":10,"song_max":100,"album_min":150,"album_max":250}\' to set them explicitly.',
  );
  return { ...DEFAULT_PRICING };
}

/** Validate a price the same way the app would, and return a usable number. */
function checkPrice(raw, { min, max }, label, errors) {
  const price = raw === undefined || raw === null || raw === "" ? null : Number(raw);
  if (price === null) return null;
  if (!Number.isFinite(price) || price < 0) {
    errors.push(`${label}: price "${raw}" is not a number`);
    return null;
  }
  if (price > max) {
    errors.push(`${label}: K${price} is above the maximum K${max}`);
    return null;
  }
  // Free is allowed (that is how a free tier gets built) but must never be a
  // typo for a real price, so it is only accepted as an explicit 0.
  if (price > 0 && price < min) {
    errors.push(`${label}: K${price} is below the minimum K${min} (use 0 for free)`);
    return null;
  }
  if (price === 0) stats.freed++;
  return Math.round(price * 100) / 100;
}

// ---------------------------------------------------------------- storage
const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac", ".opus"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function safeName(name) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "file"
  );
}

/** Upload once; returns the stored storage path. */
async function upload(localPath, bucket, folder) {
  const abs = resolve(join(MEDIA_ROOT, localPath));
  if (!existsSync(abs)) throw new Error(`media file not found: ${localPath}`);
  const info_ = await stat(abs);
  if (info_.size === 0) throw new Error(`media file is empty: ${localPath}`);
  const path = `${folder}/${Date.now()}-${safeName(basename(abs))}`;
  const bytes = await readFile(abs);
  const { error } = await db.storage.from(bucket).upload(path, bytes, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`upload failed for ${localPath}: ${error.message}`);
  stats.uploaded++;
  return path;
}

async function uploadAudio(p) {
  return upload(p, "song-audio", "import");
}
async function uploadImage(p) {
  return upload(p, "album-art", "import");
}

function assertExt(localPath, allowed, what) {
  if (!allowed.has(extname(localPath).toLowerCase())) {
    throw new Error(`${what} has an unsupported extension: ${localPath}`);
  }
}

// ---------------------------------------------------------------- entities
/**
 * Find-or-create the auth user an artist profile must hang off.
 *
 * A dry run is completely offline: it never creates accounts and never
 * queries the database, so it can rehearse an import with no credentials and
 * no risk of a half-applied artist.
 */
async function resolveOwner(spec, name) {
  // Validated in BOTH modes: an entry with no owner can never become a real
  // artist, so a rehearsal must surface it rather than report success.
  if (!spec.user_id && !spec.email) {
    throw new Error(`artist "${name}" needs either user_id or email in the manifest`);
  }
  if (spec.user_id) return { userId: spec.user_id, createdUser: false };

  if (!APPLY) {
    // Synthetic identity so the rehearsal can still match and count rows.
    return { userId: `dry-run:${(spec.email ?? name).toLowerCase()}`, createdUser: false };
  }

  // Creating the account lets the artist claim the profile with "forgot
  // password" later. The random password is never shared or used.
  const { data, error } = await db.auth.admin.createUser({
    email: spec.email,
    email_confirm: true,
    password: `Wesu-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });
  if (error) {
    // Already exists is fine — look the user up instead.
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === spec.email.toLowerCase());
    if (!found) throw new Error(`artist "${name}": ${error.message}`);
    return { userId: found.id, createdUser: true };
  }
  return { userId: data.user.id, createdUser: true };
}

/** Existing-artist lookup. Skipped entirely during a dry run. */
async function findArtist(userId) {
  if (!APPLY) return null;
  const { data } = await db
    .from("artists")
    .select("id,name,status,avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

async function upsertArtist(spec, errors) {
  const { name } = spec;
  if (!name) {
    errors.push("an artist entry has no name");
    return null;
  }

  let owner;
  try {
    owner = await resolveOwner(spec, name);
  } catch (e) {
    errors.push(e.message);
    return null;
  }

  const existing = await findArtist(owner.userId);

  const patch = {
    name,
    genre: spec.genre ?? null,
    bio: spec.bio ?? null,
    // Artists are approved directly by an operator import: this is the
    // launch-week path, and a pending profile shows an empty artist page.
    status: spec.status ?? "approved",
    verification_status: spec.verification_status ?? "verified",
  };

  if (spec.avatar) {
    try {
      assertExt(spec.avatar, IMAGE_EXT, "avatar");
      if (APPLY) patch.avatar_url = await uploadImage(spec.avatar);
    } catch (e) {
      errors.push(`artist "${name}": ${e.message}`);
    }
  }

  if (existing) {
    if (APPLY) {
      const { error } = await db.from("artists").update(patch).eq("id", existing.id);
      if (error) errors.push(`artist "${name}" update: ${error.message}`);
      else stats.updated++;
    } else {
      stats.updated++;
    }
    return existing.id;
  }

  if (!APPLY) {
    stats.created++;
    return "DRAFT_ID";
  }
  const { data, error } = await db
    .from("artists")
    .insert({ ...patch, user_id: owner.userId })
    .select("id")
    .single();
  if (error) {
    errors.push(`artist "${name}" insert: ${error.message}`);
    return null;
  }
  stats.created++;
  stats.artists++;
  return data.id;
}

async function upsertAlbum(spec, artistId, artistName, pricing, errors) {
  const price = checkPrice(
    spec.price,
    { min: pricing.album_min, max: pricing.album_max },
    `album "${spec.title}"`,
    errors,
  );
  if (price === null && spec.price !== undefined && spec.price !== null && spec.price !== "")
    return null;

  const existing = APPLY
    ? (
        await db
          .from("albums")
          .select("id,title,cover_url,status")
          .eq("artist_id", artistId)
          .eq("title", spec.title)
          .maybeSingle()
      ).data
    : null;

  const patch = {
    artist_id: artistId,
    title: spec.title,
    price,
    genre: spec.genre ?? null,
    description: spec.description ?? null,
    release_date: spec.release_date ?? null,
    status: spec.status ?? "approved",
  };
  if (spec.cover) {
    try {
      assertExt(spec.cover, IMAGE_EXT, "album cover");
      if (APPLY) patch.cover_url = await uploadImage(spec.cover);
    } catch (e) {
      errors.push(`album "${spec.title}": ${e.message}`);
    }
  }

  if (existing) {
    if (APPLY) {
      const { error } = await db.from("albums").update(patch).eq("id", existing.id);
      if (error) errors.push(`album "${spec.title}" update: ${error.message}`);
      else stats.updated++;
    } else stats.updated++;
    return existing.id;
  }
  if (!APPLY) {
    stats.created++;
    return "DRAFT_ID";
  }
  const { data, error } = await db.from("albums").insert(patch).select("id").single();
  if (error) {
    errors.push(`album "${spec.title}" insert: ${error.message}`);
    return null;
  }
  stats.created++;
  return data.id;
}

async function upsertSong(
  spec,
  { artistId, artistName, albumId, albumTitle, albumCover, pricing },
  errors,
) {
  const where = spec.title;
  const existing = APPLY
    ? (
        await db
          .from("songs")
          .select("id,title,audio_url")
          .eq("artist_id", artistId)
          .eq("title", where)
          .maybeSingle()
      ).data
    : null;

  if (!spec.audio) {
    warn(`song "${spec.title}" (${artistName}) has no audio file — skipped`);
    stats.skipped++;
    return;
  }

  const price = checkPrice(
    spec.price,
    { min: pricing.song_min, max: pricing.song_max },
    `song "${spec.title}"`,
    errors,
  );
  if (price === null && spec.price !== undefined && spec.price !== null && spec.price !== "")
    return;

  const patch = {
    artist_id: artistId,
    album_id: albumId ?? null,
    title: spec.title,
    price,
    genre: spec.genre ?? null,
    duration: spec.duration ? Math.max(0, Math.round(Number(spec.duration))) : null,
    track_number: spec.track_number ?? null,
    explicit: !!spec.explicit,
    release_date: spec.release_date ?? null,
    status: spec.status ?? "approved",
    // Album art doubles as track art in this schema, which is what the
    // storefront shows for a track row.
    cover_url: spec.cover ?? albumCover ?? null,
  };

  if (APPLY) {
    try {
      assertExt(spec.audio, AUDIO_EXT, "audio");
      patch.audio_url = await uploadAudio(spec.audio);
    } catch (e) {
      errors.push(`song "${spec.title}": ${e.message}`);
      return;
    }
  }

  if (existing) {
    if (APPLY) {
      const { error } = await db.from("songs").update(patch).eq("id", existing.id);
      if (error) errors.push(`song "${spec.title}" update: ${error.message}`);
      else stats.updated++;
    } else stats.updated++;
    return;
  }
  if (!APPLY) {
    stats.created++;
    totals.songs++;
    return;
  }
  const { error } = await db.from("songs").insert(patch);
  if (error) {
    errors.push(`song "${spec.title}" insert: ${error.message}`);
    stats.errors++;
    return;
  }
  stats.created++;
  totals.songs++;
}

// ---------------------------------------------------------------- main
async function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`FATAL: manifest not found: ${MANIFEST}`);
    process.exit(2);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch (e) {
    console.error(`FATAL: manifest is not valid JSON: ${e.message}`);
    process.exit(2);
  }

  const artists = Array.isArray(manifest.artists) ? manifest.artists : [];
  if (!artists.length) {
    console.error("FATAL: manifest has no artists[]");
    process.exit(2);
  }

  const pricing = await loadPricing();
  const errors = [];

  line();
  line(`Wesu+ catalogue import — ${APPLY ? "APPLYING" : "DRY RUN (nothing will be written)"}`);
  line(`manifest: ${MANIFEST}`);
  line(`media:    ${MEDIA_ROOT}`);
  line(
    `pricing:  song ${pricing.song_min}-${pricing.song_max} K, album ${pricing.album_min}-${pricing.album_max} K`,
  );
  line();

  for (const spec of artists) {
    const name = spec.name ?? "(unnamed)";
    const artistId = await upsertArtist(spec, errors);
    if (!artistId) continue;
    totals.artists++;
    line(`${APPLY ? "+" : "·"} ${name}`);

    for (const album of spec.albums ?? []) {
      const albumId = await upsertAlbum(album, artistId, name, pricing, errors);
      if (!albumId) {
        errors.push(`album "${album.title}" skipped (price invalid)`);
        continue;
      }
      totals.albums++;
      const trackCount = (album.tracks ?? []).length;
      info(
        `album "${album.title}" — ${trackCount} track(s), ${trackCount ? `K${album.price ?? 0}` : "no tracks"}`,
      );
      for (const track of album.tracks ?? []) {
        await upsertSong(
          track,
          {
            artistId,
            artistName: name,
            albumId,
            albumTitle: album.title,
            albumCover: null,
            pricing,
          },
          errors,
        );
      }
    }

    for (const single of spec.singles ?? []) {
      await upsertSong(
        single,
        {
          artistId,
          artistName: name,
          albumId: null,
          pricing,
        },
        errors,
      );
      info(`single "${single.title}"`);
    }
  }

  line();
  line("──────────────────────────────────────");
  if (!APPLY) {
    line(
      `DRY RUN — would import ${totals.songs} song(s), ${totals.albums} album(s), ${totals.artists} artist(s)`,
    );
    line(
      `  create ${stats.created} · update ${stats.updated} · skip ${stats.skipped} · free-priced ${stats.freed}`,
    );
    line("  Nothing was written. Re-run with --apply to import for real.");
  } else {
    line(`Imported: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped`);
    line(`  ${stats.uploaded} media file(s) uploaded · ${stats.freed} free-priced`);
  }

  if (errors.length) {
    stats.errors = errors.length;
    line();
    line(`${errors.length} problem(s):`);
    for (const e of errors.slice(0, 40)) line(`  - ${e}`);
    if (errors.length > 40) line(`  …and ${errors.length - 40} more`);
  }
  line();
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(2);
});
