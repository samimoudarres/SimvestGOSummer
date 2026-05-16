import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

let registered = false

/**
 * Android hardware back → WebView history; when the stack cannot go back, exit the activity.
 * No-op on web and iOS (iOS has no equivalent global back).
 */
export function registerCapacitorNativeChromeListeners(): void {
  if (registered || typeof window === 'undefined') return
  if (!Capacitor.isNativePlatform()) return
  registered = true

  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      void CapacitorApp.exitApp()
    }
  })

  void CapacitorApp.addListener('resume', () => {
    try {
      window.dispatchEvent(new CustomEvent('simvest:native-app-resume'))
    } catch {
      /* ignore */
    }
  })
}
