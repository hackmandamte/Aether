package app.aether.assistant;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.location.Location;
import android.location.LocationManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.WindowManager;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Executes phone actions. Reached only through MainActivity's origin-restricted
 * message channel. Never reports success unless the side-effect actually ran.
 */
public class AetherBridge {
    private static final Pattern CLOCK = Pattern.compile("^(\\d{1,2}):(\\d{2})$");
    private static final int MAX_TIMER_SECONDS = 24 * 60 * 60;
    private static final int MAX_SMS_CHARS = 500;
    private static final int MAX_SPEAK_CHARS = 1200;

    private final MainActivity activity;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static final Map<String, String> APPS = new HashMap<>();
    static {
        APPS.put("whatsapp", "com.whatsapp");
        APPS.put("telegram", "org.telegram.messenger");
        APPS.put("instagram", "com.instagram.android");
        APPS.put("facebook", "com.facebook.katana");
        APPS.put("messenger", "com.facebook.orca");
        APPS.put("tiktok", "com.zhiliaoapp.musically");
        APPS.put("twitter", "com.twitter.android");
        APPS.put("x", "com.twitter.android");
        APPS.put("snapchat", "com.snapchat.android");
        APPS.put("youtube", "com.google.android.youtube");
        APPS.put("spotify", "com.spotify.music");
        APPS.put("netflix", "com.netflix.mediaclient");
        APPS.put("chrome", "com.android.chrome");
        APPS.put("gmail", "com.google.android.gm");
        APPS.put("phone", "com.android.dialer");
        APPS.put("messages", "com.google.android.apps.messaging");
        APPS.put("camera", "com.transsion.camera");
        APPS.put("settings", "com.android.settings");
        APPS.put("clock", "com.transsion.deskclock");
        APPS.put("files", "com.transsion.filemanagerx");
        APPS.put("play", "com.android.vending");
        APPS.put("maps", "com.google.android.apps.maps");
        APPS.put("calendar", "com.google.android.calendar");
        APPS.put("photos", "com.google.android.apps.photos");
        APPS.put("gallery", "com.google.android.apps.photos");
        APPS.put("uber", "com.ubercab");
        APPS.put("bolt", "com.bolt.client");
    }

    public AetherBridge(MainActivity activity) {
        this.activity = activity;
        initTts();
    }

    private void initTts() {
        mainHandler.post(() -> {
            try {
                tts = new TextToSpeech(activity.getApplicationContext(), status -> {
                    ttsReady = status == TextToSpeech.SUCCESS;
                    if (ttsReady && tts != null) {
                        try {
                            tts.setLanguage(Locale.US);
                        } catch (Exception ignored) {
                        }
                    }
                });
            } catch (Exception e) {
                ttsReady = false;
            }
        });
    }

    /** Speak with the phone's real TTS engine (not WebView speechSynthesis). */
    public JSONObject speak(JSONObject obj) {
        String text = clip(obj.optString("text", ""), MAX_SPEAK_CHARS).trim();
        if (text.isEmpty()) return result(false, "Nothing to say.");

        float rate = (float) obj.optDouble("rate", 1.0);
        float pitch = (float) obj.optDouble("pitch", 1.0);
        String lang = obj.optString("language", "en");
        rate = Math.max(0.5f, Math.min(2.0f, rate));
        pitch = Math.max(0.5f, Math.min(2.0f, pitch));

        // Wait briefly if TTS is still initializing
        if (!ttsReady || tts == null) {
            CountDownLatch latch = new CountDownLatch(1);
            mainHandler.post(() -> {
                if (tts == null) initTts();
                latch.countDown();
            });
            try {
                latch.await(400, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {
            }
            // Give engine a moment after create
            try {
                Thread.sleep(300);
            } catch (InterruptedException ignored) {
            }
        }

        if (tts == null || !ttsReady) {
            return result(false, "Text-to-speech is not ready on this phone.");
        }

        final float fRate = rate;
        final float fPitch = pitch;
        final String fLang = lang;
        final String fText = text;
        final CountDownLatch done = new CountDownLatch(1);
        final boolean[] ok = { false };

        mainHandler.post(() -> {
            try {
                Locale locale = localeFor(fLang);
                int langResult = tts.setLanguage(locale);
                if (langResult == TextToSpeech.LANG_MISSING_DATA
                        || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(Locale.US);
                }
                tts.setSpeechRate(fRate);
                tts.setPitch(fPitch);
                String id = UUID.randomUUID().toString();
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) { ok[0] = true; }
                    @Override public void onDone(String utteranceId) { done.countDown(); }
                    @Override public void onError(String utteranceId) { done.countDown(); }
                });
                int speakResult;
                if (Build.VERSION.SDK_INT >= 21) {
                    Bundle params = new Bundle();
                    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
                    speakResult = tts.speak(fText, TextToSpeech.QUEUE_FLUSH, params, id);
                } else {
                    HashMap<String, String> params = new HashMap<>();
                    params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
                    speakResult = tts.speak(fText, TextToSpeech.QUEUE_FLUSH, params);
                }
                if (speakResult == TextToSpeech.SUCCESS) {
                    ok[0] = true;
                    // Don't block the bridge for the full utterance — fire and return
                    done.countDown();
                } else {
                    done.countDown();
                }
            } catch (Exception e) {
                done.countDown();
            }
        });

        try {
            done.await(2, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }

        if (ok[0]) return result(true, "Speaking.");
        return result(false, "Could not start speech.");
    }

    public void stopSpeaking() {
        mainHandler.post(() -> {
            try {
                if (tts != null) tts.stop();
            } catch (Exception ignored) {
            }
        });
    }

    public void shutdown() {
        mainHandler.post(() -> {
            try {
                if (tts != null) {
                    tts.stop();
                    tts.shutdown();
                    tts = null;
                    ttsReady = false;
                }
            } catch (Exception ignored) {
            }
        });
    }

    private static Locale localeFor(String language) {
        if (language == null) return Locale.US;
        switch (language.toLowerCase(Locale.US)) {
            case "fr": return Locale.FRENCH;
            case "hi": return new Locale("hi", "IN");
            case "ar": return new Locale("ar");
            case "sw": return new Locale("sw");
            case "es": return new Locale("es", "ES");
            case "pt": return new Locale("pt", "BR");
            case "en":
            default: return Locale.US;
        }
    }

    public JSONObject execute(JSONObject obj) {
        try {
            String action = obj.optString("action");
            String target = clip(obj.optString("target", obj.optString("value", "")), 200);
            String extra = clip(obj.optString("extra", ""), MAX_SMS_CHARS);
            String value = clip(obj.optString("value", ""), 60);
            switch (action) {
                case "flashlight_on":
                    return torch(true);
                case "flashlight_off":
                    return torch(false);
                case "volume":
                    return volume(parseInt(value.isEmpty() ? target : value, 11));
                case "brightness":
                    return brightness(parseInt(value.isEmpty() ? target : value, 70));
                case "call":
                    return call(target);
                case "sms":
                    return sms(target, extra.isEmpty() ? value : extra);
                case "open_app":
                    return openApp(target);
                case "camera":
                    return camera();
                case "alarm":
                    return alarm(value.isEmpty() ? target : value, extra);
                case "timer":
                    return timer(parseInt(value.isEmpty() ? target : value, 60), extra);
                case "lock":
                    return global("lock");
                case "home":
                    return global("home");
                case "back":
                    return global("back");
                case "wifi":
                    return openSettings(Settings.ACTION_WIFI_SETTINGS, "Wi-Fi");
                case "bluetooth":
                    return openSettings(Settings.ACTION_BLUETOOTH_SETTINGS, "Bluetooth");
                case "navigate":
                    return navigate(target);
                case "location":
                    return location();
                case "search_web":
                    return searchWeb(target.isEmpty() ? extra : target);
                case "open_url":
                    return openWebUrl(target.isEmpty() ? extra : target);
                default:
                    return result(false, "Unknown action");
            }
        } catch (Exception e) {
            return result(false, "That didn't work.");
        }
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) : s;
    }

    private JSONObject torch(boolean on) {
        CameraManager cm = (CameraManager) activity.getSystemService(Context.CAMERA_SERVICE);
        try {
            String id = null;
            for (String cid : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(cid);
                Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flash)
                        && (facing == null || facing == CameraCharacteristics.LENS_FACING_BACK)) {
                    id = cid;
                    break;
                }
            }
            if (id == null) return result(false, "This phone has no flashlight.");
            cm.setTorchMode(id, on);
            vibrate(on ? 40 : 25);
            return result(true, on ? "Flashlight on." : "Flashlight off.");
        } catch (CameraAccessException | IllegalArgumentException e) {
            return result(false, "Torch is not available.");
        }
    }

    private JSONObject volume(int level) {
        AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int clamped = Math.max(0, Math.min(15, level));
        int mapped = Math.round(clamped / 15f * max);
        am.setStreamVolume(AudioManager.STREAM_MUSIC, mapped, AudioManager.FLAG_SHOW_UI);
        try {
            am.setStreamVolume(AudioManager.STREAM_RING,
                    Math.round(clamped / 15f * am.getStreamMaxVolume(AudioManager.STREAM_RING)), 0);
        } catch (SecurityException ignored) {
        }
        return result(true, "Volume " + clamped + " of 15.");
    }

    private JSONObject brightness(int percent) {
        int p = Math.max(5, Math.min(100, percent));
        activity.runOnUiThread(() -> {
            WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
            lp.screenBrightness = p / 100f;
            activity.getWindow().setAttributes(lp);
        });
        try {
            if (Settings.System.canWrite(activity)) {
                Settings.System.putInt(activity.getContentResolver(),
                        Settings.System.SCREEN_BRIGHTNESS, Math.round(p / 100f * 255));
                return result(true, "Brightness " + p + " percent.");
            }
            Intent i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
            i.setData(Uri.parse("package:" + activity.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return result(true,
                    "Screen dimmed here. Allow modify system settings, then ask again for system-wide brightness.");
        } catch (Exception e) {
            return result(true, "Brightness " + p + " percent for this screen.");
        }
    }

    private JSONObject call(String number) {
        String n = number.replaceAll("[^0-9+]", "");
        if (n.isEmpty()) return result(false, "Who should I call?");
        Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + n));
        dial.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(dial);
        return result(true, "Dialer ready for " + n + ". Tap to call.");
    }

    private JSONObject sms(String number, String body) {
        String n = number.replaceAll("[^0-9+]", "");
        if (n.isEmpty()) return result(false, "Who should I text?");
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + n));
        i.putExtra("sms_body", clip(body, MAX_SMS_CHARS));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Message drafted for " + n + ". Tap send.");
    }

    private JSONObject openApp(String name) {
        String key = name.toLowerCase(Locale.US).trim();
        if (key.isEmpty()) return result(false, "Which app should I open?");

        PackageManager pm = activity.getPackageManager();
        String pkg = APPS.get(key);
        if (pkg == null) {
            for (Map.Entry<String, String> e : APPS.entrySet()) {
                if (key.contains(e.getKey()) || e.getKey().contains(key)) {
                    pkg = e.getValue();
                    break;
                }
            }
        }

        if (pkg == null) {
            Intent main = new Intent(Intent.ACTION_MAIN, null);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> launchers = pm.queryIntentActivities(main, 0);
            String bestPkg = null;
            int bestScore = 0;
            for (ResolveInfo ri : launchers) {
                if (ri.activityInfo == null) continue;
                CharSequence label = ri.loadLabel(pm);
                if (label == null) continue;
                String lab = label.toString().toLowerCase(Locale.US);
                int score = 0;
                if (lab.equals(key)) score = 3;
                else if (lab.startsWith(key) || key.startsWith(lab)) score = 2;
                else if (lab.contains(key) || key.contains(lab)) score = 1;
                if (score > bestScore) {
                    bestScore = score;
                    bestPkg = ri.activityInfo.packageName;
                }
            }
            if (bestPkg != null) pkg = bestPkg;
        }

        if (pkg == null && key.contains(".")) pkg = key;

        if (pkg != null) {
            Intent launch = pm.getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(launch);
                return result(true, "Opening " + name + ".");
            }
        }

        Intent market = new Intent(Intent.ACTION_VIEW,
                Uri.parse("market://search?q=" + Uri.encode(name) + "&c=apps"));
        market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(market);
            return result(true, "Couldn't find " + name + " installed. Opened Play Store search.");
        } catch (Exception e) {
            Intent web = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/search?q=" + Uri.encode(name) + "&c=apps"));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                activity.startActivity(web);
                return result(true, "Couldn't find " + name + " installed. Opened Play Store search.");
            } catch (Exception e2) {
                return result(false, "Couldn't open " + name + ".");
            }
        }
    }

    private JSONObject camera() {
        Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
            return result(true, "Camera.");
        } catch (Exception e) {
            return result(false, "Couldn't open the camera.");
        }
    }

    private JSONObject alarm(String time, String label) {
        Matcher m = CLOCK.matcher(time.trim());
        if (!m.matches()) return result(false, "What time should I set the alarm for?");
        int hour = Integer.parseInt(m.group(1));
        int minute = Integer.parseInt(m.group(2));
        if (hour > 23 || minute > 59) return result(false, "That isn't a valid time.");
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, hour);
        i.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        i.putExtra(AlarmClock.EXTRA_MESSAGE, label.isEmpty() ? "Eta" : label);
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
            return result(true, String.format(Locale.US, "Alarm %02d:%02d.", hour, minute));
        } catch (Exception e) {
            return result(false, "Couldn't set the alarm.");
        }
    }

    private JSONObject timer(int seconds, String label) {
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER);
        i.putExtra(AlarmClock.EXTRA_LENGTH, Math.max(1, Math.min(MAX_TIMER_SECONDS, seconds)));
        i.putExtra(AlarmClock.EXTRA_MESSAGE, label.isEmpty() ? "Eta" : label);
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
            return result(true, "Timer started.");
        } catch (Exception e) {
            return result(false, "Couldn't start the timer.");
        }
    }

    private JSONObject navigate(String target) {
        if (target == null || target.trim().isEmpty()) {
            return result(false, "Where should I navigate to?");
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(target)));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
            return result(true, "Navigating to " + target + ".");
        } catch (Exception e) {
            Intent web = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://maps.google.com/?q=" + Uri.encode(target)));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(web);
            return result(true, "Opening maps for " + target + ".");
        }
    }

    private JSONObject location() {
        boolean fine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            return result(false, "Location permission is off. Allow it for Eta in Settings, then ask again.");
        }

        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return result(false, "Location services are not available.");

        boolean gpsOn = false;
        boolean netOn = false;
        try {
            gpsOn = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
            netOn = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
        }
        if (!gpsOn && !netOn) {
            return result(false, "Turn on Location in system settings, then ask again.");
        }

        Location loc = null;
        try {
            if (fine) loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (loc == null) loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (loc == null) {
                try {
                    loc = lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER);
                } catch (Exception ignored) {
                }
            }
        } catch (SecurityException e) {
            return result(false, "Location permission is off. Allow it for Eta, then ask again.");
        }

        if (loc == null) {
            return result(false,
                    "No recent location yet. Open Maps once so the phone caches a fix, then ask me again.");
        }

        double lat = loc.getLatitude();
        double lng = loc.getLongitude();
        Intent i = new Intent(Intent.ACTION_VIEW,
                Uri.parse("geo:" + lat + "," + lng + "?q=" + lat + "," + lng));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
        } catch (Exception e) {
            Intent web = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://maps.google.com/?q=" + lat + "," + lng));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(web);
        }

        JSONObject o = result(true,
                String.format(Locale.US, "You're around %.5f, %.5f. Opening maps.", lat, lng));
        try {
            o.put("latitude", lat);
            o.put("longitude", lng);
        } catch (Exception ignored) {
        }
        return o;
    }

    private JSONObject searchWeb(String query) {
        if (query == null || query.trim().isEmpty()) return result(false, "What should I search for?");
        Intent i = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://www.google.com/search?q=" + Uri.encode(query.trim())));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Searching the web.");
    }

    private JSONObject openWebUrl(String url) {
        if (url == null || url.trim().isEmpty()) return result(false, "Which website?");
        String u = url.trim();
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(u));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Opening " + u + ".");
    }

    private JSONObject openSettings(String action, String label) {
        Intent i = new Intent(action);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Opening " + label + ".");
    }

    private JSONObject global(String which) {
        AetherAccessibilityService svc = AetherAccessibilityService.instance;
        if (svc == null) {
            Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            return result(false, "Turn on Eta in Accessibility, then try again.");
        }
        boolean ok = svc.perform(which);
        return result(ok, ok ? "Done." : "Could not " + which + ".");
    }

    private void vibrate(int ms) {
        Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            v.vibrate(ms);
        }
    }

    private static int parseInt(String raw, int fallback) {
        try {
            return Integer.parseInt(raw.replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return fallback;
        }
    }

    static JSONObject result(boolean ok, String message) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            o.put("message", message == null ? "" : message);
            o.put("native", true);
        } catch (Exception ignored) {
        }
        return o;
    }
}
