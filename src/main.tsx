import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { logDevApiOriginMisconfiguration } from './config/apiPublicOrigin'
import { warnIfNativeWithoutApiOrigin } from './config/nativeApiDiagnostics'
import { registerCapacitorNativeChromeListeners } from './capacitor/registerPhase5Listeners'
import './nativeViewport.css'
import './style.css'

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('sv-capacitor')
}
logDevApiOriginMisconfiguration()
warnIfNativeWithoutApiOrigin()
registerCapacitorNativeChromeListeners()
void import('./push/simvestPushNavigation').then((m) => m.bindSimvestPushNavigation())
void import('./capacitor/registerPhase6Chrome').then((m) => {
  void m.configureNativeStatusBar()
})

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
