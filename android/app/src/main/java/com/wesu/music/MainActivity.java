package com.wesu.music;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The app is a fullscreen shell around the Wesu+ site — there is intentionally
 * no address bar and no raw URL is ever shown to users (Facebook-style).
 *
 * When the main page fails to load (offline, DNS, server down), the system
 * WebView would otherwise render its default "page not available" screen
 * including the failing URL as a visible link. This client intercepts
 * main-frame errors and shows a branded local page instead. The failing URL
 * is kept in memory for retry only and is never displayed.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Local bridge for background-playback priority (WesuPlaybackService).
        // Same package — no import needed. If registration ever fails the JS
        // side degrades to no-service playback (status quo), never a crash.
        try {
            registerPlugin(WesuPlaybackPlugin.class);
        } catch (Exception ignored) {
        }
        // Media (notification/lock-screen) controls need the runtime
        // notification permission on Android 13+. Best-effort: lock-screen
        // transport controls work regardless; the shade player needs the grant.
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebViewClient(new WesuWebViewClient(bridge));
        }
        checkWebViewIsUsable(bridge);
    }

    /**
     * The app IS a web page, so the phone's Android System WebView is the
     * runtime. On cheap and older devices (very common on the Transsion and
     * Samsung lines) that WebView is a leftover build that can no longer be
     * updated from the Play Store — so the app installs fine and then renders
     * a blank shell or crashes on modern syntax. minSdk cannot fix that.
     *
     * Detecting it lets us say something useful instead. The WebView exposes
     * its version as a Chrome major version, so anything below the last
     * version that still supports the bundle we ship is refused up front with
     * a clear instruction to update Android System WebView / Chrome.
     */
    private void checkWebViewIsUsable(Bridge bridge) {
        try {
            if (bridge == null || bridge.getWebView() == null) return;
            // getCurrentWebViewPackage() only exists on API 26+. On Android
            // 7.0/7.1 (our minSdk 24) the call itself throws NoSuchMethodError
            // — an Error, not an Exception — which the old catch missed and
            // crashed the app on launch. Those devices skip the version gate
            // and load normally; if their WebView is too old the normal error
            // page still catches failures.
            if (Build.VERSION.SDK_INT < 26) return;
            String version = android.webkit.WebView.getCurrentWebViewPackage() == null
                    ? null
                    : android.webkit.WebView.getCurrentWebViewPackage().versionName;
            int major = parseChromeMajor(version);
            // 105 is the floor for the CSS/JS features the app bundle relies
            // on (container queries, :has(), nested CSS in the UI kit).
            final int MIN_MAJOR = 105;
            if (major > 0 && major < MIN_MAJOR) {
                bridge.getWebView().loadDataWithBaseURL(
                        null,
                        outdatedWebViewPage(version, MIN_MAJOR),
                        "text/html",
                        "utf-8",
                        null);
            }
        } catch (Throwable ignored) {
            // Never block a launch on the check itself (covers both
            // Exceptions and Errors such as NoSuchMethodError on old runtimes).
        }
    }

    /** "120.0.6099.144" → 120. Returns 0 when the version is unreadable. */
    private static int parseChromeMajor(String versionName) {
        if (versionName == null) return 0;
        int dot = versionName.indexOf('.');
        String head = dot > 0 ? versionName.substring(0, dot) : versionName;
        try {
            return Integer.parseInt(head.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String outdatedWebViewPage(String version, int minMajor) {
        String safeVersion = version == null ? "out of date" : version.replaceAll("[^0-9A-Za-z. ]", "");
        return "<!doctype html><html><head><meta name=\"viewport\" "
                + "content=\"width=device-width,initial-scale=1\"><style>"
                + "body{margin:0;min-height:100vh;display:flex;align-items:center;"
                + "justify-content:center;background:#0b0b0d;color:#fff;"
                + "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;"
                + "text-align:center;padding:24px}"
                + ".c{max-width:22rem}h1{font-size:1.25rem;margin:0 0 12px}"
                + "p{color:#b9b9c2;line-height:1.5;font-size:.95rem;margin:0 0 8px}"
                + "code{background:#1c1c1e;padding:2px 6px;border-radius:6px}"
                + "</style></head><body><div class=\"c\">"
                + "<h1>Please update Android System WebView</h1>"
                + "<p>Wesu+ needs a newer Android System WebView to run. Your phone has "
                + "version <code>"
                + safeVersion
                + "</code>, and we need <code>"
                + minMajor
                + "+</code>.</p>"
                + "<p>Open the Play Store, search for <b>Android System WebView</b> "
                + "(or <b>Chrome</b>), tap <b>Update</b>, then reopen Wesu+.</p>"
                + "<p>Your music and downloads are safe — nothing has been lost.</p>"
                // After updating, the user returns to a page with no way back
                // into the app (this HTML replaced the app URL). Offer reload.
                + "<p><a href=\"https://www.wesuplus.com/\" style=\"display:inline-block;"
                + "margin-top:8px;padding:12px 32px;border-radius:999px;"
                + "background:#f5c518;color:#111;text-decoration:none;"
                + "font-weight:700\">Try again</a></p>"
                + "</div></body></html>";
    }

    /**
     * Spotify-style back behavior: navigate web history when there is any,
     * otherwise send the app to the background INSTEAD of finishing the
     * activity — so music keeps playing and the back button never kills
     * playback. Reopening restores the exact state.
     */
    @Override
    public void onBackPressed() {
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack()) {
            bridge.getWebView().goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    private static class WesuWebViewClient extends BridgeWebViewClient {

        private static final String ERROR_PAGE = "file:///android_asset/error.html";
        private static final String RETRY_SCHEME = "wesuapp";

        /** Last main-frame URL that failed — used for retry, never displayed. */
        private String lastFailedUrl;

        WesuWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request != null && request.isForMainFrame()) {
                showErrorPage(view, request.getUrl().toString());
            } else {
                super.onReceivedError(view, request, error);
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            // Pre-API-23 callback is main-frame only.
            showErrorPage(view, failingUrl);
        }

        @Override
        public void onReceivedHttpError(
                WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            // Server 5xx on the main frame gets the branded page. 4xx passes
            // through: those are real app responses (e.g. a removed page),
            // and retrying them would just loop on the same error.
            if (request != null && request.isForMainFrame()
                    && errorResponse != null && errorResponse.getStatusCode() >= 500) {
                showErrorPage(view, request.getUrl().toString());
            } else {
                super.onReceivedHttpError(view, request, errorResponse);
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // Fail closed (never bypass certificate errors — Play policy),
            // but show the branded page instead of the system interstitial
            // that exposes the URL.
            handler.cancel();
            showErrorPage(view, error != null ? error.getUrl() : null);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            // A successful load clears the retry target — a later unrelated
            // failure must never retry a stale URL.
            if (url != null && !url.equals(ERROR_PAGE)) {
                lastFailedUrl = null;
            }
        }

        /** Show the branded offline page. Never records the page itself as
         *  a retry target (that would loop Try-again on the error page). */
        private void showErrorPage(WebView view, String failingUrl) {
            if (failingUrl != null && !failingUrl.equals(ERROR_PAGE)) {
                lastFailedUrl = failingUrl;
            }
            view.loadUrl(ERROR_PAGE);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && isRetryRequest(request.getUrl())) {
                retry(view);
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (isRetryRequest(url != null ? Uri.parse(url) : null)) {
                retry(view);
                return true;
            }
            return super.shouldOverrideUrlLoading(view, url);
        }

        private boolean isRetryRequest(Uri uri) {
            return uri != null
                    && RETRY_SCHEME.equals(uri.getScheme())
                    && "retry".equals(uri.getHost());
        }

        private void retry(WebView view) {
            if (lastFailedUrl != null) {
                view.loadUrl(lastFailedUrl);
            } else {
                view.reload();
            }
        }
    }
}
