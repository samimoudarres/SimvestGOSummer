import { apiPublicOrigin, isCapacitorShell } from './apiPublicOrigin'

/** Console hint when running inside Capacitor — logs resolved API origin once. */
export function warnIfNativeWithoutApiOrigin(): void {
  if (!isCapacitorShell()) return
  const origin = apiPublicOrigin()
  if (!origin) {
    console.error(
      '[simvest] Native shell has no API origin — home/join/settings will not load. Run `npm run dev:server` on your PC.',
    )
    return
  }
  const fromEnv =
    typeof import.meta.env.VITE_API_ORIGIN === 'string' && import.meta.env.VITE_API_ORIGIN.trim().length > 0
  console.info('[simvest] Native API origin:', origin, fromEnv ? '(from VITE_API_ORIGIN)' : '(dev default)')
}
