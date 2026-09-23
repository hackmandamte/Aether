package app.aether.assistant;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Fully offline English STT via Vosk.
 * Model lives under assets/model-en-us (shipped in release APK, ~40MB).
 */
public final class EtaOfflineStt {
    private static final String TAG = "EtaOfflineStt";
    private static final String ASSET_MODEL = "model-en-us";
    private static final int SAMPLE_RATE = 16000;

    private static Model model;
    private static final Object LOCK = new Object();

    private EtaOfflineStt() {}

    public static boolean isReady(Context ctx) {
        try {
            ensureModel(ctx.getApplicationContext());
            return model != null;
        } catch (Exception e) {
            Log.w(TAG, "model not ready", e);
            return false;
        }
    }

    /**
     * Record from the mic for up to maxMs or until silence after speech, return transcript.
     * Blocks the calling thread — run off the UI thread.
     */
    public static String listenOnce(Context ctx, int maxMs) throws Exception {
        ensureModel(ctx.getApplicationContext());
        if (model == null) throw new IllegalStateException("Offline model missing");

        Recognizer rec = new Recognizer(model, SAMPLE_RATE);
        int minBuf = AudioRecord.getMinBufferSize(
                SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int bufSize = Math.max(minBuf, SAMPLE_RATE / 5) * 2;

        AudioRecord audio = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufSize);

        if (audio.getState() != AudioRecord.STATE_INITIALIZED) {
            audio.release();
            throw new IllegalStateException("Microphone unavailable");
        }

        byte[] buffer = new byte[bufSize];
        AtomicBoolean stop = new AtomicBoolean(false);
        long deadline = System.currentTimeMillis() + Math.max(3000, Math.min(maxMs, 20_000));
        String best = "";

        audio.startRecording();
        try {
            while (System.currentTimeMillis() < deadline && !stop.get()) {
                int n = audio.read(buffer, 0, buffer.length);
                if (n <= 0) continue;
                if (rec.acceptWaveForm(buffer, n)) {
                    String j = rec.getResult();
                    String t = extractText(j);
                    if (t != null && !t.isEmpty()) {
                        best = t;
                        // Short utterance done
                        if (t.split("\\s+").length >= 2) break;
                    }
                } else {
                    String partial = extractText(rec.getPartialResult());
                    if (partial != null && partial.length() > best.length()) {
                        best = partial;
                    }
                }
            }
            String finalJson = rec.getFinalResult();
            String fin = extractText(finalJson);
            if (fin != null && !fin.isEmpty()) best = fin;
        } finally {
            try { audio.stop(); } catch (Exception ignored) {}
            audio.release();
            rec.close();
        }
        return best == null ? "" : best.trim();
    }

    private static String extractText(String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            JSONObject o = new JSONObject(json);
            if (o.has("text")) return o.optString("text", "").trim();
            if (o.has("partial")) return o.optString("partial", "").trim();
        } catch (Exception ignored) {}
        return null;
    }

    private static void ensureModel(Context ctx) throws Exception {
        synchronized (LOCK) {
            if (model != null) return;
            LibVosk.setLogLevel(LogLevel.WARNINGS);
            File target = new File(ctx.getFilesDir(), ASSET_MODEL);
            if (!new File(target, "am/final.mdl").exists()
                    && !new File(target, "conf/model.conf").exists()
                    && !new File(target, "ivector/final.dubm").exists()) {
                copyAssetDir(ctx.getAssets(), ASSET_MODEL, target);
            }
            if (!target.isDirectory()) {
                throw new IllegalStateException("Offline STT model not packaged. Rebuild APK with model-en-us assets.");
            }
            model = new Model(target.getAbsolutePath());
        }
    }

    private static void copyAssetDir(AssetManager am, String path, File out) throws Exception {
        String[] list = am.list(path);
        if (list == null || list.length == 0) {
            // file
            out.getParentFile().mkdirs();
            try (InputStream in = am.open(path); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            return;
        }
        // directory
        //noinspection ResultOfMethodCallIgnored
        out.mkdirs();
        for (String name : list) {
            String child = path.isEmpty() ? name : path + "/" + name;
            copyAssetDir(am, child, new File(out, name));
        }
    }
}
