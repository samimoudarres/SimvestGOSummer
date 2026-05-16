import { Capacitor } from '@capacitor/core'
import { apiPublicOrigin } from './apiPublicOrigin'

/** Console hint when running inside Capacitor without a baked-in API origin. */
export function warnIfNativeWithoutApiOrigin(): void {
  try {
    if (!Capacitor.isNativePlatform()) return
  } catch {
    return
  }
  const origin = apiPublicOrigin()
  if (!origin) {
    console.warn(
      '[simvest] Native bundle has no API origin — set VITE_API_ORIGIN before build or use a supported platform fallback (Android emulator / iOS Simulator).',
    )
    return
  }
  const envRaw = import.meta.env.VITE_API_ORIGIN
  const fromEnv = typeof envRaw === 'string' && envRaw.trim().length > 0
  if (!fromEnv && import.meta.env.DEV) {
    console.info('[simvest] Native dev API origin (fallback):', origin)
  }
}
