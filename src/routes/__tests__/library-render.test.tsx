/**
 * Render /library and find what actually throws.
 *
 * WHY A RENDER TEST AND NOT MORE READING
 *
 * This page has been reported broken repeatedly. Every earlier attempt read the
 * code, produced a confident explanation, and was wrong:
 *
 *   - "no loader, so it is a render throw"   (true, and useless alone)
 *   - "all four queries are guarded"          (true, and the bug was elsewhere)
 *   - "no unguarded nested property access"   (true, and the bug was elsewhere)
 *   - "the explicit throw is in a mutation"   (true, and the bug was elsewhere)
 *
 * Each was a correct statement about the code and a wrong conclusion about the
 * bug. Reading keeps producing true facts that do not locate the fault.
 *
 * renderToStaticMarkup EXECUTES the component. Whatever throws, throws — here,
 * in a second, with a stack trace, instead of on a listener's phone.
 *
 * WHY ANONYMOUS SSR WAS NOT ENOUGH
 *
 * /library renders fine for a signed-out visitor: 200, real content. Every
 * report comes from a SIGNED-IN listener with data. So these cases drive the
 * signed-in shape.
 *
 * The cases are adversarial on purpose. PostgREST returns a to-many relation as
 * an ARRAY and a to-one as an OBJECT, and an embedded row is null whenever the
 * referenced record was deleted. Anything assuming otherwise throws exactly
 * once a listener has real, messy data — which is what the catalogue will look
 * like after a year of uploads and deletions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

// ---------------------------------------------------------------- fixtures

const USER = { id: "u-1", email: "listener@example.com" };

const song = (over: Record<string, unknown> = {}) => ({
  id: "s-1",
  title: "Chooba",
  cover_url: "cover.jpg",
  duration: 214,
  price: 10,
  album_id: "al-1",
  artists: { id: "ar-1", name: "Nelson K" },
  ...over,
});

const album = (over: Record<string, unknown> = {}) => ({
  id: "al-1",
  title: "Yesu ni Nkonto",
  cover_url: "album.jpg",
  price: 150,
  artist: { id: "ar-1", name: "Gospel Sowers" },
  ...over,
});

const artist = (over: Record<string, unknown> = {}) => ({
  id: "ar-1",
  name: "Gospel Sowers",
  avatar_url: "a.jpg",
  ...over,
});

// ---------------------------------------------------------------- mocks

const state: Record<string, unknown[]> = {
  "library:liked": [],
  "library:purchased": [],
  "library:purchased-albums": [],
  "library:followed-artists": [],
  "library:my-playlists": [],
  "library:followed-playlists": [],
};

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: USER, loading: false }) }));

vi.mock("@/hooks/use-offline-list", () => ({
  useOfflineList: (key: string) => ({
    data: (state as any)[key] ?? [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
}));

vi.mock("@/hooks/use-saved-track", () => ({
  useSavedTrack: () => ({ isSaved: false, toggle: () => {} }),
}));
vi.mock("@/stores/player", () => ({
  usePlayer: (sel?: (s: unknown) => unknown) => {
    const s = {
      playing: false,
      track: { id: "s-1" },
      togglePlay: () => {},
      setQueue: () => {},
      queue: [],
      progressSeconds: 0,
    };
    return typeof sel === "function" ? sel(s) : s;
  },
}));

// Spread the real module and override only what needs a browser/server context.
// A bare `{ useServerFn }` broke every transitively imported *.functions.ts,
// which needs createMiddleware — the first run failed all 10 cases with
// 'No "createMiddleware" export' and that was the harness, not the page.
vi.mock("@tanstack/react-start", async (orig) => {
  const actual = await orig<any>();
  return { ...actual, useServerFn: () => async () => [] };
});
// Browser-only primitives, stubbed at the lowest layer so the real components
// above them still execute.
vi.mock("@/lib/storage", () => ({ uploadFileToBucket: async () => ({}) }));
vi.mock("@/lib/offline-vault", () => ({
  listVaultTracks: async () => [],
  planEviction: () => ({}),
  deleteVaultTrack: async () => {},
  readVaultTrack: async () => null,
  hasVaultTrack: async () => false,
  getVaultKey: async () => null,
  vaultIdCache: new Map(),
}));
vi.mock("@/lib/vault-index", () => ({ vaultIndex: new Set() }));
vi.mock("@/lib/follow.functions", () => ({
  getFollowerCount: async () => ({ count: 0 }),
  getFollowState: async () => ({ following: false }),
  toggleFollow: async () => ({ ok: true }),
}));
// Spread the real module: DownloadButton needs getDownloadAudioUrl from here,
// and stubbing the module wholesale broke the render instead of the page.
vi.mock("@/lib/listener.functions", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    listFollowedPlaylists: async () => [],
    getDownloadAudioUrl: async () => ({ url: "https://example.invalid/a.mp3", expiresIn: 900 }),
  };
});
vi.mock("@/hooks/use-song-entitlement", () => ({
  useSongEntitlement: () => ({ entitled: true, isFree: false, loading: false }),
}));
vi.mock("@/hooks/use-platform", () => ({
  useIsNative: () => false,
  useIsMobile: () => true,
}));
vi.mock("@/stores/offline-mode", () => ({
  useOfflineMode: () => ({ isOffline: false, online: true }),
}));
vi.mock("@/hooks/use-roles", () => ({
  useUserRoles: () => ({
    roles: ["user"],
    loading: false,
    checked: true,
    failed: false,
    isUser: true,
    isArtist: false,
    isAdmin: false,
    isSuperAdmin: false,
    isLabel: false,
  }),
}));
vi.mock("@/components/RoleGate", () => ({ RoleGate: ({ children }: any) => children }));
vi.mock("@/components/PlaylistCover", () => ({ PlaylistCover: () => null }));
vi.mock("@/components/ShareMenu", () => ({ ShareMenu: () => null }));
// StorageImage, DownloadButton and especially DownloadsSection are deliberately
// NOT mocked.
//
// The first version of this file stubbed all three out, and that hid the most
// suspicious thing on the page: DownloadsSection is the offline vault UI, it was
// written for the recent offline work, and /library deep-links to it with
// #downloads. A throw inside it takes the whole page down and this test would
// have reported the page as healthy.
//
// Components that need a browser are stubbed at the lowest layer instead — see
// the storage and vault mocks below.
vi.mock("@/components/IncrementalList", () => ({
  IncrementalList: ({ items, children, renderItem }: any) => {
    const list = Array.isArray(items) ? items : [];
    if (typeof renderItem === "function") return createElement("div", null, list.map(renderItem));
    if (typeof children === "function") return createElement("div", null, list.map(children));
    return createElement("div", null, children ?? null);
  },
}));
vi.mock("sonner", () => ({
  toast: { error: () => {}, success: () => {}, info: () => {} },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
    }),
  },
}));

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    Link: ({ children, to, ...rest }: any) =>
      createElement("a", { href: to ?? "#", ...rest }, children),
    useNavigate: () => () => {},
    useRouterState: () => ({ pathname: "/library", searchStr: "" }),
  };
});

beforeEach(() => {
  for (const k of Object.keys(state)) state[k] = [];
});

async function renderLibrary() {
  const mod: any = await import("@/routes/library");
  // The page uses useQuery/useMutation directly, so it needs a real client. The
  // first run failed every case with "No QueryClient set", which says nothing
  // about the page — it is the harness missing.
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(mod.Page)),
  );
}

// ---------------------------------------------------------------- cases

describe("/library renders for a signed-in listener", () => {
  it("renders with an empty library", async () => {
    await expect(renderLibrary()).resolves.toContain("Library");
  });

  it("renders with a full library", async () => {
    state["library:liked"] = [song()];
    state["library:purchased"] = [song({ id: "s-2", title: "Nimfwa" })];
    state["library:purchased-albums"] = [album()];
    state["library:followed-artists"] = [artist()];
    state["library:my-playlists"] = [{ id: "p-1", name: "Favourites", playlist_songs: [] }];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles the artist relation arriving as a one-element ARRAY", async () => {
    // to-many relations come back as arrays. The code unwraps songs and artists
    // defensively elsewhere; this proves it for the artist too.
    state["library:liked"] = [song({ artists: [{ id: "ar-1", name: "Nelson K" }] })];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles a null embedded song from a deleted record", async () => {
    state["library:liked"] = [song(), null, undefined];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles a purchase whose song row was deleted", async () => {
    state["library:purchased"] = [null, song()];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles a followed artist that no longer exists", async () => {
    state["library:followed-artists"] = [null, artist()];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles a playlist with null embedded songs", async () => {
    state["library:my-playlists"] = [
      {
        id: "p-1",
        name: "Favourites",
        playlist_songs: [null, { position: 1, song: null }, { position: 0, song: song() }],
      },
    ];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles the album relation as an array", async () => {
    state["library:liked"] = [song({ album: [{ id: "al-1", title: "Yesu ni Nkonto" }] })];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles missing cover art, title and price", async () => {
    state["library:liked"] = [{ id: "s-9" }];
    state["library:purchased-albums"] = [{ id: "al-9" }];
    state["library:followed-artists"] = [{ id: "ar-9" }];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });

  it("handles a playlist where every song is null", async () => {
    state["library:my-playlists"] = [
      { id: "p-2", name: "Empty", playlist_songs: [{ position: 0, song: null }] },
    ];
    await expect(renderLibrary()).resolves.toBeTruthy();
  });
});