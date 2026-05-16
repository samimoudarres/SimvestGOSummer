# Simvest

Stock simulation and investing games — React + Vite client, Express API.

## Prerequisites

- **Node.js** 20 or newer (see `package.json` → `engines`). This repo includes `.nvmrc` (`22`) so [nvm](https://github.com/nvm-sh/nvm) users can run `nvm use` to match the environment used for release builds.
- **npm** (comes with Node).

## Install

```bash
npm ci
```

Use `npm install` only when adding dependencies; for repeatable CI/mobile builds, prefer **`npm ci`** with a committed `package-lock.json`.

## Scripts

| Command        | Purpose                                      |
| -------------- | -------------------------------------------- |
| `npm run dev`  | Local dev: API + Vite with `/api` proxy      |
| `npm run build`| Production client bundle → `dist/` (`tsc` + Vite) |
| `npm run preview` | Serve `dist/` on port **4173** — **`/api` proxies** like dev (run API separately). |
| `npm run cap:sync` | **`build:capacitor:local`** (`.env.capacitor-dev` → `http://10.0.2.2:3001`) then `npx cap sync` — run **`npm run dev:server`** on your PC first |
| `npm run build:capacitor` | Same as **`vite build --mode capacitor`** after **`tsc`** — **requires** **`VITE_API_ORIGIN`** via **`.env.capacitor`** (copy **`.env.capacitor.example`**) |
| `npm run cap:sync:release` | **`build:capacitor`** then **`cap sync`** — use this before Xcode / Android Studio release-shaped installs |
| `npm run qa:phase7-automation` | Phase 7 gates: **`build`** + **`test:ledger`** + **`test:join-invite`** (see `docs/mobile-phase7-qa-checklist.md`) |

The **`dist/`** folder is gitignored. It is the static web app synced into **Capacitor** (`ios/`, `android/`).

### Phase 3 — one host for SPA + API (production-shaped)

1. **`npm run build`** — generates **`dist/`**.
2. Run the API with **`SIMVEST_SERVE_DIST=true`** so Express serves **`dist/`** and still handles **`/api/*`** on the **same port**.
   - PowerShell example: `$env:SIMVEST_SERVE_DIST='true'; $env:PORT='3001'; npx tsx server/index.ts`
   - Put TLS (HTTPS) in front with your host’s reverse proxy or platform load balancer.
3. Optional smoke check: open **`http://localhost:3001/`** — you should get the app shell; API routes unchanged.

#### Docker (same Phase 3 shape, reproducible)

Use this when you want a single artifact you can run on any host that supports containers (your cloud provider still terminates HTTPS in front of port **3001**).

1. Install [Docker](https://docs.docker.com/get-docker/).
2. From the repo root:

```bash
docker build -t simvest:latest .
docker run --rm -p 3001:3001 --env-file .env simvest:latest
```

Equivalent using Compose (same image build + **`env_file: .env`**):

```bash
docker compose up --build
```

**Port 3001 already in use** (for example **`npm run dev`**): set **`SIMVEST_DOCKER_PORT`** to another host port (e.g. **`3002`**) before **`docker compose up`**, then open **`http://localhost:3002/`**.

**HTTPS for phones (experimental):** **`docker compose --profile tunnel up -d --build`** also starts a [Try Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/do-more-with-tunnels/trycloudflare/) tunnel to the **`simvest`** service. Check **`docker compose logs tunnel`** for a **`https://*.trycloudflare.com`** URL; put that origin (no **`/api`** suffix) in **`.env.capacitor`** as **`VITE_API_ORIGIN`**, then **`npm run cap:sync:release`**. Quick tunnels are for testing only (URL changes when the tunnel container restarts).

Copy **`.env.example`** → **`.env`** and fill required keys before **`docker run`** / **`docker compose`** (same variables as local API). The image sets **`SIMVEST_SERVE_DIST=true`** and **`NODE_ENV=production`**; **`PORT`** defaults to **3001** inside **`server/index.ts`** unless you override it. To publish a different host port, set **`SIMVEST_DOCKER_PORT`** (maps to container **3001**).

The **`Dockerfile`** runs **`npm run qa:phase7-automation`** during **`docker build`** so the client bundle matches the Phase 7 gates (same as a release candidate build). For a quicker **local-only** image build that skips that gate, use **`docker build --build-arg SKIP_QUALITY_CHECKS=1 ...`** or **`SKIP_QUALITY_CHECKS=1 docker compose build`** (PowerShell: **`$env:SKIP_QUALITY_CHECKS='1'; docker compose build`**), then **`docker compose up`** without **`--build`** if the image is already built.

No UI or route behavior changes in dev: **`npm run dev`** still uses Vite’s **`/api` proxy**; **`VITE_API_ORIGIN`** stays unset.

### Phase 4 — client API wiring (no behavior change in default dev)

- **`simvestFetch`** + **`VITE_API_ORIGIN`** cover every **`/api`** call (including login/signup from Phase 3 and **stock chart bars** polling).
- **`npm run dev`** / **`npm run preview`**: **`/api`** is proxied to **`SIMVEST_API_PROXY_TARGET`** (default **`http://127.0.0.1:3001`**). Override in `.env` if your API listens elsewhere.
- **Production web** with **`SIMVEST_SERVE_DIST`**: leave **`VITE_API_ORIGIN`** unset — requests stay same-origin **`/api`**.
- **Capacitor release builds**: set **`VITE_API_ORIGIN`** to your **HTTPS** API host (no trailing slash, **not** ending in **`/api`**). A console warning appears on native if it’s missing.

### Phase 5 — native runtime defaults (Capacitor hardening)

- **`capacitor.config.ts`**: WebView **backgroundColor**, **iOS** scroll/insets, **Android** `allowMixedContent: false`, **`server.androidScheme: 'https'`**, **`cleartext: false`** (enable **`cleartext` + LAN `server.url`** only for local live reload — never for store builds).
- **`@capacitor/app`**: Android **hardware back** → `history.back()`, or **exit** when the stack cannot go back (`src/capacitor/registerPhase5Listeners.ts`).
- **iOS `Info.plist`**: **ATS** explicitly keeps **`NSAllowsArbitraryLoads`** off (HTTPS APIs + `VITE_API_ORIGIN` align with Phase 3–4).
- **Android manifest**: **`android:usesCleartextTraffic="false"`** — set **`server.cleartext: true`** temporarily when loading **`http://`** LAN Vite for debugging.
- **`index.html`**: **`viewport-fit=cover`** so future safe-area CSS can match notched devices without changing layout yet.

### Phase 6 — mobile UX polish (additive; web unchanged where insets are 0)

- **Safe-area padding**: Every **`padding: 24px 0 48px`** outer phone-frame root now adds **`env(safe-area-inset-*)`** so notch / home indicator / landscape gutters don’t clip the Figma shells on real devices.
- **Fixed overlays** (legal modal, trade sheet, poll/edit flows, compare picker, settings modal, invite sheet, QR scanner): margins respect safe areas; legal modal uses **`100dvh`** height caps.
- **`@capacitor/status-bar`**: Native builds set **non-overlay** status bar, **Dark** style (light icons on blue), **`#07406a`** background — loaded via **dynamic import** so web bundle stays lean.
- **Android**: **`windowSoftInputMode="adjustResize"`** so focused inputs scroll above the keyboard where possible.
- **Global**: **`viewport-fit=cover`** (already on **`index.html`**), **`100dvh`** min-heights for **`#app`** / loading shell, **`-webkit-text-size-adjust: 100%`** to reduce iOS font inflation surprises.

### Phase 7 — QA matrix (parity & regression)

- Run **`npm run qa:phase7-automation`** on every mobile release candidate (client build + in-process ledger + join definitions).
- Full device/browser checklist: **`docs/mobile-phase7-qa-checklist.md`** (web staging, Capacitor bundled & LAN dev, upgrade smoke).
- HTTP trade probe (**`npm run test:trade`**) still requires a **running API** and suitable game fixtures — see that script’s header.

### Mobile shell (Capacitor)

- Native projects live in **`ios/`** and **`android/`** (open in Xcode / Android Studio).
- After UI changes: **`npm run cap:sync`** before opening the IDE or running on a device.
- To load the **live dev server** inside the native app (same Wi‑Fi), set **`server.url`** + **`cleartext: true`** in **`capacitor.config.ts`** (see Phase 5), use your PC’s LAN IP + port **5173**, run **`npm run dev`**, then **`npx cap sync`**.
- **Bundled Capacitor builds** cannot use relative `/api` against your laptop; set **`VITE_API_ORIGIN`** to your **HTTPS public API origin** (same URL as your deployed Express host). **Recommended:** copy **`.env.capacitor.example`** → **`.env.capacitor`**, fill **`VITE_API_ORIGIN`**, then **`npm run cap:sync:release`** so misconfigured store builds fail fast at compile time.

## Lockfile policy

Keep **`package-lock.json` committed**. Pin dependencies so another machine (or App Store build Mac) installs the same tree.

---

_Phases 2–7: through automated QA gates + documented device matrix (`docs/mobile-phase7-qa-checklist.md`)._
