package app.aether.assistant;

import android.content.Intent;
import android.os.Bundle;
import android.view.Window;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import org.json.JSONObject;

/**
 * Invisible host so overlay commands run with a real Activity context.
 * Finishes immediately after the action.
 */
public class OverlayHostActivity extends AppCompatActivity {
    public static final String EXTRA_COMMAND = "eta_command";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);

        String command = getIntent() != null ? getIntent().getStringExtra(EXTRA_COMMAND) : null;
        if (command == null || command.trim().isEmpty()) {
            finish();
            return;
        }

        AetherBridge bridge = new AetherBridge(this);
        JSONObject result = EtaLocalCommands.tryExecute(bridge, command.trim());

        Intent broadcast = new Intent(EtaOverlayService.ACTION_RESULT);
        broadcast.setPackage(getPackageName());

        if (result != null) {
            boolean ok = result.optBoolean("ok", false);
            String msg = result.optString("message", ok ? "Done." : "Failed.");
            Toast.makeText(this, "Eta: " + msg, Toast.LENGTH_SHORT).show();
            broadcast.putExtra("ok", ok);
            broadcast.putExtra("message", msg);
            sendBroadcast(broadcast);
            if (!ok) {
                // streak handled in service when it receives the broadcast
            }
        } else {
            // Not a local command — open full Eta with the text for the web assistant
            Toast.makeText(this, "Eta: opening full assistant for that", Toast.LENGTH_SHORT).show();
            broadcast.putExtra("ok", false);
            broadcast.putExtra("message", "Needs full Eta");
            broadcast.putExtra("open_full", true);
            sendBroadcast(broadcast);
            Intent full = new Intent(this, MainActivity.class);
            full.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            full.putExtra(EXTRA_COMMAND, command.trim());
            startActivity(full);
        }
        finish();
    }
}
