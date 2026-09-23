package app.aether.assistant;

import android.accessibilityservice.AccessibilityService;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

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

    /** Type into the focused editable field of whatever app is on screen. */
    public static boolean typeText(String text) {
        AetherAccessibilityService svc = instance;
        if (svc == null || text == null) return false;
        AccessibilityNodeInfo root = svc.getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focus == null) focus = findEditable(root);
        if (focus == null) {
            root.recycle();
            return false;
        }
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean ok = focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        focus.recycle();
        root.recycle();
        return ok;
    }

    private static AccessibilityNodeInfo findEditable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isEditable() && node.isEnabled()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo found = findEditable(child);
            if (found != null) return found;
            if (child != null) child.recycle();
        }
        return null;
    }
}
