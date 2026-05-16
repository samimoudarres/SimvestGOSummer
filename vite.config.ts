import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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

  return {
    /* Relative asset URLs so the production bundle loads inside Capacitor WebView. */
    base: './',
    plugins: [react()],
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
