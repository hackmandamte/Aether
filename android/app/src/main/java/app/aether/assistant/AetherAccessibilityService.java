package app.aether.assistant;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

public class AetherAccessibilityService extends AccessibilityService {
    public static volatile AetherAccessibilityService instance;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    public boolean perform(String which) {
        switch (which) {
            case "home":
                return performGlobalAction(GLOBAL_ACTION_HOME);
            case "back":
                return performGlobalAction(GLOBAL_ACTION_BACK);
            case "lock":
                return performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
            case "recents":
                return performGlobalAction(GLOBAL_ACTION_RECENTS);
            default:
                return false;
        }
    }
}
