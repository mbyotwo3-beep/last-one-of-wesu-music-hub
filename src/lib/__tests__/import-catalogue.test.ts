import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type RunResult = { code: number; out: string };
type RunEnv = Record<string, string>;

/**
 * The importer is the fastest route to a launch-worthy catalogue, so its
 * safety rails are tested: dry-run writes nothing, prices are validated against
 * the live config, and the manifest is rejected loudly when malformed.
 *
 * A fake Supabase service role is pointed at by SUPABASE_URL/KEY, but the DB
 * client is never reached in a dry run, so these tests need no credentials and
 * no network.
 */

const script = join(process.cwd(), "scripts", "import-catalogue.mjs");

// Prices are passed explicitly so the tests never touch the network: asserting
// against the LIVE config would make this suite fail whenever a superadmin
// changes a price, and a dry run must work offline.
const PRICING = JSON.stringify({ song_min: 10, song_max: 100, album_min: 150, album_max: 250 });

async function run(args: string[], env: RunEnv = {}): Promise<RunResult> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [script, ...args, "--pricing", PRICING],
      {
        env: {
          ...process.env,
          SUPABASE_URL: "https://stub.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "stub-key",
          ...env,
        },
        cwd: process.cwd(),
        timeout: 30_000,
      },
      (err, stdout, stderr) =>
        // err.code is a number for a non-zero exit, but a string for a signal.
        resolve({
          code: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          out: stdout + stderr,
        }),
    );
  });
}

async function makeFixture(manifest: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "wesu-import-"));
  const manifestPath = join(dir, "catalogue.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await mkdir(join(dir, "media"), { recursive: true });
  return { dir, manifestPath, media: join(dir, "media") };
}

describe("catalogue importer safety", () => {
  it("refuses to APPLY without a service role key, but still rehearses", async () => {
    const { dir, manifestPath } = await makeFixture({
      artists: [
        {
          name: "Test Artist",
          email: "t@e.com",
          singles: [{ title: "One", price: 10, audio: "a.mp3" }],
        },
      ],
    });
    const r = await run(["--manifest", manifestPath, "--media", dir, "--apply"], {
      SUPABASE_SERVICE_ROLE_KEY: "",
    });
    // Writing without the key must stop the run before anything is created.
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/no service role key/i);

    // The same manifest rehearses fine with no credentials at all, which is
    // what makes a dry run safe to run before credentials exist.
    const dry = await run(["--manifest", manifestPath, "--media", dir], {
      SUPABASE_SERVICE_ROLE_KEY: "",
    });
    expect(dry.code).toBe(0);
    expect(dry.out).toMatch(/would import 1 song\(s\)/);
    await rm(dir, { recursive: true, force: true });
  });

  it("fails loudly on a missing manifest rather than importing nothing", async () => {
    const r = await run(["--manifest", "does-not-exist.json"]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/manifest not found/i);
  });

  it("fails loudly on invalid JSON", async () => {
    const { dir, manifestPath } = await makeFixture({});
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(manifestPath, "{ this is not json");
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/not valid JSON/i);
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects an empty artists list", async () => {
    const { dir, manifestPath } = await makeFixture({ artists: [] });
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/no artists/i);
    await rm(dir, { recursive: true, force: true });
  });

  it("is a dry run by default and says nothing was written", async () => {
    const { dir, manifestPath } = await makeFixture({
      artists: [
        {
          name: "Test Artist",
          email: "test@example.com",
          albums: [
            {
              title: "Test Album",
              price: 150,
              tracks: [{ title: "Track One", price: 10, audio: "audio/one.mp3" }],
            },
          ],
        },
      ],
    });
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    expect(r.out).toMatch(/DRY RUN/);
    expect(r.out).toMatch(/Nothing was written/);
    // No --apply means no writes: the summary reports intent, not results.
    expect(r.out).toMatch(/would import 1 song\(s\), 1 album\(s\)/);
    await rm(dir, { recursive: true, force: true });
  });

  it("flags a song priced below the minimum and above the maximum", async () => {
    const { dir, manifestPath } = await makeFixture({
      artists: [
        {
          name: "Test Artist",
          email: "test@example.com",
          singles: [
            { title: "Too Cheap", price: 1, audio: "audio/a.mp3" },
            { title: "Too Dear", price: 99999, audio: "audio/b.mp3" },
            { title: "Not A Number", price: "free please", audio: "audio/c.mp3" },
            { title: "Fine", price: 10, audio: "audio/d.mp3" },
          ],
        },
      ],
    });
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    // Default config: song_min 10, song_max 100.
    expect(r.out).toMatch(/Too Cheap.*below the minimum K10/is);
    expect(r.out).toMatch(/Too Dear.*above the maximum K100/is);
    expect(r.out).toMatch(/Not A Number.*is not a number/is);
    // The valid track is still counted.
    expect(r.out).toMatch(/would import 1 song\(s\)/);
    expect(r.code).toBe(1); // problems reported
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts price 0 as free and counts it separately", async () => {
    const { dir, manifestPath } = await makeFixture({
      artists: [
        {
          name: "Test Artist",
          email: "test@example.com",
          singles: [{ title: "Free One", price: 0, audio: "audio/free.mp3" }],
        },
      ],
    });
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    expect(r.out).toMatch(/free-priced 1/);
    expect(r.code).toBe(0);
    await rm(dir, { recursive: true, force: true });
  });

  it("requires an owner (user_id or email) for every artist", async () => {
    const { dir, manifestPath } = await makeFixture({
      artists: [{ name: "Ownerless Artist", singles: [] }],
    });
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    expect(r.out).toMatch(/needs either user_id or email/i);
    expect(r.code).toBe(1);
    await rm(dir, { recursive: true, force: true });
  });

  it("skips a track with no audio file rather than creating a silent song", async () => {
    const { dir, manifestPath } = await makeFixture({
      artists: [
        {
          name: "Test Artist",
          email: "test@example.com",
          singles: [{ title: "No Audio", price: 10 }],
        },
      ],
    });
    const r = await run(["--manifest", manifestPath, "--media", dir]);
    expect(r.out).toMatch(/no audio file/i);
    expect(r.out).toMatch(/would import 0 song\(s\)/);
    await rm(dir, { recursive: true, force: true });
  });
});
