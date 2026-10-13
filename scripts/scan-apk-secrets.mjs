/**
 * Fail the build if a privileged credential is shipped inside the APK.
 *
 * Why this exists: the app is a WebView shell pointing at
 * https://www.wesuplus.com/, so no credential should ever be in the binary. That
 * is an intention, not a guarantee — Capacitor copies the whole webDir into the
 * APK, so anything the client build inlines is extractable by anyone who
 * unzips it.
 *
 * METHOD — and why it is this method.
 *
 * Substring matching cannot answer this question, and got it wrong twice here:
 *
 *   1. Comparing the first 24 characters matched the JWT header
 *      `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`, which every Supabase key shares.
 *      It reported the service-role key as leaked. It was not.
 *   2. Comparing a slice from the middle then matched by chance inside a longer
 *      base64 blob, and again reported a breach that did not exist.
 *
 * The only sound method is to extract every JWT in the package, decode the
 * payload, and read the `role` claim. That is what this does. `anon` is expected
 * — the publishable key is public by design and RLS is what protects it.
 * `service_role` is a full RLS bypass and must never appear.
 *
 * Non-JWT secrets (Lenco) are checked by substring, which is safe for them: they
 * are random strings with no shared prefix.
 *
 * Usage: node scripts/scan-apk-secrets.mjs [apkPath]
 *   npm run verify:no-secrets   (also wired into the Android build script)
 */
import { readFileSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * Where the built APK actually lives.
 *
 * It defaults to "wesuplus.apk" in the repository root, which does not exist —
 * the file is in public/ (what Vercel serves) and in build/android/ (the
 * release artefact). So `node scripts/scan-apk-secrets.mjs` printed
 * "nothing to scan (skipped)" and exited 0, on a run where a 7 MB APK was
 * sitting right there.
 *
 * A credential scan that silently skips is worse than no scan: it reports a
 * clean build while checking nothing. It now searches the real locations, and
 * FAILS if it finds none, unless --allow-missing is passed explicitly.
 */
const CANDIDATES = [
  "android/app/build/outputs/apk/release/app-release.apk",
  "build/android/wesuplus.apk",
  "public/wesuplus.apk",
];

const allowMissing = process.argv.includes("--allow-missing");
const explicit = process.argv.slice(2).find((a) => !a.startsWith("--"));
const APK = explicit ?? CANDIDATES.find((p) => existsSync(p));

if (!APK) {
  if (allowMissing) {
    console.log("  no APK found — skipped because --allow-missing was passed");
    process.exit(0);
  }
  console.error(
    "  no APK to scan. Looked in:\n" +
      CANDIDATES.map((p) => `        ${p}`).join("\n") +
      "\n  Build one, or pass --allow-missing if a missing APK is genuinely fine.",
  );
  process.exit(1);
}

function envFile(name) {
  try {
    const out = {};
    for (const line of readFileSync(name, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...envFile(".env"), ...envFile(".env.local") };

/**
 * Read text-like entries directly from the APK archive (ZIP format)
 * using built-in Node.js buffers and zlib.inflateRawSync.
 *
 * This runs natively on any OS (Linux on Vercel/CI, macOS, Windows) without
 * spawning external OS processes (e.g. powershell.exe).
 */
function extractApkTextEntries(apkPath) {
  const buf = readFileSync(apkPath);

  // Locate the End of Central Directory (EOCD) record.
  // Standard EOCD is 22 bytes, comment can be up to 65535 bytes.
  let eocd = -1;
  const searchLimit = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= searchLimit; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new Error(`Invalid ZIP archive: EOCD record not found in ${apkPath}`);
  }

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const texts = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries && p < eocd; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;

    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);

    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (compSize > 0 && /\.(dex|js|html|json|xml|properties|txt)$/i.test(name)) {
      if (localHeaderOffset + 30 <= buf.length && buf.readUInt32LE(localHeaderOffset) === 0x04034b50) {
        const locNameLen = buf.readUInt16LE(localHeaderOffset + 26);
        const locExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
        const dataOffset = localHeaderOffset + 30 + locNameLen + locExtraLen;

        if (dataOffset + compSize <= buf.length) {
          const raw = buf.subarray(dataOffset, dataOffset + compSize);
          try {
            const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
            if (data) {
              texts.push(data.toString("latin1"));
            }
          } catch {
            // Ignore unreadable or corrupt entry
          }
        }
      }
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return texts;
}

const pad = (s) => s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);

// Extract text files directly from the APK archive
const texts = extractApkTextEntries(APK);

// --- 1. every JWT, by decoded role
const roles = new Map();
let blob = "";
for (const text of texts) {
  blob += text;
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g)) {
    let claims;
    try {
      claims = JSON.parse(Buffer.from(pad(m[0].split(".")[1]), "base64").toString("utf8"));
    } catch {
      continue;
    }
    const role = claims.role ?? "(none)";
    if (!roles.has(role)) roles.set(role, 0);
    roles.set(role, roles.get(role) + 1);
  }
}

console.log(`  scanned ${APK}`);
console.log(
  `  JWT roles: ${[...roles.entries()].map(([r, n]) => `${r}=${n}`).join(", ") || "none"}`,
);

// --- 2. non-JWT secrets by substring
const nonJwt = Object.entries(env).filter(
  ([k, v]) =>
    v &&
    v.length >= 20 &&
    !/^https?:/i.test(v) &&
    !/^#[0-9a-f]{3,8}$/i.test(v) &&
    /(_KEY|_SECRET|TOKEN|PASSWORD)/i.test(k) &&
    !/^eyJ[A-Za-z0-9_-]+\./.test(v),
);
for (const [name, value] of nonJwt) {
  console.log(`  ${blob.includes(value) ? "LEAKED " : "clean  "} ${name}`);
}

const privileged = roles.get("service_role") ?? 0;
const leakedNonJwt = nonJwt.filter(([, v]) => blob.includes(v));

console.log(
  privileged || leakedNonJwt.length
    ? `  FAIL service_role=${privileged}, non-JWT secrets leaked=${leakedNonJwt.length}`
    : "  no privileged credential in the APK",
);

process.exit(privileged || leakedNonJwt.length ? 1 : 0);
