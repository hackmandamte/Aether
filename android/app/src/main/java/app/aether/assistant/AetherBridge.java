package app.aether.assistant;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.location.Location;
import android.location.LocationManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.view.WindowManager;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Executes phone actions. Reached only through MainActivity's origin-restricted
 * message channel; nothing here is exposed to web content directly.
 */
public class AetherBridge {
    private static final Pattern CLOCK = Pattern.compile("^(\\d{1,2}):(\\d{2})$");
    private static final int MAX_TIMER_SECONDS = 24 * 60 * 60;
    private static final int MAX_SMS_CHARS = 500;

    private final MainActivity activity;
    private boolean torchOn = false;

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
            torchOn = on;
            vibrate(30);
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
            am.setStreamVolume(AudioManager.STREAM_RING, Math.round(clamped / 15f * am.getStreamMaxVolume(AudioManager.STREAM_RING)), 0);
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
                Settings.System.putInt(activity.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, Math.round(p / 100f * 255));
            } else {
                Intent i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS);
                i.setData(Uri.parse("package:" + activity.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(i);
                return result(true, "Allow modify system settings, then ask again.");
            }
        } catch (Exception ignored) {
        }
        return result(true, "Brightness " + p + " percent.");
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

    /** Launch any installed app by display name, known alias, or package. */
    private JSONObject openApp(String name) {
        String key = name.toLowerCase(Locale.US).trim();
        if (key.isEmpty()) return result(false, "Which app should I open?");

        String pkg = APPS.get(key);
        if (pkg == null) {
            for (Map.Entry<String, String> e : APPS.entrySet()) {
                if (key.contains(e.getKey()) || e.getKey().contains(key)) {
                    pkg = e.getValue();
                    break;
                }
            }
        }

        PackageManager pm = activity.getPackageManager();

        // Scan installed apps by label (no exceptions for installed apps)
        if (pkg == null) {
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            for (ApplicationInfo info : apps) {
                CharSequence label = pm.getApplicationLabel(info);
                if (label == null) continue;
                String lab = label.toString().toLowerCase(Locale.US);
                if (lab.equals(key) || lab.contains(key) || key.contains(lab)) {
                    pkg = info.packageName;
                    break;
                }
            }
        }

        // Treat dotted names as package ids
        if (pkg == null && key.contains(".")) {
            pkg = key;
        }

        if (pkg != null) {
            Intent launch = pm.getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(launch);
                return result(true, "Opening " + name + ".");
            }
        }

        // Fall back to Play Store search — still opens something useful
        Intent market = new Intent(Intent.ACTION_VIEW,
                Uri.parse("market://search?q=" + Uri.encode(name) + "&c=apps"));
        market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(market);
        } catch (Exception e) {
            Intent web = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/search?q=" + Uri.encode(name) + "&c=apps"));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(web);
        }
        return result(true, "Looking up " + name + " on Play Store.");
    }

    private JSONObject camera() {
        Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Camera.");
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
        activity.startActivity(i);
        return result(true, String.format(Locale.US, "Alarm %02d:%02d.", hour, minute));
    }

    private JSONObject timer(int seconds, String label) {
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER);
        i.putExtra(AlarmClock.EXTRA_LENGTH, Math.max(1, Math.min(MAX_TIMER_SECONDS, seconds)));
        i.putExtra(AlarmClock.EXTRA_MESSAGE, label.isEmpty() ? "Eta" : label);
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Timer started.");
    }

    private JSONObject navigate(String target) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(target)));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Navigating to " + target + ".");
    }

    private JSONObject location() {
        try {
            LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
            Location loc = null;
            try {
                loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (loc == null) loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            } catch (SecurityException e) {
                return result(false, "Allow location permission for Eta, then try again.");
            }
            if (loc == null) {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=my+location"));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(i);
                return result(true, "Opening maps near you.");
            }
            double lat = loc.getLatitude();
            double lng = loc.getLongitude();
            Intent i = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("geo:" + lat + "," + lng + "?q=" + lat + "," + lng));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
            JSONObject o = result(true,
                    String.format(Locale.US, "You're around %.4f, %.4f. Opening maps.", lat, lng));
            try {
                o.put("latitude", lat);
                o.put("longitude", lng);
            } catch (Exception ignored) {
            }
            return o;
        } catch (Exception e) {
            return result(false, "Couldn't get location.");
        }
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
