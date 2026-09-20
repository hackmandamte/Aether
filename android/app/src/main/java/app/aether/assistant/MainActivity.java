package app.aether.assistant;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.SharedPreferences;
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
 * Hosts the Aether web app.
 *
 * Trust model: exactly one https origin is "pinned" (chosen by the user on the
 * local setup page and confirmed in a native dialog). Only that origin's top
 * frame gets the AetherNative channel and the microphone; every other URL is
 * handed to the system browser or blocked. Nothing outside the app (links,
 * other apps, intents) can change the pinned origin.
 */
public class MainActivity extends AppCompatActivity {
    public static final String PREFS = "aether";
    public static final String KEY_ORIGIN = "origin";
    private static final String BOOT_URL = "file:///android_asset/boot.html";
    private static final String CHANNEL = "AetherNative";
    private static final int MAX_MESSAGE_CHARS = 4096;

    private WebView webView;
    private AetherBridge bridge;
    private String pinnedOrigin;

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
        settings.setAllowFileAccess(false); // file:///android_asset still loads
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
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
                    return false; // stay in the app
                }
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    openInBrowser(uri);
                }
                return true; // file:, intent:, content:, javascript: ... never followed
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && pinnedOrigin != null
                        && pinnedOrigin.equals(originOf(request.getUrl()))) {
                    view.loadUrl(BOOT_URL + "?error=1");
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

        pinnedOrigin = normalizeOrigin(getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_ORIGIN, ""));
        installBridge();
        requestCorePermissions();
        maybeAskAssistantRole();
        loadDestination();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Intents carry no configuration: the origin can only be changed on the setup page.
        loadDestination();
    }

    /** Gives the page a message channel, enforced by WebView to the pinned origin's top frame. */
    private void installBridge() {
        if (pinnedOrigin == null) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Toast.makeText(this,
                    "Update Android System WebView to let Aether control the phone.",
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
            JSONObject action = request.optJSONObject("action");
            JSONObject result = action == null
                    ? AetherBridge.result(false, "Bad request")
                    : bridge.execute(action);
            return new JSONObject().put("id", id).put("result", result).toString();
        } catch (Exception e) {
            return "{\"id\":" + JSONObject.quote(id)
                    + ",\"result\":{\"ok\":false,\"native\":true,\"message\":\"error\"}}";
        }
    }

    /** Only the bundled setup page may (re)configure the origin, and the user must confirm. */
    private void handleSetupLink(WebView view, Uri uri) {
        if (!isBootPage(view.getUrl())) return;
        String action = uri.getHost();
        if ("retry".equals(action)) {
            loadDestination();
            return;
        }
        if (!"configure".equals(action)) return;

        final String origin = normalizeOrigin(uri.getQueryParameter("origin"));
        if (origin == null) {
            Toast.makeText(this, "Enter a valid https:// link, without a path.", Toast.LENGTH_LONG).show();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Connect to this site?")
                .setMessage(origin + "\n\nThis site will be able to open your dialer and messages, "
                        + "set alarms and timers, change volume and brightness, and press "
                        + "Home, Back and Lock. Only continue if you run it.")
                .setPositiveButton("Connect", (dialog, which) -> {
                    getSharedPreferences(PREFS, MODE_PRIVATE)
                            .edit()
                            .putString(KEY_ORIGIN, origin)
                            .apply();
                    recreate(); // fresh WebView with the channel bound to the new origin
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

    /** "https://host[:port]" for any https URI, else null. */
    static String originOf(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return null;
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return null;
        int port = uri.getPort();
        return "https://" + host.toLowerCase(Locale.US)
                + (port == -1 || port == 443 ? "" : ":" + port);
    }

    /** Accepts only a bare https origin (no credentials, path, query or fragment). */
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
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.RECORD_AUDIO}, 42);
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
