# Phase 7 — QA matrix (web ↔ Capacitor parity)

Use this checklist before treating a release as “mobile-ready.” Mark **Pass / Fail / N/A** and note device OS builds.

---

## A. Automated gates (run on every candidate build)

Run from repo root:

```bash
npm run qa:phase7-automation
```

This executes:

1. **`npm run build`** — TypeScript + production Vite bundle.
2. **`npm run test:ledger`** — In-process trade → portfolio → perform assertions (no HTTP server).
3. **`npm run test:join-invite`** — Game definition sanity checks (optional HTTP invite probe if `TEST_BASE` is set).

Optional HTTP integration (requires API listening, game slug + data present):

```bash
# Terminal A: API up (example)
npx tsx server/index.ts

# Terminal B:
set SIMVEST_API=http://127.0.0.1:3001   # PowerShell: $env:SIMVEST_API='http://127.0.0.1:3001'
npm run test:trade

# Join invite endpoint smoke (definitions-only passes without server):
set TEST_BASE=http://127.0.0.1:3001
npm run test:join-invite
```

Then sync native shells:

```bash
npm run cap:sync
```

**Release-shaped bundle (fail-fast if API origin missing):** copy `.env.capacitor.example` → `.env.capacitor`, set `VITE_API_ORIGIN`, then:

```bash
npm run cap:sync:release
```

---

## B. Staging Web (same checks as production URL later)

**Environment:** Staging URL with HTTPS, SPA + `/api` same origin **or** documented split origins + CORS.

| # | Scenario | Steps | Expected |
|---|-----------|-------|----------|
| B1 | Cold load | Open staging `/` in private window | Home loads; no blank shell |
| B2 | Login | Log in with test account | Lands on home; refresh keeps session behavior you designed |
| B3 | Logout / session | Clear site data → revisit `/login` | No ghost `/api` errors in network tab for anonymous flows |
| B4 | Signup | Full signup path | Account works; merge/anonymous behavior unchanged |
| B5 | Deep route | Direct URL `/g/<slug>/trade` (valid slug) | Shell + trade UI; no redirect loop |
| B6 | Trade | Buy/sell in a test game | Portfolio + activity update |
| B7 | Feed / composer | Post text (and poll if enabled) | Appears in feed; no 401 loops |
| B8 | Leaderboard / perform | Open tabs | Data matches server |
| B9 | Stock detail | `/stock/AAPL` | Chart loads or graceful error if market API down |
| B10 | Offline | DevTools → Offline → trigger feed refresh | User-visible error; app doesn’t white-screen |
| B11 | Legal | Open Privacy + Terms modals | Text loads from `/legal/*.txt` |

**Browsers:** Safari (iOS), Chrome (Android), plus one desktop browser baseline.

---

## C. Capacitor — bundled release-shaped build

**Prepare:** `VITE_API_ORIGIN=https://your-staging-host` (no trailing slash), typically via `.env.capacitor`, then:

```bash
npm run cap:sync:release
```

Open **`ios/`** in Xcode or **`android/`** in Android Studio; run on **physical devices** (simulators miss some WebView + safe-area edge cases).

| # | Scenario | Expected |
|---|-----------|----------|
| C1 | First launch | Splash → app; status bar matches blue chrome |
| C2 | API reachability | Network tab / logs: `/api` hits **`VITE_API_ORIGIN`**, not `capacitor://` relative failures |
| C3 | Login / signup | Same outcomes as web staging |
| C4 | Hardware back (Android) | Back navigates within app; at root exits or matches your intent |
| C5 | Safe areas | No clipped fixed bars; legal modal scrolls fully |
| C6 | Keyboard | Focus password field; content resizes (`adjustResize`) — inputs stay usable |
| C7 | Background / resume | App restores without infinite reload |

---

## G. Store-launch device matrix (Wave C)

Run on **physical** iPhone (notch) + Android before App Store / Play submit. Mark Pass / Fail.

| # | Scenario | Steps | Expected |
|---|-----------|-------|----------|
| G1 | Status bar / safe area | Cold open home + Activity | Blue status bar; **no double top gap** under notch |
| G2 | Android hardware back | Open invite / buy sheet → Back | Sheet closes first; then history.back |
| G3 | QR join | Scan invite QR on Join | Auto-joins (no “Tap Join” step); camera permission UX ok |
| G4 | Cold kill / reopen | Log in → kill app → reopen | Still logged in; Settings / Following paint from cache then refresh |
| G5 | Browse Public Games | Open from Join on device | Full-bleed (no grey letterbox) |
| G6 | Trade keyboard | Buy sheet → focus qty → keyboard | CTA stays reachable (`100dvh` + keyboard inset) |
| G7 | Stale quotes | Toggle airplane briefly on Trade | Yellow “Prices may be outdated” after failed polls; clears when live |
| G8 | Keep-alive | Confirm GitHub Action **Keep API warm** enabled | `/api/health` pinged ~every 7m (see `.github/workflows/keep-api-warm.yml`) |
| G9 | Admin gate | Visit `/admin` while logged out | Redirected to login (not public SPA shell) |
| G10 | Push failures | Settings → Post alerts → Enable push | Success copy **or** visible error (not silent) |

---

## D. Capacitor — LAN live reload (dev only)

`capacitor.config.ts`: **`server.url`** + **`cleartext: true`** + **`npm run dev`** on PC; **`npx cap sync`**.

Confirm same scenarios as **C** where applicable (API still via Vite proxy to port 3001).

---

## E. Upgrade / regression (when bumping store builds)

| # | Check |
|---|--------|
| E1 | Install build N → use app → install build N+1 from store/internal track → data still correct |
| E2 | No duplicate listeners / memory warnings from StatusBar / App plugins (Xcode Logcat quick scan) |

---

## F. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Tester | | | |
| Staging URL | | | |
| iOS build # | | | |
| Android build # | | | |

**Fail criteria:** Any auth loop, silent `/api` failure on Capacitor without user-visible error, or data loss vs web for the same account.
