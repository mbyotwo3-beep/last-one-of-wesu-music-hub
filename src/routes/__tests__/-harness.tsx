import { vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Shared harness for rendering role-gated pages outside a browser.
 *
 * WHY
 *
 * Three real bugs here were found by rendering a page, not reading it: the
 * /library null dereference, the artists lockout, the offline shell hydrating the
 * wrong route. Reading produced a true statement that did not locate the fault
 * every time.
 *
 * THE RULE THAT MADE THIS NECESSARY
 *
 * vi.mock is HOISTED to the top of the file it appears in. Calling it from
 * inside a helper, after the test module has already been imported, registers
 * nothing — so a first version of the role-workflow test failed all nine cases
 * with the real modules in place, which looked exactly like nine broken pages.
 *
 * So the mocks below live here and are imported for their side effect, and the
 * per-test variation goes through STATE, which the factories read at call time.
 *
 * THE RULE ABOUT WHAT NOT TO MOCK
 *
 * Mock the leaf that needs a browser or a server. Never a page's own children:
 * the first version of the library test stubbed DownloadsSection away, hiding the
 * most suspicious thing on the page, and would have reported a broken page as
 * healthy.
 */

/** Per-test state the mocked hooks read. Not exported: a vi.hoisted value cannot be. */
const STATE = vi.hoisted(() => ({
  roles: ["user"] as string[],
  user: { id: "u-1", email: "listener@example.com" } as Record<string, unknown> | null,
  lists: {} as Record<string, unknown[]>,
  server: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: STATE.user, loading: false, signOut: async () => {} }),
}));

vi.mock("@/hooks/use-roles", () => ({
  useUserRoles: () => ({
    roles: STATE.roles,
    loading: false,
    checked: true,
    failed: false,
    isUser: true,
    isArtist: STATE.roles.includes("artist"),
    isAdmin: STATE.roles.includes("admin") || STATE.roles.includes("superadmin"),
    isSuperAdmin: STATE.roles.includes("superadmin"),
    isLabel: STATE.roles.includes("label"),
    isStaff: STATE.roles.includes("admin") || STATE.roles.includes("superadmin"),
  }),
}));

vi.mock("@/hooks/use-offline-list", () => ({
  useOfflineList: (key: string) => ({
    data: STATE.lists[key] ?? [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  }),
}));

vi.mock("@/stores/player", () => ({
  usePlayer: (sel?: (s: unknown) => unknown) => {
    const s = {
      playing: false,
      track: null,
      queue: [],
      progressSeconds: 0,
      togglePlay: () => {},
      setQueue: () => {},
      shuffle: false,
      toggleShuffle: () => {},
    };
    return typeof sel === "function" ? sel(s) : s;
  },
}));

vi.mock("@/stores/currency", () => ({ useCurrency: () => ({ currency: "ZMW" }) }));
vi.mock("@/stores/offline-mode", () => ({ useOfflineMode: () => ({ isOffline: false }) }));
vi.mock("@/hooks/use-platform", () => ({
  useIsNative: () => false,
  useIsMobile: () => true,
}));
vi.mock("@/hooks/use-saved-track", () => ({
  useSavedTrack: () => ({ isSaved: false, toggle: () => {} }),
}));
vi.mock("@/hooks/use-song-entitlement", () => ({
  useSongEntitlement: () => ({ entitled: true, isFree: false, loading: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: () => {}, success: () => {}, info: () => {}, message: () => {} },
}));

// Spread the real module: a wholesale stub broke every transitively imported
// *.functions.ts, which needs createMiddleware.
vi.mock("@tanstack/react-start", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    useServerFn: (fn: unknown) => async () => {
      const key = Object.keys(STATE.server).find((k) => String(fn).includes(k));
      return key ? STATE.server[key] : [];
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              single: () => Promise.resolve({ data: null, error: null }),
            }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          order: () => Promise.resolve({ data: [], error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    Link: ({ children, to, href, ...rest }: any) =>
      createElement("a", { href: to ?? href ?? "#", ...rest }, children),
    useNavigate: () => () => {},
    useRouterState: (opts?: any) => {
      const state = { location: { pathname: "/", searchStr: "" } };
      return typeof opts?.select === "function" ? opts.select(state) : state;
    },
    useSearch: () => ({}),
    useParams: () => ({}),
    useMatchRoute: () => false,
  };
});

/** Reset per-test state. Roles default to a plain listener. */
export function setRoles(roles: string[], server: Record<string, unknown> = {}) {
  STATE.roles = roles;
  STATE.server = server;
  STATE.lists = {};
  installBrowserGlobals();
}

/**
 * The smallest browser surface the router and the player actually touch.
 *
 * The test environment is `node`, and TanStack Router's scroll restoration reads
 * sessionStorage at module scope. Without this, four cases failed with
 * "sessionStorage is not defined" — which reads like four broken pages and was
 * entirely the harness.
 *
 * Defensive on every value: a page that assigns to storage should not crash the
 * test, and a page that reads something absent gets undefined, not a throw.
 */
export function installBrowserGlobals() {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      length: 0,
    };
  };
  const g = globalThis as any;
  if (!g.sessionStorage) g.sessionStorage = store();
  if (!g.localStorage) g.localStorage = store();
  if (!g.window) g.window = g;
  if (typeof g.matchMedia !== "function") {
    g.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    });
  }
}

/**
 * Render an exported component with a real QueryClient around it.
 *
 * `prime` seeds the cache BEFORE the render, which is the only way to reach a
 * page's data path from a synchronous server render.
 *
 * Without it these tests were decorative. useQuery does not resolve during
 * renderToStaticMarkup, so `data` was undefined, the page returned its loading
 * state, and removing the null-artist guard from artist-dashboard left all twelve
 * cases green — the test could not have caught the bug it claimed to guard. That
 * was found by deliberately breaking the page and watching nothing happen, which
 * is the only reason it was found at all.
 */
export async function renderPage(component: any, prime?: Record<string, unknown>) {
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  for (const [key, value] of Object.entries(prime ?? {})) {
    // React Query keys are arrays. A joined string is a DIFFERENT key, so the
    // seed silently missed and the page rendered its loading state again —
    // which made the whole suite decorative until a deliberate break exposed it.
    const realKey: any = key.includes("|") ? key.split("|") : [key];
    qc.setQueryData(realKey, value as any);
  }
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc }, createElement(component)),
  );
}

/** Import a route module and return its exported page component. */
export async function pageComponent(modulePath: string) {
  const mod: any = await import(modulePath);
  return mod.Page ?? mod.default ?? mod.Route?.options?.component ?? null;
}