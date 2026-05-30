# Push notifications — what you need to do (about 15 minutes)

Everything else is automated. You only sign in to Google and Render once, download **3 small files**, drop them in a folder, then ask Cursor to run one command.

---

## Part A — Google Firebase (phone notifications)

### A1. Open Firebase

1. In your browser, go to: **https://console.firebase.google.com/**
2. Sign in with the **same Google account** you use for Google Play (if asked).

### A2. Create a project

1. Click **“Add project”** (or **“Create a project”**).
2. **Project name:** type `Simvest` → click **Continue**.
3. If asked about Google Analytics: turn it **OFF** (optional) → **Continue** → **Create project**.
4. Wait until it says “Your new project is ready” → click **Continue**.

### A3. Add the Android app

1. On the project home page, click the **Android** icon (robot).
2. **Android package name:** copy-paste exactly:
   ```
   com.simvest.myapp
   ```
3. **App nickname:** `Simvest` (anything is fine).
4. Click **Register app**.
5. Click **Download google-services.json**.
6. Save the file. Then **rename or copy** it to this folder with this **exact** name:
   ```
   Summer2026SimvestGO\setup-input\google-services.json
   ```
   (Your project folder path may be `Projects\Summer2026SimvestGO\setup-input\`.)
7. Click **Next** → **Next** → **Continue to console** (you can skip the SDK steps).

### A4. Server key (so Render can send notifications)

1. Click the **gear icon** next to “Project Overview” → **Project settings**.
2. Open the **Service accounts** tab.
3. Click **Generate new private key** → **Generate key**.
4. A `.json` file downloads. Move it to:
   ```
   setup-input\firebase-service-account.json
   ```
   (Rename it to **firebase-service-account.json** if the download has a long name.)

---

## Part B — Render (your live API)

### B1. API key (one line)

1. Go to: **https://dashboard.render.com/u/settings#api-keys**
2. Sign in if needed.
3. Click **Create API Key** → name it `simvest-push` → **Create**.
4. **Copy** the key (starts with `rnd_`).
5. Open Notepad, paste the key **alone on one line**, save as:
   ```
   setup-input\render-api-key.txt
   ```

---

## Part C — Tell Cursor to finish (you do nothing technical)

When all **3 files** are in `setup-input\`:

1. In Cursor chat, send:
   ```
   Please run: node scripts/completePushSetup.mjs
   ```
2. Wait until it says **“Push setup complete”** and shows the path to `app-release.aab`.

---

## Part D — Google Play (upload new version)

1. Go to **Google Play Console** → your app → **Production** (or testing track).
2. **Create new release** → upload the new **app-release.aab** from the message above.
3. Under **App content** → **Privacy policy**, confirm the URL is:
   ```
   https://simvest-api.onrender.com/legal/privacy-policy.html
   ```
4. Submit for review.

---

## Optional — iPhone (later)

iPhone needs an Apple Developer account ($99/year) and extra steps in Xcode. Android + browser testing works first. See `docs/PUSH_NOTIFICATIONS.md` when you are ready for iOS.

---

## Troubleshooting

| Problem | What to do |
|--------|------------|
| “Missing setup-input/…” | Check the 3 filenames match exactly (see `setup-input/README.txt`). |
| Play upload rejected | Use the new `.aab` from the script, not an old file. |
| No notifications on phone | Uninstall old Simvest, install the new build, log in, tap **Allow** when asked for notifications. |
