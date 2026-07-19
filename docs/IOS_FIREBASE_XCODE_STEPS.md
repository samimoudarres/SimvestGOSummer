# iOS Firebase SDK (Xcode SPM)

`GoogleService-Info.plist` is already in the App target at `ios/App/App/GoogleService-Info.plist` (Copy Bundle Resources).

Do **not** edit `ios/App/CapApp-SPM/Package.swift` — Capacitor manages that file. Add Firebase to the **App** Xcode target only.

## Add FirebaseCore + FirebaseMessaging

1. On a Mac, open `ios/App/App.xcodeproj` in Xcode.
2. **File → Add Package Dependencies…**
3. Paste: `https://github.com/firebase/firebase-ios-sdk`
4. Dependency rule: **Up to Next Major Version** (Xcode’s default is fine).
5. Click **Add Package**.
6. In the product list, check only:
   - **FirebaseCore**
   - **FirebaseMessaging**
7. Add to target: **App** (not CapApp-SPM).
8. Click **Add Package**.

Skip **FirebaseAnalytics** unless you intentionally need Analytics.

## Confirm plist target membership

1. In the Project navigator, select `GoogleService-Info.plist` under the **App** group.
2. File inspector → **Target Membership** → **App** checked.
3. **Build Phases → Copy Bundle Resources** should list `GoogleService-Info.plist`.

## Build check

1. Product → Clean Build Folder, then build for a physical device.
2. `AppDelegate` already calls `FirebaseApp.configure()` / APNs→FCM when `FirebaseCore` / `FirebaseMessaging` are linkable (`#if canImport(...)`).
3. After a successful run, confirm a push token registers with your API (see `docs/PUSH_NOTIFICATIONS.md`).
