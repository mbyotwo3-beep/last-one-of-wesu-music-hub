/**
 * Do the role-gated workflows actually render?
 *
 * WHAT THIS IS
 *
 * Runtime evidence, not source reading. Reading produced a correct statement that
 * did not locate the fault, every time, until the /library page was rendered and
 * threw immediately.
 *
 *   listener   /dashboard          the switchboard everything redirects to
 *   artist     /artist-dashboard   earnings, catalogue, payouts
 *   artist     /artist-studio      the upload flow
 *   label      /label-dashboard    roster and royalties
 *
 * Cases are adversarial on purpose: a page that renders for a tidy fixture and
 * crashes on a real row — a null avatar, a song whose album was deleted, an
 * empty payout list — is not working.
 *
 * WHAT IT DOES NOT PROVE
 *
 * That the component does not throw. It does not prove the mutations work, that
 * the numbers are right, or that anything looks right on a screen. No browser is
 * attached to this session, so there is no visual evidence behind any of it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setRoles, renderPage, pageComponent } from "./-harness";

const artist = (over: Record<string, unknown> = {}) => ({
  id: "ar-1",
  name: "Gospel Sowers",
  avatar_url: null,
  verified: false,
  monthly_listeners: 1200,
  ...over,
});

const song = (over: Record<string, unknown> = {}) => ({
  id: "s-1",
  title: "Chooba",
  cover_url: null,
  duration: 214,
  price: 10,
  play_count: 42,
  status: "approved",
  ...over,
});

const album = (over: Record<string, unknown> = {}) => ({
  id: "al-1",
  title: "Yesu ni Nkonto",
  cover_url: null,
  price: 150,
  status: "approved",
  ...over,
});

/**
 * Render a page and surface the real failure if there is one.
 *
 * `prime` seeds the query cache so the page renders its DATA path, not its
 * loading state. Without it every one of these cases silently tested nothing —
 * see the note on renderPage.
 */
async function check(modulePath: string, prime?: Record<string, unknown>) {
  const Component = await pageComponent(modulePath);
  if (!Component) throw new Error(`${modulePath} exports no page component`);
  return renderPage(Component, prime);
}

/**
 * The property under test is THAT IT DOES NOT THROW.
 *
 * It is deliberately not "renders something". /dashboard redirects an artist,
 * admin or superadmin to their own surface the moment it mounts — with
 * useNavigate stubbed to a no-op the page then renders an empty string, which is
 * correct behaviour.
 *
 * The first version asserted toBeTruthy() on the markup and failed three cases
 * that were working exactly as designed. Reading those three failures as "three
 * broken dashboards" would have been the wrong fix in the most expensive
 * direction: rewriting correct navigation to satisfy a bad assertion.
 */
async function expectNoThrow(modulePath: string, prime?: Record<string, unknown>) {
  await expect(check(modulePath, prime)).resolves.toBeTypeOf("string");
}

beforeEach(() => setRoles(["user"]));

describe("listener dashboard", () => {
  it("renders a real page for a plain listener with no data", async () => {
    await expect(check("@/routes/dashboard")).resolves.toBeTruthy();
  });

  it("does not throw for a user who is also an artist", async () => {
    setRoles(["user", "artist"]);
    await expectNoThrow("@/routes/dashboard");
  });

  it("does not throw for an admin", async () => {
    setRoles(["user", "admin"]);
    await expectNoThrow("@/routes/dashboard");
  });

  it("does not throw for a superadmin", async () => {
    setRoles(["user", "superadmin"]);
    await expectNoThrow("@/routes/dashboard");
  });

  it("does not throw for a signed-out visitor", async () => {
    setRoles([]);
    await expectNoThrow("@/routes/dashboard");
  });
});

describe("artist dashboard", () => {
  beforeEach(() => setRoles(["user", "artist"]));

  // The query keys this page actually reads. Priming these is what makes the
  // data path reachable from a synchronous render.
  const OVERVIEW = ["artist-overview", "u-1"];
  const full = (over: Record<string, unknown> = {}) => ({
    artist: artist(),
    songs: [],
    albums: [],
    payouts: [],
    totalPlays: 0,
    totalRevenueZmw: 0,
    totalSongs: 0,
    followerCount: 0,
    ...over,
  });

  it("renders the empty state with no artist profile yet", async () => {
    const html = await check("@/routes/artist-dashboard", { [OVERVIEW.join("|")]: null });
    // No artist profile: the page must say so rather than crash or render blank.
    expect(html).toMatch(/artist/i);
  });

  it("renders a full dashboard with real data", async () => {
    const html = await check("@/routes/artist-dashboard", {
      [OVERVIEW.join("|")]: full({
        songs: [song()],
        albums: [album()],
        payouts: [{ id: "p-1", amount: 250, status: "pending", created_at: "2026-10-01" }],
        totalPlays: 42,
        totalRevenueZmw: 250,
        totalSongs: 1,
        followerCount: 3,
      }),
    });
    expect(typeof html).toBe("string");
  });

  it("renders when a song references an album that was deleted", async () => {
    await expectNoThrow("@/routes/artist-dashboard", {
      [OVERVIEW.join("|")]: full({
        songs: [song({ album: null }), song({ album: { id: "al-1", title: "Yesu ni Nkonto" } })],
        totalSongs: 2,
      }),
    });
  });

  it("renders when songs, albums and payouts all arrive null", async () => {
    await expectNoThrow("@/routes/artist-dashboard", {
      [OVERVIEW.join("|")]: full({ songs: null, albums: null, payouts: null }),
    });
  });

  it("renders when the artist row itself is null", async () => {
    await expectNoThrow("@/routes/artist-dashboard", {
      [OVERVIEW.join("|")]: full({ artist: null }),
    });
  });

  it("renders an artist with no avatar", async () => {
    await expectNoThrow("@/routes/artist-dashboard", {
      [OVERVIEW.join("|")]: full({ artist: artist({ avatar_url: null }) }),
    });
  });
});

describe("artist studio", () => {
  beforeEach(() => setRoles(["user", "artist"]));

  it("renders the upload flow", async () => {
    await expectNoThrow("@/routes/artist-studio");
  });
});

describe("label dashboard", () => {
  beforeEach(() => setRoles(["user", "label"]));

  it("renders for a label owner", async () => {
    await expectNoThrow("@/routes/label-dashboard");
  });
});