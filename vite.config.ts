import { spawn, type ChildProcess } from 'node:child_process'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** When Vite runs without `npm run dev`, start the Express API so `/api` proxy does not 502. */
function simvestDevApiPlugin(apiTarget: string): Plugin {
  let child: ChildProcess | null = null
  const healthUrl = `${apiTarget.replace(/\/$/, '')}/api/health`

  async function apiUp(): Promise<boolean> {
    try {
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) })
      return r.ok
    } catch {
      return false
    }
  }

  async function ensureApi(): Promise<void> {
    if (process.env.SIMVEST_DEV_API_EXTERNAL === '1') return
    if (await apiUp()) return

    console.log('[simvest] API not on :3001 — starting `npm run dev:server`…')
    child = spawn('npm run dev:server', {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
      env: process.env,
    })

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (await apiUp()) {
        console.log('[simvest] API ready.')
        return
      }
    }
    console.warn('[simvest] API still not reachable — Activity may show 502 until the server is up.')
  }

  return {
    name: 'simvest-dev-api',
    apply: 'serve',
    async configureServer() {
      await ensureApi()
      return () => {
        if (process.env.SIMVEST_DEV_API_EXTERNAL === '1') return
        if (child) {
          child.kill('SIGTERM')
          child = null
        }
      }
    },
    async configurePreviewServer() {
      await ensureApi()
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /* Avoid hard-coding host assumptions — Docker/WSL/DNS-local stacks can override via `.env`. */
  const apiProxyTarget = env.SIMVEST_API_PROXY_TARGET?.trim() || 'http://127.0.0.1:3001'

  if (mode === 'capacitor' || mode === 'capacitor-dev') {
    const origin = typeof env.VITE_API_ORIGIN === 'string' ? env.VITE_API_ORIGIN.trim().replace(/\/+$/, '') : ''
    if (!origin) {
      throw new Error(
        mode === 'capacitor-dev'
          ? '[simvest] Missing VITE_API_ORIGIN for capacitor-dev — use committed `.env.capacitor.dev` or set VITE_API_ORIGIN=http://10.0.2.2:3001'
          : '[simvest] Capacitor release build: create `.env.capacitor` from `.env.capacitor.example` and set VITE_API_ORIGIN (HTTPS API host only, no /api suffix).',
      )
    }
    if (mode === 'capacitor' && !/^https:\/\//i.test(origin)) {
      console.warn(
        '[simvest] VITE_API_ORIGIN should normally use https:// for store / production native builds (got: ' +
          origin.slice(0, 48) +
          ').',
      )
    }
    if (/\/api\/?$/i.test(origin)) {
      throw new Error('[simvest] VITE_API_ORIGIN must not end with /api — use the host origin only.')
    }
  }

  const capacitorBundle = mode === 'capacitor' || mode === 'capacitor-dev'

  return {
    /* Web dev + Render: root-relative `/figma-assets/...`. Capacitor WebView needs `./`. */
    base: capacitorBundle ? './' : '/',
    plugins: [react(), simvestDevApiPlugin(apiProxyTarget)],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
