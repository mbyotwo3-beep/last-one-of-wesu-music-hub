package com.wesu.music;

import android.net.Uri;
import android.net.http.SslError;
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
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebViewClient(new WesuWebViewClient(bridge));
        }
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
