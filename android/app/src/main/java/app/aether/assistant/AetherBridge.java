package app.aether.assistant;

import android.content.Context;
import android.content.Intent;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
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
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Executes phone actions. Reached only through MainActivity's origin-restricted
 * message channel; nothing here is exposed to web content directly.
 *
 * Deliberately no direct-dial and no silent SMS: calls and texts open the
 * dialer / composer with the details filled in, so a mis-heard or manipulated
 * request needs a human tap before anything is dialled or sent.
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
        APPS.put("youtube", "com.google.android.youtube");
        APPS.put("chrome", "com.android.chrome");
        APPS.put("phone", "com.android.dialer");
        APPS.put("messages", "com.google.android.apps.messaging");
        APPS.put("camera", "com.transsion.camera");
        APPS.put("settings", "com.android.settings");
        APPS.put("clock", "com.transsion.deskclock");
        APPS.put("files", "com.transsion.filemanagerx");
        APPS.put("play", "com.android.vending");
        APPS.put("maps", "com.google.android.apps.maps");
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
            // Do Not Disturb blocks ringer changes; media volume was still set.
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

    private JSONObject openApp(String name) {
        String key = name.toLowerCase(Locale.US).trim();
        String pkg = APPS.get(key);
        if (pkg == null) {
            for (Map.Entry<String, String> e : APPS.entrySet()) {
                if (key.contains(e.getKey())) {
                    pkg = e.getValue();
                    break;
                }
            }
        }
        if (pkg == null) return result(false, "I don't have " + name + ".");
        Intent launch = activity.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) {
            launch = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(launch);
        return result(true, "Opening " + name + ".");
    }

    private JSONObject camera() {
        Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, "Camera.");
    }

    private JSONObject alarm(String time, String label) {
        // The web app normalises to 24-hour "HH:MM"; refuse anything else instead of guessing.
        Matcher m = CLOCK.matcher(time.trim());
        if (!m.matches()) return result(false, "What time should I set the alarm for?");
        int hour = Integer.parseInt(m.group(1));
        int minute = Integer.parseInt(m.group(2));
        if (hour > 23 || minute > 59) return result(false, "That isn't a valid time.");
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, hour);
        i.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        i.putExtra(AlarmClock.EXTRA_MESSAGE, label.isEmpty() ? "Aether" : label);
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
        return result(true, String.format(Locale.US, "Alarm %02d:%02d.", hour, minute));
    }

    private JSONObject timer(int seconds, String label) {
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER);
        i.putExtra(AlarmClock.EXTRA_LENGTH, Math.max(1, Math.min(MAX_TIMER_SECONDS, seconds)));
        i.putExtra(AlarmClock.EXTRA_MESSAGE, label.isEmpty() ? "Aether" : label);
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
            return result(false, "Turn on Aether in Accessibility, then try again.");
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
