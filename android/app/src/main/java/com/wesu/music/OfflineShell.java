package com.wesu.music;

import android.content.Context;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.Map;

/**
 * The app shell, resolved here instead of by the WebView's service worker.
 *
 * WHY THIS EXISTS — the real reason offline never worked
 *
 * Capacitor's WebViewLocalServer classifies https://www.wesuplus.com/ as "the main
 * URL" and answers every request itself:
 *
 *     BridgeWebViewClient.shouldInterceptRequest
 *       -> WebViewLocalServer.shouldInterceptRequest
 *          -> isMainUrl(url)  ->  handleProxyRequest
 *
 * handleProxyRequest opens its OWN HttpURLConnection. That happens before the
 * WebView's service-worker machinery is consulted, so public/sw.js could register,
 * report that it controls the page, and still never serve a single navigation.
 * Adding ServiceWorkerController (the fix shipped in vc32) does not help: the
 * request never gets far enough to reach it.
 *
 * So the worker was never the mechanism. This is.
 *
 * THE STRATEGY: network first, cache as the fallback
 *
 * Cache-first would be wrong and quietly worse: the app is a shell around the
 * live site, so a listener with a connection must always get the current site,
 * and every web fix must reach installed apps with no rebuild. A stale cache
 * would silently freeze the app on whatever it saw on install day.
 *
 * So each document request tries the network first and falls back to the last
 * good copy only when that fails. That is the same order public/sw.js uses.
 *
 * WHAT IS EVER SERVED FROM CACHE
 *
 *   /assets/*, images, fonts, .js, .css   from the APK's own assets
 *       These filenames carry a content hash, so a bundled copy is always
 *       correct and can never be stale.
 *
 *   HTML documents                       the last response that worked
 *       Real SSR output, so hydration matches. Saved per path, because
 *       /library and /downloads are different screens.
 *
 * NEVER SERVED FROM ANY CACHE
 *
 *   /_serverFn (server-function RPCs), /api, Supabase, storage, Lenco, audio.
 *       Purchase state must never come from a cache, and a cached signed-audio
 *       URL is a dead stream. These go to the network and fail offline exactly
 *       as they should, which is what the offline UI is built to explain.
 *       (vc40: RPCs also must never be RELABELED — see isVolatile.)
 *
 * The listener's own data — library, likes, playlists — is not here at all. That
 * lives in the encrypted IndexedDB vault inside the app, untouched by this class.
 *
 * THREADING
 *
 * WebView calls shouldInterceptRequest on a background thread, not the UI thread,
 * which is why blocking HTTP here is permitted — and is exactly what Capacitor's
 * own handleProxyRequest does. Every failure path returns null so the normal
 * network route still runs.
 */
final class OfflineShell {

    private OfflineShell() {
    }

    private static final String APP_HOST = "www.wesuplus.com";
    private static final int TIMEOUT_MS = 20000;

    /** Cap on a saved document, so one enormous page cannot eat app storage. */
    private static final int MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

    // ---------------------------------------------------------------- wiring

    /**
     * Holds the application context for the static helpers.
     *
     * The WebViewClient is static because Capacitor constructs it, so it has no
     * Activity to ask. Holding an Activity in a static field leaks it, so
     * getApplicationContext() is stored instead — set once in onCreate, and the
     * one place that mistake would surface.
     */
    static final class AppContextHolder {
        private static Context ctx;

        private AppContextHolder() {
        }

        static void set(Context c) {
            if (c != null) ctx = c.getApplicationContext();
        }

        static Context ctx() {
            return ctx;
        }
    }

    // ------------------------------------------------------------- decisions

    /**
     * Requests that must always go to the network.
     *
     * A cached purchase result would be a lie the user pays for; a cached signed
     * audio URL points at an expired signature and stalls on silence.
     */
    private static boolean isVolatile(String url) {
        String u = url.toLowerCase(java.util.Locale.ROOT);
        // /_serverFn/ is a TanStack server function: a per-user JSON answer whose
        // client contract includes its content type. Until vc40 these GETs fell
        // through to isDocument(), were fetched here, and were served back
        // relabeled as text/html — the page saw valid JSON bytes behind a lying
        // header, parsed nothing, and Browse/Search in the installed app drew
        // honest error states for data that was in fact on the wire. RPCs are
        // data, not documents: they go to the WebView's own network path, always.
        return u.contains("/_serverfn/")
                || u.contains("/api/")
                || u.contains("supabase.co")
                || u.contains("lenco")
                || u.contains("/storage/v1/")
                || u.contains("rest/v1/")
                || u.matches("(?s).*\\.(mp3|m4a|aac|ogg|wav|opus|flac)(\\?.*)?$");
    }

    /**
     * Content-addressed files that ship inside the APK.
     *
     * The build copies public/ and the client bundle into the APK's assets, and
     * Vite hashes every asset filename. A bundled file therefore cannot be stale,
     * so it is always safe to answer from disk with no network.
     */
    private static boolean isImmutableAsset(String url) {
        String path = urlPath(url);
        if (path.startsWith("/assets/")) return true;
        // /favicon.ico, /manifest.webmanifest and friends are also copied in.
        return path.matches("(?s).*\\.(js|mjs|css|woff2?|png|jpg|jpeg|webp|svg|ico|webmanifest)(\\?.*)?$");
    }

    /** True when this looks like a page rather than an asset or an XHR. */
    private static boolean isDocument(String url) {
        String u = url.toLowerCase(java.util.Locale.ROOT);
        if (isImmutableAsset(url) || isVolatile(url)) return false;
        // Vercel sends ?_routes for RSC payloads, and ?_root for the root route.
        return !u.contains("?_routes") && !u.contains("&_routes") && !u.contains("?_root");
    }

    private static String urlPath(String url) {
        String path = url;
        int scheme = path.indexOf("://");
        if (scheme >= 0) {
            int slash = path.indexOf('/', scheme + 3);
            path = slash >= 0 ? path.substring(slash) : "/";
        }
        int cut = path.length();
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            if (c == '?' || c == '#') {
                cut = i;
                break;
            }
        }
        return path.substring(0, cut);
    }

    private static boolean isOurs(String url) {
        return url != null && url.contains(APP_HOST);
    }

    // ------------------------------------------------------------- resolution

    /**
     * Resolve one request. Returns null to mean "use the normal network path",
     * which is what every unexpected case does.
     */
    static WebResourceResponse resolve(String url, Map<String, String> requestHeaders) {
        if (!isOurs(url) || isVolatile(url)) return null;
        Context ctx = AppContextHolder.ctx();
        if (ctx == null) return null;
        try {
            if (isImmutableAsset(url)) return serveAsset(ctx, url);
            if (isDocument(url)) return serveDocument(ctx, url, requestHeaders);
            return null;
        } catch (Throwable ignored) {
            return null;
        }
    }

    /**
     * A document: try the live site, fall back to the last copy that worked.
     */
    private static WebResourceResponse serveDocument(
            Context ctx, String url, Map<String, String> requestHeaders) {
        try {
            Fetched fresh = fetch(url, requestHeaders);
            if (fresh != null && fresh.body.length > 0) {
                String mime = mimeOf(fresh.contentType);
                if (mime.isEmpty() || mime.equals("text/html")) {
                    // A real HTML document — what this path exists for. Saved as
                    // the offline fallback for exactly this route.
                    save(ctx, url, fresh.body);
                    return html(fresh.body);
                }
                // A 2xx that is NOT HTML: serve it as what it actually is, and
                // never cache it. Relabeling foreign bytes as text/html corrupts
                // the page's parser (valid body, lying header — the vc39
                // /_serverFn bug's exact shape). isVolatile now keeps RPCs off
                // this path entirely; this branch is the last line of defense
                // for anything else that might ever be misclassified.
                return new WebResourceResponse(
                        mime, "utf-8", 200, "OK", noStore(), new ByteArrayInputStream(fresh.body));
            }
        } catch (Throwable ignored) {
            // Offline, DNS failure, timeout — all the same: try the cache.
        }
        return serveCachedDocument(ctx, url);
    }

    /** A network answer: the body bytes and the content type they were served as. */
    private static final class Fetched {
        final byte[] body;
        final String contentType;

        Fetched(byte[] body, String contentType) {
            this.body = body;
            this.contentType = contentType;
        }
    }

    /**
     * Fetch over the network, mirroring the request's own headers.
     *
     * The Cookie header is forwarded on purpose. Without it the server would
     * render the ANONYMOUS shell while the client boots signed in, and React
     * hydration would tear the page down and rebuild it.
     */
    private static Fetched fetch(String url, Map<String, String> requestHeaders) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            if (requestHeaders != null) {
                for (Map.Entry<String, String> e : requestHeaders.entrySet()) {
                    String key = e.getKey();
                    String val = e.getValue();
                    if (key == null || val == null) continue;
                    String lower = key.toLowerCase(java.util.Locale.ROOT);
                    // Let the connection manage its own length and encoding.
                    if ("content-length".equals(lower) || "accept-encoding".equals(lower)) continue;
                    if ("sec-fetch-dest".equals(lower)) continue;
                    conn.setRequestProperty(key, val);
                }
            }
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestMethod("GET");

            int status = conn.getResponseCode();
            if (status < 200 || status >= 400) return null;

            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            InputStream in = conn.getInputStream();
            try {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_DOCUMENT_BYTES) return null;
                }
            } finally {
                in.close();
            }
            // The content type must be captured before disconnect — it decides
            // whether serveDocument may label these bytes text/html.
            return new Fetched(out.toByteArray(), conn.getContentType());
        } finally {
            conn.disconnect();
        }
    }

    /**
     * The last copy that worked, falling back to the root shell for a deep link
     * this device has never visited. The client-side router then restores the
     * intended route, so /library opens as /library and not as a dead end.
     */
    /**
     * The last copy of THIS page that worked, or the first-run page. Never another
     * route's copy.
     *
     * WHY NOT THE ROOT SHELL AS A FALLBACK
     *
     * vc34 fell back to the cached "/" document for any uncached path, which
     * looked generous and was the source of a bug that only the Android app could
     * produce. A browser never hits this path — it uses public/sw.js — so no
     * amount of browser testing would have found it.
     *
     * Serving "/" for "/library" hands the client markup for the homepage AND the
     * homepage's inline hydration payload, while location.pathname says
     * "/library". TanStack Router then hydrates one route against another's data,
     * React discards the markup, and the listener lands on the route error
     * boundary: "This page didn't load" — on the library, with a player bar still
     * running.
     *
     * Correct markup for the wrong URL is worse than no markup: it produces a
     * confident, wrong page. So an unsaved route gets the offline page, which
     * says plainly that it has not been saved on this phone yet and offers a
     * retry.
     */
    private static WebResourceResponse serveCachedDocument(Context ctx, String url) {
        try {
            String path = urlPath(url);
            boolean isRoot = path.isEmpty() || "/".equals(path);
            if (isRoot) {
                File root = new File(cacheDir(ctx), cacheName("https://" + APP_HOST + "/"));
                if (root.exists() && root.length() > 0) {
                    return new WebResourceResponse(
                            "text/html", "utf-8", 200, "OK", noStore(), new FileInputStream(root));
                }
            } else {
                File exact = new File(cacheDir(ctx), cacheName(url));
                if (exact.exists() && exact.length() > 0) {
                    return new WebResourceResponse(
                            "text/html", "utf-8", 200, "OK", noStore(), new FileInputStream(exact));
                }
            }

            // Nothing saved for this path. Say so plainly instead of serving a
            // different page's HTML under this URL.
            InputStream in = ctx.getAssets().open("error.html");
            if (in != null) {
                return new WebResourceResponse("text/html", "utf-8", 200, "OK", noStore(), in);
            }
            return null;
        } catch (Throwable ignored) {
            try {
                InputStream in = ctx.getAssets().open("error.html");
                if (in != null) {
                    return new WebResourceResponse("text/html", "utf-8", 200, "OK", noStore(), in);
                }
            } catch (Throwable ignored2) {
                // Nothing survivable: let the normal network path run.
            }
            return null;
        }
    }

    /**
     * A content-hashed file from the APK's own assets.
     *
     * If it is not bundled, null is returned rather than an error, so a file that
     * only ever existed on the server still loads from the network.
     */
    private static WebResourceResponse serveAsset(Context ctx, String url) {
        try {
            InputStream in = openAsset(ctx, url);
            if (in == null) return null;
            return new WebResourceResponse(mimeFor(url), "utf-8", 200, "OK", noStore(), in);
        } catch (Throwable ignored) {
            return null;
        }
    }

    // ----------------------------------------------------------------- storage

    /** Save a document that just came back from the network. */
    static void save(Context ctx, String url, byte[] body) {
        if (ctx == null || body == null || body.length == 0) return;
        if (isVolatile(url) || !isOurs(url)) return;
        if (body.length > MAX_DOCUMENT_BYTES) return;
        try {
            File dir = cacheDir(ctx);
            File tmp = new File(dir, cacheName(url) + ".tmp");
            java.io.FileOutputStream fos = new java.io.FileOutputStream(tmp);
            try {
                fos.write(body);
                fos.flush();
                fos.getFD().sync();
            } finally {
                fos.close();
            }
            File out = new File(dir, cacheName(url));
            if (out.exists() && !out.delete()) {
                tmp.delete();
                return;
            }
            if (!tmp.renameTo(out)) tmp.delete();
        } catch (Throwable ignored) {
            // Best effort. A missing entry only costs offline help, nothing else.
        }
    }

    /** True if at least one document has been saved on this device. */
    static boolean hasAny(Context ctx) {
        if (ctx == null) return false;
        String[] files = ctx.getCacheDir().list();
        return files != null;
    }

    private static File cacheDir(Context ctx) {
        File dir = new File(ctx.getCacheDir(), "wesu-shell");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /**
     * A flat, collision-free, always-safe filename for a URL path.
     *
     * Flattening is lossy: "/a/b" and "/a_b" both become "_a_b", and "/a?b" and
     * "/a.b" both become "_a_b". Serving one screen's HTML for another is a
     * confusing, hard-to-report bug, so the readable part is kept for the eye and
     * a hash of the FULL path is always appended to guarantee uniqueness.
     *
     * The gate found this by running the real method, not by reading it: the hash
     * was originally only applied to names over 100 characters, which is exactly
     * the case where a collision is least likely.
     */
    private static String cacheName(String url) {
        String path = urlPath(url);
        if (path.isEmpty() || "/".equals(path)) path = "/__root__";
        StringBuilder sb = new StringBuilder(path.length());
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            sb.append(Character.isLetterOrDigit(c) || c == '-' || c == '_' || c == '.' ? c : '_');
        }
        String readable = sb.toString();
        if (readable.length() > 100) readable = readable.substring(0, 100);

        int h = 0;
        for (int i = 0; i < path.length(); i++) h = (h * 31 + path.charAt(i)) | 0;
        return readable + "-" + Integer.toHexString(h);
    }

    // ------------------------------------------------------------------ utils

    /** "application/json; charset=utf-8" → "application/json" ("" when absent). */
    private static String mimeOf(String contentType) {
        if (contentType == null) return "";
        return contentType.split(";", 2)[0].trim().toLowerCase(java.util.Locale.ROOT);
    }

    private static WebResourceResponse html(byte[] body) {
        return new WebResourceResponse(
                "text/html", "utf-8", 200, "OK", noStore(), new ByteArrayInputStream(body));
    }

    /**
     * The WebView must not reuse a served response for a later online request,
     * or a listener would keep seeing the offline shell after reconnecting.
     */
    private static Map<String, String> noStore() {
        return Collections.singletonMap("Cache-Control", "no-store");
    }

    private static InputStream openAsset(Context ctx, String url) throws Exception {
        String path = urlPath(url);
        if (path.isEmpty() || path.equals("/")) return null;
        if (path.startsWith("/")) path = path.substring(1);
        // Only names that cannot escape the assets directory.
        if (path.contains("..")) return null;
        return ctx.getAssets().open("public/client/" + path);
    }

    private static String mimeFor(String url) {
        String p = urlPath(url).toLowerCase(java.util.Locale.ROOT);
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".html")) return "text/html";
        return "application/octet-stream";
    }
}