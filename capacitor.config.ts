import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.simvest.app',
  appName: 'Simvest',
  webDir: 'dist',
  /* Deep blue near headers — reduces white flash before WebView paints */
  backgroundColor: '#07406a',
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
  },
  android: {
    /* Needed when WebView loads via HTTPS (`androidScheme`) but the dev API is HTTP on the host. */
    allowMixedContent: true,
  },
  server: {
    /* Secure-context-friendly default on Android WebView (Capacitor default is https) */
    androidScheme: 'https',
    cleartext: false,
    hostname: 'localhost',
    /*
     * LAN live reload (dev only): add `url` + `cleartext: true` here — see README Phase 5.
     */
  },
}

export default config
