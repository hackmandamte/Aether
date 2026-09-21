package app.aether.assistant;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Hosts the Eta web app.
 *
 * Trust model: exactly one https origin is pinned. Only that origin's top frame
 * gets the AetherNative channel and the microphone.
 */
public class MainActivity extends AppCompatActivity {
    public static final String PREFS = "aether";
    public static final String KEY_ORIGIN = "origin";
    private static final String BOOT_URL = "file:///android_asset/boot.html";
    private static final String CHANNEL = "AetherNative";
    private static final int MAX_MESSAGE_CHARS = 4096;
    private static final int REQ_PERMISSIONS = 42;

    private WebView webView;
    private AetherBridge bridge;
    private String pinnedOrigin;
    private String bakedOrigin;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        bridge = new AetherBridge(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        // Geolocation in WebView stays off — location goes through the native bridge only.
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("aether".equals(scheme)) {
                    handleSetupLink(view, uri);
                    return true;
                }
                if ("https".equals(scheme) && pinnedOrigin != null
                        && pinnedOrigin.equals(originOf(uri))) {
                    return false;
                }
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    openInBrowser(uri);
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && pinnedOrigin != null
                        && pinnedOrigin.equals(originOf(request.getUrl()))) {
                    view.loadUrl(BOOT_URL + "?error=1" + (bakedOrigin != null ? "&locked=1" : ""));
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean trusted = pinnedOrigin != null && pinnedOrigin.equals(originOf(request.getOrigin()));
                    List<String> allowed = new ArrayList<>();
                    if (trusted) {
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) allowed.add(r);
                        }
                    }
                    if (allowed.isEmpty()) {
                        request.deny();
                    } else {
                        request.grant(allowed.toArray(new String[0]));
                    }
                });
            }
        });

        bakedOrigin = normalizeOrigin(BuildConfig.SITE_URL);
        pinnedOrigin = bakedOrigin != null
                ? bakedOrigin
                : normalizeOrigin(getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_ORIGIN, ""));
        installBridge();
        requestCorePermissions();
        maybeAskAssistantRole();
        loadDestination();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadDestination();
    }

    private void installBridge() {
        if (pinnedOrigin == null) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Toast.makeText(this,
                    "Update Android System WebView to let Eta control the phone.",
                    Toast.LENGTH_LONG).show();
            return;
        }
        final String origin = pinnedOrigin;
        WebViewCompat.addWebMessageListener(webView, CHANNEL, Collections.singleton(origin),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || !origin.equals(originOf(sourceOrigin))) return;
                    String data = message.getData();
                    if (data == null || data.length() > MAX_MESSAGE_CHARS) return;
                    replyProxy.postMessage(handleBridgeMessage(data));
                });
    }

    private String handleBridgeMessage(String data) {
        String id = "";
        try {
            JSONObject request = new JSONObject(data);
            id = request.optString("id", "");
            if ("config".equals(request.optString("type"))) {
                JSONObject config = AetherBridge.result(true, "config");
                config.put("accessCode", bakedOrigin != null ? BuildConfig.ACCESS_CODE : "");
                return new JSONObject().put("id", id).put("result", config).toString();
            }
            // PhoneAction is nested under "action" as an object with action/value/target/extra
            JSONObject action = request.optJSONObject("action");
            if (action == null && request.has("action") && request.opt("action") instanceof String) {
                // Flat shape: { action: "flashlight_on", value: "…" }
                action = request;
            }
            JSONObject result = action == null
                    ? AetherBridge.result(false, "Bad request")
                    : bridge.execute(action);
            return new JSONObject().put("id", id).put("result", result).toString();
        } catch (Exception e) {
            return "{\"id\":" + JSONObject.quote(id)
                    + ",\"result\":{\"ok\":false,\"native\":true,\"message\":\"error\"}}";
        }
    }

    private void handleSetupLink(WebView view, Uri uri) {
        if (!isBootPage(view.getUrl())) return;
        String action = uri.getHost();
        if ("retry".equals(action)) {
            loadDestination();
            return;
        }
        if (bakedOrigin != null) return;
        if (!"configure".equals(action)) return;

        final String origin = normalizeOrigin(uri.getQueryParameter("origin"));
        if (origin == null) {
            Toast.makeText(this, "Enter a valid https:// link, without a path.", Toast.LENGTH_LONG).show();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Connect to this site?")
                .setMessage(origin + "\n\nThis site will be able to open your dialer and messages, "
                        + "set alarms and timers, change volume and brightness, read location, "
                        + "and press Home, Back and Lock. Only continue if you run it.")
                .setPositiveButton("Connect", (dialog, which) -> {
                    getSharedPreferences(PREFS, MODE_PRIVATE)
                            .edit()
                            .putString(KEY_ORIGIN, origin)
                            .apply();
                    recreate();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void openInBrowser(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private void loadDestination() {
        webView.loadUrl(pinnedOrigin != null ? pinnedOrigin : BOOT_URL);
    }

    private static boolean isBootPage(String url) {
        return url != null && (url.equals(BOOT_URL) || url.startsWith(BOOT_URL + "?"));
    }

    static String originOf(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return null;
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return null;
        int port = uri.getPort();
        return "https://" + host.toLowerCase(Locale.US)
                + (port == -1 || port == 443 ? "" : ":" + port);
    }

    static String normalizeOrigin(String raw) {
        if (raw == null) return null;
        Uri uri;
        try {
            uri = Uri.parse(raw.trim());
        } catch (Exception e) {
            return null;
        }
        if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) return null;
        String path = uri.getPath();
        if (path != null && !path.isEmpty() && !"/".equals(path)) return null;
        return originOf(uri);
    }

    private void requestCorePermissions() {
        List<String> need = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.ACCESS_FINE_LOCATION);
            need.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (!need.isEmpty()) {
            ActivityCompat.requestPermissions(this, need.toArray(new String[0]), REQ_PERMISSIONS);
        }
    }

    private void maybeAskAssistantRole() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        RoleManager rm = getSystemService(RoleManager.class);
        if (rm == null) return;
        if (rm.isRoleAvailable(RoleManager.ROLE_ASSISTANT) && !rm.isRoleHeld(RoleManager.ROLE_ASSISTANT)) {
            try {
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT), 77);
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
