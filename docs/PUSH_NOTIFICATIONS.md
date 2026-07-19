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
   - Add iOS app with your bundle id (`com.simvest.myapp`) → upload **APNs key** (.p8) in Firebase → download `GoogleService-Info.plist` into `ios/App/App/` (App target). **Do not invent a placeholder plist** — the file must come from Firebase. See the iOS checklist below.
   - Create a **service account** with Firebase Cloud Messaging → download JSON.
   - On Render, set env var **`FIREBASE_SERVICE_ACCOUNT_JSON`** to the **entire** JSON file contents (one line is fine).

3. Redeploy the API after env vars are set. Logs will warn if native push is not configured.

## iOS (App Store / TestFlight) — exact checklist

Do these in order. Nothing below invents secrets; every key/file comes from Apple or Firebase.

1. **Firebase iOS app**
   - Firebase Console → Project settings → Add app → iOS.
   - Bundle ID must match Xcode: `com.simvest.myapp`.
   - Download **`GoogleService-Info.plist`** from Firebase (real values only).

2. **Add plist to the Xcode App target**
   - Place at `ios/App/App/GoogleService-Info.plist`.
   - In Xcode: add to the **App** target → **Copy Bundle Resources** (same group as `AppDelegate.swift`).
   - Do **not** commit a fake/placeholder plist with invented API keys.

3. **APNs key → Firebase**
   - Apple Developer → Certificates, Identifiers & Keys → Keys → create an **Apple Push Notifications service (APNs)** key (.p8).
   - Firebase Console → Project settings → Cloud Messaging → Apple app configuration → upload the APNs key (Key ID + Team ID + .p8).
   - Upload the **same** `.p8` under **Production** APNs auth key as well as Development — TestFlight/App Store builds need the Production slot (Development-only shows "No production APNs auth key").

4. **Push capability + entitlements (in repo)**
   - Xcode **Signing & Capabilities** → **Push Notifications** enabled.
   - Repo wiring:
     - Debug builds: `App/App.entitlements` → `aps-environment` = **development**
     - Release / Archive / TestFlight / App Store: `App/App.Release.entitlements` → `aps-environment` = **production**
   - `CODE_SIGN_ENTITLEMENTS` in `project.pbxproj` points Debug → `App.entitlements`, Release → `App.Release.entitlements`.
   - `Info.plist` includes `UIBackgroundModes` → `remote-notification`.

5. **Firebase iOS SDK (when enabling FCM on device)**
   - Exact Xcode clicks: `docs/IOS_FIREBASE_XCODE_STEPS.md`.
   - Link **FirebaseCore** + **FirebaseMessaging** to the **App** target (SPM: `https://github.com/firebase/firebase-ios-sdk`). Do not edit CapApp-SPM.
   - `AppDelegate.swift` already:
     - Calls `FirebaseApp.configure()` only when `GoogleService-Info.plist` is in the bundle (`#if canImport(FirebaseCore)`).
     - Forwards the APNs device token to FCM and posts Capacitor register success/failure notifications (`#if canImport(FirebaseMessaging)`).

6. **Permission + token registration in the JS app**
   - After login, `@capacitor/push-notifications` requests permission and registers (see `src/push/registerSimvestPush.ts`).

7. **TestFlight / App Store test**
   - Archive a **Release** build (production `aps-environment`).
   - Install via TestFlight on a physical device.
   - Confirm the device token reaches your API and a test push (e.g. like/comment or stock alert) appears in the tray when the app is backgrounded/closed.
   - Server must have `FIREBASE_SERVICE_ACCOUNT_JSON` set (step 2 under Server above).

### iOS checklist (in-repo vs manual)

| Item | Status |
|------|--------|
| `App.entitlements` (Debug = development) | In repo |
| `App.Release.entitlements` (Release = production) | In repo |
| `CODE_SIGN_ENTITLEMENTS` Debug / Release | In repo (`project.pbxproj`) |
| `UIBackgroundModes` → `remote-notification` | In repo (`Info.plist`) |
| Camera / photo library usage strings | In repo (`Info.plist`) |
| `AppDelegate` Capacitor + optional Firebase token bridge | In repo |
| `GoogleService-Info.plist` | In repo (`ios/App/App/`, App target Resources) |
| Firebase iOS SDK (Core + Messaging) | **You add** in Xcode — see `docs/IOS_FIREBASE_XCODE_STEPS.md` |
| APNs key uploaded to Firebase | **You do** in Apple Developer + Firebase Console |
| TestFlight push smoke test | **You do** on a physical device |

## Android (Play Store)

1. `google-services.json` in `android/app/` (see above).
2. Android 13+: the app requests `POST_NOTIFICATIONS` at runtime via Capacitor.
3. Release build: `npm run cap:sync:release` then bundle as usual.

## Local testing

- **Browser:** `npm run dev` → allow notifications when prompted (after login or “Notify me” on a post).
- **Emulator/device:** needs Firebase files + `FIREBASE_SERVICE_ACCOUNT_JSON` on the machine running the API, and `VITE_API_ORIGIN` pointing at that API in `.env.capacitor`.

Stock move alerts run on the server every **20 minutes** when `MASSIVE_API_KEY` is set.
