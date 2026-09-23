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
| **Voice** | Speak replies with online TTS; choose voice styles in Settings |
| **Overlay** | Floating logo bubble over other apps — speak or type without opening the full app |

Not every phone allows every action the same way (OEM settings differ). When something needs a system permission, ETA should ask or point you to Settings instead of pretending it worked.

---

## Permissions you should allow

Grant these when Android asks, or later under **Settings → Apps → E.T.A / ETA → Permissions**:

| Permission | Why |
|------------|-----|
| **Microphone** | Voice commands |
| **Internet / Network** | Chat, speech-to-text, text-to-speech (online) |
| **Location** (optional but useful) | “Where am I?” and place-related requests |
| **Display over other apps** | Floating hotkey bubble |
| **Notifications** | Overlay service status on newer Android |
| **Modify system settings** (optional) | Brightness on some devices |
| **Accessibility** (optional) | Home / Back / Recents / Lock-style actions |

Mic + network are the minimum. Overlay and location only when you want those features.

---

## Pre-install checklist (phone user)

You do **not** enter an access code. Unlocking the server is built into the release APK as an invisible security feature.

1. **Install the APK** from GitHub Actions → **Build Aether APK** (prefer branch `new-branch-one` while testing). Size can land around **15–30 MB** depending on assets — that is expected.
2. Open the app once and **allow microphone** (and overlay / location if you want those).
3. Optional: set ETA as digital assistant; enable Accessibility only if you want Home/Back/lock controls.

If the app cannot talk to the server, the person who hosts the site needs to fix deploy + secrets (below) — not something you type into Settings.

---

## Deployer setup (you host the brain — not for end users)

The APK is a shell. The assistant runs on your hosted site (e.g. Vercel).

### Server (Vercel / host)

Set the **same** secret in both places:

| Variable | Role |
|----------|------|
| `AETHER_ACCESS_CODE` | Long secret (16+ chars). Server refuses requests without it. |
| `AETHER_PROVIDER` | e.g. `groq` or `xai` |
| `GROQ_API_KEY` or `XAI_API_KEY` | Matching provider key |

Generate a code: `openssl rand -base64 24`

### APK build (GitHub secrets)

| Secret | Role |
|--------|------|
| `AETHER_SITE_URL` | Your live site origin, e.g. `https://your-app.vercel.app` (no path) |
| `AETHER_ACCESS_CODE` | **Exactly the same** value as on the server |
| Signing secrets | Optional; otherwise a one-off key is generated per build |

The workflow **fails** if `AETHER_ACCESS_CODE` is missing so a broken APK without unlock is not published.

At build time the code is compiled into the APK (`BuildConfig.ACCESS_CODE`). On open, the app hands it to the web layer over the native bridge. **No Settings field, no paste step.**

Treat the APK as private: anyone with your APK can call *your* server the same way the app does.

---

## Branches (for developers)

| Branch | Role |
|--------|------|
| `main` | Store / stable path |
| `new-branch-one` | Active feature work |
| `new-branch-two` | Spare test branch |

---

## Privacy note

Voice and chat go to your configured **online** AI provider. Device commands run on the phone. Do not publish your deploy URL + access code or public APK builds that embed a production secret if the server is meant to stay private.

---

**ETA — Your Everyday Task Assistant**
