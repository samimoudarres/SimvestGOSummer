# iOS App Store submission checklist (Simvest)

Use this with [App Store Review Guidelines](https://developer.apple.com/App-store/review/guidelines/) when submitting **Simvest** (`com.simvest.myapp`).

## Build & release

1. Set `VITE_API_ORIGIN` in `.env.capacitor` to your **HTTPS** production API (e.g. `https://simvest-api.onrender.com`).
2. Run `npm run cap:sync:release`.
3. Open `ios/App/App.xcworkspace` in Xcode, select **Any iOS Device**, **Product → Archive**, upload to App Store Connect.
4. Version: align **Marketing Version** / **Build** with Android if shipping together (currently **1.0.7** / build **9**).

## App Store Connect metadata (required)

| Field | Value |
|--------|--------|
| Privacy Policy URL | `https://simvest-api.onrender.com/legal/privacy-policy.html` |
| Terms of Service (optional but recommended) | `https://simvest-api.onrender.com/legal/terms-of-service.html` |
| Account deletion URL | `https://simvest-api.onrender.com/legal/delete-account.html` |
| Age rating | Likely **12+** (simulated finance; no real gambling) — complete the questionnaire honestly |
| Category | Finance or Education |
| Export compliance | **No** custom encryption (`ITSAppUsesNonExemptEncryption` = false in Info.plist) |

## Review notes (paste into “Notes for reviewer”)

```
Simvest is a simulated stock-trading game for friends. No real money, deposits, or withdrawals.

Test account (create via Sign up in app, or use):
- Email/phone: [provide a test account you create]
- Password: [test password]

Account deletion: Settings → Delete account (password required).
Camera: Join Game → Scan QR Code (optional; only used to read join codes).

Market data is for simulation only, not investment advice.
```

## In-app compliance (implemented in code)

- **5.1.1(v) Account deletion**: Settings → **Delete account** (password + confirmation).
- **5.1.1 Privacy**: Privacy Policy + Terms accessible at signup/login; privacy policy URL on store listing.
- **Simulation disclosure**: Settings legal note + Trade screen disclaimer; terms/privacy describe virtual funds.
- **Camera (QR join)**: `NSCameraUsageDescription` in Info.plist.
- **ATS**: HTTPS only for production API (`NSAllowsArbitraryLoads` = false).
- **No third-party login** (email/phone + password only) — Sign in with Apple not required.

## Before you submit — smoke test on a real iPhone

- [ ] Sign up, log in, log out
- [ ] Join/create game, place simulated trade
- [ ] Settings → Delete account on a **throwaway** test user
- [ ] Join Game → Scan QR (grant camera when prompted)
- [ ] Privacy Policy and Terms modals open from login/signup
- [ ] App works on notched device (safe areas); home screen scrolls full page

## Common rejection causes (avoid)

- Missing in-app account deletion
- Privacy policy URL broken or generic
- App described as real trading / broker
- Camera used without usage string
- Broken login or empty Trade screen on production API
