package com.wesu.music;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
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
                lastFailedUrl = request.getUrl().toString();
                view.loadUrl(ERROR_PAGE);
            } else {
                super.onReceivedError(view, request, error);
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            // Pre-API-23 callback is main-frame only.
            lastFailedUrl = failingUrl;
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
