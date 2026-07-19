# App Links / Universal Links (join URLs)

Production join links use the Render API host (same origin as legal pages and the SPA when `SIMVEST_SERVE_DIST` is on):

`https://simvest-api.onrender.com/join?code=123456`

## Client / native

- **Android:** `AndroidManifest.xml` App Links intent-filter (`autoVerify`) for host `simvest-api.onrender.com`, path prefix `/join`.
- **iOS:** Associated Domains entitlement `applinks:simvest-api.onrender.com` (Debug + Release).
- **Share URLs:** `buildJoinGameUrl` prefers the HTTPS API origin (not `https://localhost` inside Capacitor).
- **Runtime:** Capacitor `appUrlOpen` / launch URL → in-app `/join?code=…` (same event bridge as push nav).

## Well-known files (Express)

| URL | Purpose |
| --- | --- |
| `https://simvest-api.onrender.com/.well-known/assetlinks.json` | Android Digital Asset Links |
| `https://simvest-api.onrender.com/.well-known/apple-app-site-association` | Apple Universal Links |
| `https://simvest-api.onrender.com/apple-app-site-association` | Alternate AASA path |

Implemented in `server/appLinksWellKnown.ts`.

### Android SHA-256 (required for verification)

1. Play Console → your app → **App integrity** → **App signing** → copy **SHA-256 certificate fingerprint**.
2. On Render, set env **`ANDROID_APP_LINK_SHA256`** to that value (colon-separated hex). Multiple certs: comma-separated.
3. Redeploy. Do **not** invent a fingerprint; empty `sha256_cert_fingerprints` means App Links stay unverified (HTTP opens the browser until set).

### Apple Team ID (required for Universal Links)

1. [Apple Developer](https://developer.apple.com/account) → Membership → **Team ID**.
2. Set Render env **`APPLE_TEAM_ID`** (10-character id). Redeploy so AASA serves `TEAMID.com.simvest.myapp`.
3. Until set, AASA uses a `TEAMID.` placeholder and iOS will not verify.

### Residuals

- Guest deep-link → login may drop `?code=` (auth gate only stores pathname historically); logged-in cold/warm open works.
- Mac/Xcode Firebase SPM is out of scope for this phase (see push docs).
