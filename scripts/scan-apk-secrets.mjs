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
import { readFileSync, readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const APK = process.argv[2] ?? "wesuplus.apk";

if (!existsSync(APK)) {
  console.log(`  ${APK} not present — nothing to scan (skipped)`);
  process.exit(0);
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
const TMP = join(process.env.TEMP ?? ".", "apk-secrets-scan");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem;
     $z=[System.IO.Compression.ZipFile]::OpenRead('${resolve(APK)}');
     foreach($e in $z.Entries){
       if($e.Length -gt 0 -and ($e.FullName -match '\\.(dex|js|html|json|xml|properties|txt)$')){
         try{[System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,(Join-Path '${TMP}' ($e.FullName -replace '[\\\\/]','_')),$true)}catch{}
       }
     }
     $z.Dispose();`,
  ],
  { stdio: "ignore" },
);

const pad = (s) => s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);

// --- 1. every JWT, by decoded role
const roles = new Map();
let blob = "";
for (const f of readdirSync(TMP)) {
  let text;
  try {
    text = readFileSync(join(TMP, f)).toString("latin1");
    blob += text;
  } catch {
    continue;
  }
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
rmSync(TMP, { recursive: true, force: true });

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
