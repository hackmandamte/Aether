package app.aether.assistant;

import android.app.Notification;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Floating bubble + command panel over any app.
 * E.T.A — Everyday Task Assistant (spoken name: Eta).
 * Overlay is native-only (no remote WebView) — reduces UI redress risk.
 */
public class EtaOverlayService extends Service {
    public static final String ACTION_SHOW_PANEL = "app.aether.assistant.SHOW_PANEL";
    public static final String ACTION_STOP = "app.aether.assistant.STOP_OVERLAY";
    public static final String ACTION_RESULT = "app.aether.assistant.OVERLAY_RESULT";
    private static final String CHANNEL = "eta_overlay";
    private static final int NOTIF_ID = 42;
    private static final String PREFS = "aether";
    private static final String KEY_FAILS = "overlay_fail_streak";
    private static final int FAIL_OPEN_APP = 5;

    private WindowManager windowManager;
    private View bubbleView;
    private View panelView;
    private WindowManager.LayoutParams bubbleParams;
    private WindowManager.LayoutParams panelParams;
    private TextView statusView;
    private EditText inputView;
    private TextView micView;
    private boolean panelVisible;
    private boolean listening;
    private SpeechRecognizer recognizer;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver resultReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION_RESULT.equals(intent.getAction())) return;
            boolean ok = intent.getBooleanExtra("ok", false);
            String message = intent.getStringExtra("message");
            if (message == null) message = ok ? "Done." : "Failed.";
            setStatus("Eta: " + message);
            if (ok) clearFailures();
            else noteFailure();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        ensureChannel();
        startForeground(NOTIF_ID, buildNotification());
        IntentFilter filter = new IntentFilter(ACTION_RESULT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(resultReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(resultReceiver, filter);
        }
        if (canDrawOverlays()) {
            showBubble();
        } else {
            Toast.makeText(this, "Allow Eta to display over other apps", Toast.LENGTH_LONG).show();
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    android.net.Uri.parse("package:" + getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            stopSelf();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                stopSelf();
                return START_NOT_STICKY;
            }
            if (ACTION_SHOW_PANEL.equals(action) || Intent.ACTION_ASSIST.equals(action)
                    || Intent.ACTION_VOICE_COMMAND.equals(action)) {
                main.post(this::expandPanel);
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopListening();
        try { unregisterReceiver(resultReceiver); } catch (Exception ignored) {}
        removePanel();
        removeBubble();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean canDrawOverlays() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
    }

    private void showBubble() {
        if (bubbleView != null) return;
        bubbleView = LayoutInflater.from(this).inflate(R.layout.overlay_bubble, null);
        bubbleParams = baseParams(56, 56);
        bubbleParams.gravity = Gravity.TOP | Gravity.END;
        bubbleParams.x = 24;
        bubbleParams.y = 180;
        bubbleView.setOnTouchListener(new DragTapListener(() -> expandPanel()));
        try {
            windowManager.addView(bubbleView, bubbleParams);
        } catch (Exception e) {
            Toast.makeText(this, "Could not show Eta bubble", Toast.LENGTH_SHORT).show();
            stopSelf();
        }
    }

    private void removeBubble() {
        if (bubbleView != null && windowManager != null) {
            try { windowManager.removeView(bubbleView); } catch (Exception ignored) {}
        }
        bubbleView = null;
    }

    private void expandPanel() {
        if (panelVisible) return;
        panelView = LayoutInflater.from(this).inflate(R.layout.overlay_panel, null);
        statusView = panelView.findViewById(R.id.overlay_status);
        inputView = panelView.findViewById(R.id.overlay_input);
        micView = panelView.findViewById(R.id.overlay_mic);
        TextView dismiss = panelView.findViewById(R.id.overlay_dismiss);
        TextView send = panelView.findViewById(R.id.overlay_send);

        dismiss.setOnClickListener(v -> collapsePanel());
        send.setOnClickListener(v -> submitText());
        micView.setOnClickListener(v -> toggleMic());
        inputView.setOnEditorActionListener((tv, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                submitText();
                return true;
            }
            return false;
        });

        panelParams = baseParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT);
        panelParams.gravity = Gravity.BOTTOM;
        panelParams.y = 48;
        panelParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        panelParams.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;

        try {
            windowManager.addView(panelView, panelParams);
            panelVisible = true;
            if (bubbleView != null) bubbleView.setVisibility(View.GONE);
            setStatus(getString(R.string.overlay_hint));
        } catch (Exception e) {
            setStatus("Could not open Eta panel");
        }
    }

    private void collapsePanel() {
        stopListening();
        removePanel();
        if (bubbleView != null) bubbleView.setVisibility(View.VISIBLE);
    }

    private void removePanel() {
        if (panelView != null && windowManager != null) {
            try { windowManager.removeView(panelView); } catch (Exception ignored) {}
        }
        panelView = null;
        panelVisible = false;
        statusView = null;
        inputView = null;
        micView = null;
    }

    private WindowManager.LayoutParams baseParams(int w, int h) {
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        return new WindowManager.LayoutParams(
                w, h, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
    }

    private void setStatus(String msg) {
        if (statusView != null) statusView.setText(msg);
    }

    private void toggleMic() {
        if (listening) stopListening();
        else startListening();
    }

    private void startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            setStatus("Speech recognition not available on this phone");
            noteFailure();
            return;
        }
        stopListening();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                listening = true;
                setStatus(getString(R.string.overlay_listening));
                if (micView != null) micView.setBackgroundColor(0xFFE24B4A);
            }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() { setStatus("Got it…"); }
            @Override public void onError(int error) {
                listening = false;
                if (micView != null) micView.setBackgroundColor(0xFF2A6BFF);
                setStatus("Didn't catch that — try again or type");
                noteFailure();
            }
            @Override public void onResults(Bundle results) {
                listening = false;
                if (micView != null) micView.setBackgroundColor(0xFF2A6BFF);
                ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list != null && !list.isEmpty()) {
                    String said = list.get(0);
                    if (inputView != null) inputView.setText(said);
                    handleCommand(said);
                } else {
                    setStatus("Didn't catch that");
                    noteFailure();
                }
            }
            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        Intent ri = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        ri.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        ri.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        ri.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            recognizer.startListening(ri);
        } catch (Exception e) {
            setStatus("Microphone blocked — allow mic for Eta");
            noteFailure();
        }
    }

    private void stopListening() {
        listening = false;
        if (micView != null) micView.setBackgroundColor(0xFF2A6BFF);
        if (recognizer != null) {
            try { recognizer.cancel(); recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private void submitText() {
        if (inputView == null) return;
        String text = inputView.getText() != null ? inputView.getText().toString().trim() : "";
        if (text.isEmpty()) {
            setStatus("Type a command or tap the mic");
            return;
        }
        handleCommand(text);
    }

    private void handleCommand(String text) {
        setStatus("Working…");
        Intent host = new Intent(this, OverlayHostActivity.class);
        host.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        host.putExtra(OverlayHostActivity.EXTRA_COMMAND, text);
        try {
            startActivity(host);
            setStatus("Eta: running “" + trim(text, 40) + "”");
            if (inputView != null) inputView.setText("");
        } catch (Exception e) {
            setStatus("Could not run that. Try again?");
            noteFailure();
        }
    }

    private void noteFailure() {
        int n = getSharedPreferences(PREFS, MODE_PRIVATE).getInt(KEY_FAILS, 0) + 1;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_FAILS, n).apply();
        if (n >= FAIL_OPEN_APP) {
            setStatus("Opening full Eta…");
            clearFailures();
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } else {
            setStatus("That didn't work (" + n + "/" + FAIL_OPEN_APP + "). Try again or type another command.");
        }
    }

    private void clearFailures() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_FAILS, 0).apply();
    }

    static void reportResult(Context ctx, boolean ok, String message) {
        Intent i = new Intent(ACTION_RESULT);
        i.setPackage(ctx.getPackageName());
        i.putExtra("ok", ok);
        i.putExtra("message", message == null ? "" : message);
        ctx.sendBroadcast(i);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Eta overlay",
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Keeps Eta available over other apps");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, EtaOverlayService.class);
        open.setAction(ACTION_SHOW_PANEL);
        PendingIntent pi = PendingIntent.getService(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, EtaOverlayService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
                .setContentTitle("E.T.A")
                .setContentText(getString(R.string.overlay_notification))
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pi)
                .addAction(0, "Open Eta", pi)
                .addAction(0, "Stop", stopPi)
                .setOngoing(true)
                .build();
    }

    private static String trim(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    private class DragTapListener implements View.OnTouchListener {
        private final Runnable onTap;
        private int lastX, lastY, startX, startY;
        private boolean moved;

        DragTapListener(Runnable onTap) { this.onTap = onTap; }

        @Override
        public boolean onTouch(View v, MotionEvent e) {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    lastX = (int) e.getRawX();
                    lastY = (int) e.getRawY();
                    startX = lastX;
                    startY = lastY;
                    moved = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) e.getRawX() - lastX;
                    int dy = (int) e.getRawY() - lastY;
                    lastX = (int) e.getRawX();
                    lastY = (int) e.getRawY();
                    if (Math.abs(lastX - startX) > 12 || Math.abs(lastY - startY) > 12) moved = true;
                    bubbleParams.x = Math.max(0, bubbleParams.x - dx);
                    bubbleParams.y = Math.max(0, bubbleParams.y + dy);
                    try { windowManager.updateViewLayout(bubbleView, bubbleParams); } catch (Exception ignored) {}
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!moved && onTap != null) onTap.run();
                    return true;
            }
            return false;
        }
    }
}
