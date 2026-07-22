import { Capacitor } from '@capacitor/core'

/**
 * Phase 6: status bar sits *above* the WebView (non-overlay) with Simvest blue chrome.
 * Dynamic import keeps `@capacitor/status-bar` out of the web JS bundle.
 *
 * Pair with `nativeViewport.css`: Capacitor roots use `padding-top: 0` so we do not
 * double-count `env(safe-area-inset-top)` on top of the non-overlay inset.
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
