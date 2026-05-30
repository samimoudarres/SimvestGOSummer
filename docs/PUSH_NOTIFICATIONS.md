# Push notifications (Simvest)

Simvest sends **system push notifications** (notification tray on iOS/Android) and **Web Push** in supported browsers.

## What users receive

| Event | Who gets it | Tap opens |
|--------|-------------|-----------|
| New activity post in a game | All members of that game (except the author) | Game feed |
| Like on your post | Post author | Game feed |
| Comment on your post | Post author | Game feed |
| Join request (private game) | Host | Join requests screen |
| Player joined (public or approved) | Host | Game feed |
| Holding moves ≥5% today or ≥10% over ~5 sessions | Player with shares in that game | Stock detail |
| Watched stock moves (same thresholds) | User who followed the ticker in any game | Stock detail |

Author “Notify me” on a feed post still adds **extra** alerts when that author posts (same push pipeline).

## Server (Render / production)

1. **Web Push (optional for PWA):** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` or let the server generate keys under `SIMVEST_DATA_DIR/vapid-keys.json`.

2. **Native iOS/Android (required for phone tray alerts):** create a [Firebase](https://console.firebase.google.com/) project and:
   - Add Android app `com.simvest.myapp` → download `google-services.json` → place at `android/app/google-services.json`.
   - Add iOS app with your bundle id → upload **APNs key** (.p8) in Firebase → download `GoogleService-Info.plist` into the Xcode project (Capacitor iOS `App` target).
   - Create a **service account** with Firebase Cloud Messaging → download JSON.
   - On Render, set env var **`FIREBASE_SERVICE_ACCOUNT_JSON`** to the **entire** JSON file contents (one line is fine).

3. Redeploy the API after env vars are set. Logs will warn if native push is not configured.

## iOS (App Store)

1. In Xcode: **Signing & Capabilities** → **+ Capability** → **Push Notifications**.
2. Apple Developer → Keys → create APNs key → upload to Firebase (step 2 above).
3. Request notification permission on first login (handled in app).

## Android (Play Store)

1. `google-services.json` in `android/app/` (see above).
2. Android 13+: the app requests `POST_NOTIFICATIONS` at runtime via Capacitor.
3. Release build: `npm run cap:sync:release` then bundle as usual.

## Local testing

- **Browser:** `npm run dev` → allow notifications when prompted (after login or “Notify me” on a post).
- **Emulator/device:** needs Firebase files + `FIREBASE_SERVICE_ACCOUNT_JSON` on the machine running the API, and `VITE_API_ORIGIN` pointing at that API in `.env.capacitor`.

Stock move alerts run on the server every **20 minutes** when `MASSIVE_API_KEY` is set.
