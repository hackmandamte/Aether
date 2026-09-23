# ETA — Your Everyday Task Assistant

**ETA** is a personal Android voice assistant you control with speech or text.  
Say what you need. ETA does the everyday stuff on your phone — flashlight, apps, notes, timers, search, and more — without making you dig through menus.

The name stands for **Everyday Task Assistant**.

---

## Why we built it

Phone assistants are often locked to one company, slow on budget devices, or full of features you never use. ETA is built to feel simple and local to *your* day:

- Open the app and see a clear welcome — not a wall of chat history.
- Tap a suggestion, type, or use the mic.
- Use a floating **hotkey** (the app logo) over other apps so you can give a command without leaving what you were doing.
- Keep the brain **online** (no huge models downloaded onto the phone).
- Prefer **real actions** over fake “done” messages.

It started as an experiment to build a serious, useful assistant that still feels light — something you can show off against a basic wallpaper site and actually live with every day.

---

## What it can do

| Area | Examples |
|------|----------|
| **Device** | Turn flashlight on/off, volume, brightness |
| **Apps** | Open WhatsApp, Chrome, Maps, Settings, camera, and other installed apps by name |
| **Time** | Set a timer, set an alarm |
| **Notes** | Take / save notes |
| **Location** | Ask where you are (needs location permission) |
| **Web** | Search the web, open a URL |
| **Voice** | Speak replies with online TTS; choose calm / warm / male / female-style voices when the server path is live |
| **Overlay** | Floating logo bubble over other apps — speak or type a command without opening the full app |

Not every phone allows every action the same way (OEM settings differ). When something needs a system permission, ETA should ask or point you to Settings instead of pretending it worked.

---

## Permissions you should allow

Grant these when Android asks, or later under **Settings → Apps → E.T.A / ETA → Permissions**:

| Permission | Why |
|------------|-----|
| **Microphone** | Voice commands |
| **Internet / Network** | Chat, speech-to-text, text-to-speech (online) |
| **Location** (optional but useful) | “Where am I?” and place-related requests |
| **Display over other apps** (SYSTEM_ALERT_WINDOW) | Floating hotkey bubble |
| **Notifications** | Overlay service / “ETA is ready” status on newer Android |
| **Modify system settings** (optional) | Brightness and similar controls on some devices |
| **Accessibility** (optional) | Home / Back / Recents / Lock-style actions if you enable that service |

You do **not** need to grant every permission for basic chat. Mic + network are the minimum for talking to ETA. Overlay and location only when you want those features.

---

## Pre-install checklist

Do these **before** you rely on ETA day to day:

1. **Install the APK** built from this project (GitHub Actions → **Build Aether APK**, prefer the `new-branch-one` branch while features are in testing).
2. **Host / deploy the web app** (e.g. Vercel) so the phone has a live `https://…` site to connect to. The APK is a shell; the assistant logic runs on that site.
3. **Set server environment variables** on the host (not on the phone):
   - `AETHER_ACCESS_CODE` (or `AETHER_ACCESS_CODES`) — long secret, 16+ characters  
   - `AETHER_PROVIDER` — e.g. `groq` or `xai`  
   - Matching API key (`GROQ_API_KEY` or `XAI_API_KEY`)
4. **Open the app once** → connect to your site URL → enter the **same access code** in Settings (unless it was baked into the APK).
5. **Allow microphone** when prompted.
6. For the **floating hotkey**: allow **Display over other apps** (and notifications if Android asks).
7. For **location** features: allow location while using the app (or as you prefer).
8. Optional: enable the **Accessibility** service only if you want Home/Back/lock-style controls.

Until the hosted site deploys successfully, the phone may still hit an old or broken backend. Fix Vercel (or your host) first, then reinstall or reopen the app.

---

## Branches (for developers)

| Branch | Role |
|--------|------|
| `main` | Store / stable path |
| `new-branch-one` | Active feature work (overlay, home UI, branding) |
| `new-branch-two` | Spare test branch |

Prefer testing new UI and overlay builds from **`new-branch-one`** before promoting to `main`.

---

## Privacy note

Voice and chat go to your configured **online** AI provider so ETA can answer and speak. Device commands (flashlight, open app, etc.) run on the phone. Use a strong access code and do not share your deploy URL + code publicly.

---

**ETA — Your Everyday Task Assistant**
