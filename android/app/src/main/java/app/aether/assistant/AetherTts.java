package app.aether.assistant;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.Locale;
import java.util.UUID;

/** System TTS with real language selection (not English-with-accent). */
public final class AetherTts {
    private final Context app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private volatile boolean ready;

    public AetherTts(Context context) {
        this.app = context.getApplicationContext();
        main.post(this::init);
    }

    private void init() {
        try {
            tts = new TextToSpeech(app, status -> {
                ready = status == TextToSpeech.SUCCESS && tts != null;
                if (ready) {
                    try {
                        if (Build.VERSION.SDK_INT >= 21) {
                            tts.setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ASSISTANT)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                    .build());
                        }
                        tts.setLanguage(Locale.US);
                    } catch (Exception ignored) {}
                }
            });
        } catch (Exception e) {
            ready = false;
        }
    }

    public boolean speak(String text, float rate, float pitch, String language) {
        if (text == null || text.trim().isEmpty()) return false;
        final String say = text.trim();
        final float r = Math.max(0.5f, Math.min(2f, rate));
        final float p = Math.max(0.5f, Math.min(2f, pitch));
        final String lang = language == null ? "en" : language;

        try {
            AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                int cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                if (cur < Math.max(1, max / 4)) {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.max(cur, max / 3), 0);
                }
            }
        } catch (Exception ignored) {}

        final boolean[] started = { false };
        main.post(() -> {
            if (!ready || tts == null) return;
            try {
                Locale loc = localeFor(lang);
                int avail = tts.isLanguageAvailable(loc);
                if (avail < TextToSpeech.LANG_AVAILABLE) {
                    Locale bare = new Locale(loc.getLanguage());
                    avail = tts.isLanguageAvailable(bare);
                    if (avail >= TextToSpeech.LANG_AVAILABLE) {
                        tts.setLanguage(bare);
                    } else {
                        try {
                            Intent install = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            app.startActivity(install);
                        } catch (Exception ignored) {}
                        if (!"en".equalsIgnoreCase(lang)) return;
                        tts.setLanguage(Locale.US);
                    }
                } else {
                    tts.setLanguage(loc);
                }
                tts.setSpeechRate(r);
                tts.setPitch(p);
                String id = UUID.randomUUID().toString();
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) {}
                    @Override public void onDone(String utteranceId) {}
                    @Override public void onError(String utteranceId) {}
                });
                int code;
                if (Build.VERSION.SDK_INT >= 21) {
                    code = tts.speak(say, TextToSpeech.QUEUE_FLUSH, null, id);
                } else {
                    code = tts.speak(say, TextToSpeech.QUEUE_FLUSH, null);
                }
                if (code == TextToSpeech.SUCCESS) started[0] = true;
            } catch (Exception ignored) {}
        });
        try { Thread.sleep(200); } catch (InterruptedException ignored) {}
        return started[0];
    }

    public void stop() {
        main.post(() -> {
            try { if (tts != null) tts.stop(); } catch (Exception ignored) {}
        });
    }

    public void shutdown() {
        main.post(() -> {
            try {
                if (tts != null) {
                    tts.stop();
                    tts.shutdown();
                    tts = null;
                    ready = false;
                }
            } catch (Exception ignored) {}
        });
    }

    private static Locale localeFor(String language) {
        switch (language.toLowerCase(Locale.US)) {
            case "fr": return Locale.FRANCE;
            case "hi": return new Locale("hi", "IN");
            case "ar": return new Locale("ar", "SA");
            case "sw": return new Locale("sw", "KE");
            case "es": return new Locale("es", "ES");
            case "pt": return new Locale("pt", "BR");
            default: return Locale.US;
        }
    }
}
