/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public HTTPS origin for `/api` (no trailing slash). See `.env.example`. */
  readonly VITE_API_ORIGIN?: string
}
