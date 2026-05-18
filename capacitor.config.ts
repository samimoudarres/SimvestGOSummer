import type { CapacitorConfig } from '@capacitor/cli'

/** Set by `npm run cap:sync` / `build:capacitor:local` so dev API images are not mixed-content blocked. */
const useHttpWebViewScheme = process.env.CAPACITOR_HTTP_SCHEME === '1'

const config: CapacitorConfig = {
  appId: 'com.simvest.myapp',
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
    /* Local dev: HTTP WebView + HTTP API avoids mixed-content blocking `<img src>` to 10.0.2.2 */
    androidScheme: useHttpWebViewScheme ? 'http' : 'https',
    iosScheme: useHttpWebViewScheme ? 'http' : 'https',
    cleartext: useHttpWebViewScheme,
    hostname: 'localhost',
    /*
     * LAN live reload (dev only): add `url` + `cleartext: true` here — see README Phase 5.
     */
  },
}

export default config
