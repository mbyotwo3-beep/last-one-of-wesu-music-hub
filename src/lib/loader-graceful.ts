/**
 * Why a route loader must not hard-fail offline.
 *
 * THE BUG THIS PREVENTS
 *
 * The app is an SSR WebView with a cached shell (public/sw.js). With the data
 * off, the shell loads, React boots, and TanStack Start runs the route loaders
 * to hydrate. Those loaders call server functions, which need the network.
 *
 * Three of them had no `.catch`, so offline they threw:
 *
 *   /browse          seven shelves, main navigation tab -> error screen
 *   /albums          the albums grid -> error screen
 *   /artists         the artists grid -> error screen
 *   /albums/$id      worse than an error: it threw notFound(), so a PAID-FOR
 *                    album told the listener "Album not found" — telling them
 *                    their purchase had vanished, because they lost signal
 *
 * Every one of those routes already reads its data through useOfflineList,
 * which renders the last snapshot when a query fails while offline. So the
 * component had an offline path that the loader was destroying one level above
 * it. The fix was to let the loader fail softly and let that path do its job.
 *
 * This is why the earlier decision to let loader failures surface was right then
 * and is wrong now. It was made when the app could not boot offline at all, so
 * "a failure surfaces" meant "the visitor sees an error instead of a silently
 * empty page" — correct, because there was no alternative. Once the shell
 * caches, a silent snapshot is strictly better than an error: the listener sees
 * their music, correctly labelled as cached, instead of being told it is gone.
 *
 * WHAT SURFACES INSTEAD
 *
 * Not everything is hidden. routeErrorComponent() still renders for a genuine
 * failure that is NOT connectivity — a malformed uuid, a missing record while
 * online. Only the network case is softened.
 */

/**
 * Whether a thrown value is a router control-flow signal (notFound/redirect)
 * rather than a failure. These are thrown by the framework on purpose and must
 * always propagate — swallowing one turns "this album does not exist" into
 * "you are offline".
 */
export function isRedirect(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { isNotFound?: unknown; routerCode?: unknown; to?: unknown; href?: unknown };
  return e.isNotFound === true || typeof e.to === "string" || typeof e.href === "string";
}

/**
 * Whether a failure is "no network", as opposed to a genuine server error.
 *
 * Deliberately conservative: when in doubt it returns false, so a real failure
 * still surfaces. A false positive here means showing a stale page instead of an
 * error — recoverable. A false negative means claiming a paid-for album does not
 * exist, which is not.
 *
 * The browser's own signal is the primary check because a server function called
 * over `fetch` reports a connection failure as a TypeError with no useful code.
 * The message patterns cover the cases where navigator.onLine is wrong: captive
 * portals and some WebViews report themselves online with no route out.
 */
export function isOfflineTransportFailure(err: unknown): boolean {
  // A notFound()/redirect is never a network problem.
  if (isRedirect(err)) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  const message = err instanceof Error ? err.message : String(err ?? "");
  const name = err instanceof Error ? err.name : "";

  if (name === "AbortError") return false;

  return /failed to fetch|network( |-)?error|load failed|net::|err_internet_disconnected|err_network|offline/i.test(
    message,
  );
}

/**
 * Run loader work, tolerating connectivity failure.
 *
 * Deliberately narrow: a non-network rejection still throws, so real bugs are
 * not masked. Used only where the component already has a snapshot fallback and
 * therefore nothing is lost by continuing.
 */
export async function loaderGraceful<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch {
    // The component re-renders from its offline snapshot. Swallowing here only
    // prevents the router replacing the whole page with an error boundary.
    return fallback;
  }
}

/**
 * Same, for several concurrent loader fetches of DIFFERENT types.
 *
 * Deliberately not generic over the element type. An earlier version was
 * `Promise<T>[]`, which TypeScript happily collapsed to a single inferred type,
 * so /browse's seven shelves — albums, trending tracks, artists, playlists,
 * genres — all had to be assignable to whichever type came first. They are not,
 * and the build caught it. The result type is void because no caller uses it.
 */
export async function loaderGracefulAll(works: ReadonlyArray<Promise<unknown>>): Promise<void> {
  await Promise.all(
    works.map((w) =>
      w.catch(() => {
        /* the component re-renders from its offline snapshot */
      }),
    ),
  );
}
