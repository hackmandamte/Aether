# Aether: security and bug-fix notes

## Do these before using this build

1. **Server env vars** (host dashboard, and `.env` for local dev; see `.env.example`):
   - `AETHER_ACCESS_CODE`: 16+ random characters (`openssl rand -base64 24`). The server refuses every request without it.
   - `XAI_API_KEY`: as before.
2. **Enter the access code once** in the app: Settings tab, Access code.
3. **New signing key.** The old keystore and its password (`aether8`) were in the project, so treat that key as burned.
   Run `sh scripts/make-keystore.sh`, then `sh scripts/build-apk.sh` (needs the Android SDK; edit `ANDROID_HOME` in the script if yours isn't at `/tmp/android-sdk`).
   Back up `android/app/aether.keystore` and `android/keystore.properties` somewhere private.
4. **Uninstall the old Aether app** from the phone first. Android refuses to update an app signed with a different key. Notes and reminders stored in the app are lost.
5. **Redeploy the site** so the old, vulnerable `aether.apk` is no longer served. It has been removed from this bundle.

## What was fixed

### Critical
- **Open proxy for your xAI key.** `askAether`, `speakAether` and `hearAether` (chat, TTS, STT) had no auth and no input validation. They now require the access code (constant-time check, fail-closed if unset, lockout after repeated wrong codes, per-client rate limit, cross-site request check), validate every field with zod (roles, sizes, language and voice allowlists, audio size), time out upstream calls, and no longer echo upstream error bodies to the client.
- **Any website could take over the phone bridge.** The `aether://configure?origin=` link was BROWSABLE, so any web page or app could point the WebView at a hostile site, and the old `addJavascriptInterface` exposed call/SMS/settings actions to whatever page (or iframe) was loaded. Now:
  - the origin is set only on the bundled setup page, must be a bare `https://` origin, and needs a native confirmation dialog;
  - the bridge is a `WebMessageListener` bound by WebView to that exact origin's top frame only;
  - other links open in the system browser; `file:`, `intent:` and other schemes are blocked;
  - the mic is granted only to that origin, and camera requests are denied.

### High
- **Calls and texts no longer fire silently.** `ACTION_CALL` is now `ACTION_DIAL`: the dialer opens with the number filled in and you tap to call. A mis-heard or manipulated request can't dial or text on its own. The system prompt also tells the model to act only on the latest user message.
- **Permissions trimmed:** removed `CALL_PHONE`, `SEND_SMS`, `READ_CONTACTS`, `CAMERA`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `QUERY_ALL_PACKAGES` (none were needed).
- **Signing secrets out of source:** `build.gradle` reads `android/keystore.properties` (git-ignored). Debug builds no longer use the release key.
- **Hardening:** cleartext traffic off, `allowBackup` off, WebView file access off, mixed content blocked, `aether://` intent filter removed, accessibility service reduced to global actions only (no event stream, no gestures).

### Bugs
- Timers from the phone bridge were wrong ("5 minutes" became 5 seconds, "1h30m" became 130 s). Durations are now parsed properly and capped at 24 h.
- Alarms like "7pm" silently became 07:00. The time is now parsed (24 h, am/pm, `.` or `:`); if unclear, Aether asks instead of guessing.
- Notes and reminders on the phone always reported a failure ("Unknown action") because the native side has no such action. They are now handled in-app.
- Device state (flashlight, volume, brightness) was updated even when the action failed. It now updates only on success.
- A network error left the orb stuck on "thinking" forever. Errors now return to idle with a message.
- Volume `NaN` when the model gave a non-numeric value; torch picked camera 0 (possibly the front camera); ringer volume could crash under Do Not Disturb.
- The "Listen while this page is open" switch did nothing. Removed.
- The install panel polled for the APK every 4 s forever. It now checks every 15 s and stops once found.
- Viewport blocked pinch-zoom (`maximum-scale=1`). Removed.
- Added baseline response headers (`nosniff`, permissions policy, no-store for server functions) via Nitro `routeRules`.

## Not verified here (no network, no Android SDK, no `node_modules` in the sandbox)

- The unit tests for the parsers and the rate limiter pass (`node --experimental-strip-types --test src/lib/aether/*.test.ts`).
- The Java was compile-checked only against hand-written stubs. **Build the APK and test on the phone** (setup page, Connect dialog, voice, alarm/timer, flashlight, dialer).
- `npm run typecheck` and `npm run build` were not run. TypeScript checked clean apart from missing-dependency noise. If `routeRules` isn't accepted by your Nitro version, delete that block in `vite.config.ts`.
- xAI endpoints and model names (`grok-4.5`, `/v1/tts`, `/v1/stt`, `grok-voice-transcribe-2.0`) were left as they were and not checked against xAI's docs.
- Two other test files in `scripts/` (share-card / PWA head injection) fail the same 8 tests as in the original zip.

## Known limits

- The rate limiter is in memory, so each serverless instance has its own window. It slows abuse; the access code is the real gate.
- The access code is stored in the app's local storage, so anyone who can run script on the site could read it. There are no injection points today.
- Chat history, notes and reminders are kept unencrypted in the app's storage on the phone.
- Reminders are in-app only (no notification fires) and always default to one hour from now.
- No CSP or `frame-ancestors` is set, because the Grok preview embeds the app. Add them once you host it yourself.
- Google Fonts is loaded from Google (privacy). Self-host the font to avoid it.
- The Grok-generated scaffolding (`src/lib/auth`, `preview-host-bridge`, `.grok/`) is untouched.
