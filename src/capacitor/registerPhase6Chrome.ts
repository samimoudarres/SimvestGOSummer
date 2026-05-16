import { Capacitor } from '@capacitor/core'

/**
 * Phase 6: align status bar with Simvest blue chrome (dark icons → light content on blue).
 * Dynamic import keeps `@capacitor/status-bar` out of the web JS bundle.
 */
export async function configureNativeStatusBar(): Promise<void> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#07406a' })
  } catch (err) {
    console.warn('[simvest] StatusBar plugin unavailable:', err instanceof Error ? err.message : err)
  }
}
