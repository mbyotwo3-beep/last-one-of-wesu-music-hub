/**
 * Structural check on ios/App/App.xcodeproj/project.pbxproj.
 *
 * WHY THIS EXISTS
 *
 * The pbxproj is an OpenStep property list, not XML — trying to validate it with
 * an XML parser fails on the file header, which says nothing about whether Xcode
 * can open it. A malformed pbxproj is the classic "it worked on my machine"
 * failure: you cannot check it on Windows, you only find out on the Mac, hours
 * into an App Store upload, and the error is usually a vague "The project
 * cannot be opened".
 *
 * So this checks the two things that actually break it:
 *
 *   1. braces and parentheses balance;
 *   2. every internal object reference (fileRef, productRef, package,
 *      buildConfigurationList, productReference, baseConfigurationReference)
 *      points at an ID that is actually defined in the file.
 *
 * A dangling reference is exactly what adding a resource by hand produces, and
 * it is what this caught when the privacy manifest was wired in.
 *
 * Usage: node scripts/check-ios-project.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const FILE = "ios/App/App.xcodeproj/project.pbxproj";
const text = readFileSync(FILE, "utf8");

const problems = [];

// --- 1. balance
let depth = 0;
let paren = 0;
let inString = false;
let inComment = false;
for (let i = 0; i < text.length; i++) {
  const c = text[i];
  const next = text[i + 1];
  if (inComment) {
    if (c === "*" && next === "/") {
      inComment = false;
      i++;
    }
    continue;
  }
  if (inString) {
    if (c === '"') inString = false;
    continue;
  }
  if (c === "/" && next === "*") {
    inComment = true;
    i++;
    continue;
  }
  if (c === '"') {
    inString = true;
    continue;
  }
  if (c === "{") depth++;
  else if (c === "}") depth--;
  else if (c === "(") paren++;
  else if (c === ")") paren--;
  if (depth < 0) {
    problems.push(`unbalanced '}' at offset ${i}`);
    break;
  }
}
if (depth !== 0) problems.push(`{ } unbalanced by ${depth}`);
if (paren !== 0) problems.push(`( ) unbalanced by ${paren}`);
if (inString) problems.push("unterminated string literal");

// --- 2. every defined object, and every reference to one
const defined = new Set();
// Object definitions look like:  <24-hex-id> /* comment */ = { isa = ...;
for (const m of text.matchAll(/^\t\t([0-9A-F]{24}) \/\*.*?\*\/ = \{/gm)) defined.add(m[1]);

const refKeys = [
  "fileRef",
  "productRef",
  "package",
  "buildConfigurationList",
  "productReference",
  "baseConfigurationReference",
];
const referenced = new Map();
for (const m of text.matchAll(
  /\b(fileRef|productRef|package|buildConfigurationList|productReference|baseConfigurationReference) = ([0-9A-F]{24})/g,
)) {
  const [, key, id] = m;
  if (!referenced.has(id)) referenced.set(id, key);
}

for (const [id, key] of referenced) {
  if (!defined.has(id)) problems.push(`dangling ${key} -> ${id} (not defined in this file)`);
}

// --- 3. the file we hand-edited must be wired into the resources phase
const resPhase = /isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/.exec(text);
if (!resPhase) {
  problems.push("no PBXResourcesBuildPhase found");
} else {
  for (const m of resPhase[1].matchAll(/([0-9A-F]{24}) \/\* (.+?) in Resources \*\//g)) {
    const [, id, name] = m;
    if (!defined.has(id))
      problems.push(`resources phase lists ${name} (${id}) which is not defined`);
  }
}

// --- 4. Info.plist must actually be referenced by a build configuration
if (!/INFOPLIST_FILE = App\/Info\.plist/.test(text)) {
  problems.push("no build configuration sets INFOPLIST_FILE to App/Info.plist");
}

// --- 5. the privacy manifest must exist AND be in the resources phase
// Apple requires PrivacyInfo.xcprivacy for App Store submission. It is easy to
// add the file and forget to add it to the target: the build still succeeds and
// the upload is rejected days later, which is the worst time to find out.
if (!existsSync("ios/App/App/PrivacyInfo.xcprivacy")) {
  problems.push("ios/App/App/PrivacyInfo.xcprivacy is missing — App Store submission requires it");
} else if (!resPhase || !resPhase[1].includes("PrivacyInfo.xcprivacy in Resources")) {
  problems.push(
    "PrivacyInfo.xcprivacy exists but is not in the Resources build phase — it would not ship",
  );
}

// --- 6. version must be defined in BOTH Debug and Release, and match
const versions = [...text.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
const marketing = [...text.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
if (new Set(versions).size !== 1 || versions.length < 2) {
  problems.push(`CURRENT_PROJECT_VERSION differs between configurations: ${versions.join(", ")}`);
}
if (new Set(marketing).size !== 1 || marketing.length < 2) {
  problems.push(`MARKETING_VERSION differs between configurations: ${marketing.join(", ")}`);
}

console.log(`  ${FILE}`);
console.log(`  ${defined.size} object(s), ${referenced.size} reference(s) all resolved`);
console.log(`  version ${marketing[0]} (${versions[0]})`);

if (problems.length) {
  for (const p of problems) console.error(`  FAIL ${p}`);
  console.error(`\n  ${problems.length} problem(s) — Xcode would fail to open this project`);
  process.exit(1);
}
console.log("  the project is structurally sound");
