package app.aether.assistant;

import org.json.JSONObject;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fast on-device command mapping for the overlay.
 * Uses AetherBridge for real actions — no faux success.
 */
public final class EtaLocalCommands {
    private static final Pattern OPEN = Pattern.compile(
            "(?i)^(?:open|launch|start)\\s+(.+)$");
    private static final Pattern VOLUME = Pattern.compile(
            "(?i)^(?:set\\s+)?volume\\s+(?:to\\s+)?(\\d{1,2})$");
    private static final Pattern BRIGHTNESS = Pattern.compile(
            "(?i)^(?:set\\s+)?brightness\\s+(?:to\\s+)?(\\d{1,3})(?:\\s*%)?$");

    private EtaLocalCommands() {}

    public static JSONObject tryExecute(AetherBridge bridge, String raw) {
        if (bridge == null || raw == null) return null;
        String text = raw.trim().replaceAll("\\s+", " ");
        if (text.isEmpty()) return null;
        String lower = text.toLowerCase(Locale.US);

        try {
            if (lower.equals("flashlight on") || lower.equals("torch on")
                    || lower.equals("turn on flashlight") || lower.equals("turn on the flashlight")
                    || lower.equals("turn on torch")) {
                return bridge.execute(action("flashlight_on"));
            }
            if (lower.equals("flashlight off") || lower.equals("torch off")
                    || lower.equals("turn off flashlight") || lower.equals("turn off the flashlight")
                    || lower.equals("turn off torch")) {
                return bridge.execute(action("flashlight_off"));
            }
            if (lower.equals("wifi") || lower.equals("open wifi") || lower.equals("wi-fi")) {
                return bridge.execute(action("wifi"));
            }
            if (lower.equals("bluetooth") || lower.equals("open bluetooth")) {
                return bridge.execute(action("bluetooth"));
            }
            if (lower.equals("home") || lower.equals("go home")) {
                return bridge.execute(action("home"));
            }
            if (lower.equals("back") || lower.equals("go back")) {
                return bridge.execute(action("back"));
            }
            if (lower.equals("lock") || lower.equals("lock phone") || lower.equals("lock the phone")) {
                return bridge.execute(action("lock"));
            }
            if (lower.equals("camera") || lower.equals("open camera")) {
                return bridge.execute(action("camera"));
            }
            if (lower.contains("where am i") || lower.equals("location")
                    || lower.equals("my location")) {
                return bridge.execute(action("location"));
            }

            Matcher vol = VOLUME.matcher(text);
            if (vol.matches()) {
                JSONObject o = action("volume");
                o.put("value", vol.group(1));
                return bridge.execute(o);
            }
            Matcher br = BRIGHTNESS.matcher(text);
            if (br.matches()) {
                JSONObject o = action("brightness");
                o.put("value", br.group(1));
                return bridge.execute(o);
            }
            Matcher open = OPEN.matcher(text);
            if (open.matches()) {
                JSONObject o = action("open_app");
                o.put("target", open.group(1).trim());
                return bridge.execute(o);
            }

            if (lower.startsWith("search ") || lower.startsWith("google ")) {
                String q = text.substring(text.indexOf(' ') + 1).trim();
                JSONObject o = action("search_web");
                o.put("target", q);
                return bridge.execute(o);
            }
        } catch (Exception e) {
            return null;
        }
        return null; // not a local command — caller may open full app after failures
    }

    private static JSONObject action(String name) throws Exception {
        JSONObject o = new JSONObject();
        o.put("action", name);
        return o;
    }
}
