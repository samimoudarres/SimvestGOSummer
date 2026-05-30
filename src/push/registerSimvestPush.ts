import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { simvestFetch } from '../api/simvestFetch'
import { registerSimvestWebPushIfPossible } from '../feed/registerSimvestWebPush'
import { bindSimvestPushNavigation } from './simvestPushNavigation'

let nativeListenersBound = false

function bindNativePushListenersOnce(): void {
  if (nativeListenersBound || !Capacitor.isNativePlatform()) return
  nativeListenersBound = true
  bindSimvestPushNavigation()
  void PushNotifications.addListener('registration', (ev) => {
    const token = ev.value?.trim()
    if (!token) return
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
    void simvestFetch('/api/me/push/native-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform }),
    })
  })
  void PushNotifications.addListener('registrationError', () => {
    /* permission denied or missing Firebase config */
  })
}

async function requestNativePushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  bindNativePushListenersOnce()
  let perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'prompt') {
    perm = await PushNotifications.requestPermissions()
  }
  if (perm.receive !== 'granted') return false
  await PushNotifications.register()
  return true
}

export type SimvestPushRegisterResult =
  | { ok: true; native: boolean; web: boolean }
  | { ok: false; reason: string }

/**
 * Register this device for push: Web Push in browsers, FCM/APNs on Capacitor iOS/Android.
 */
export async function registerSimvestPushIfPossible(): Promise<SimvestPushRegisterResult> {
  let web = false
  let native = false
  if (Capacitor.isNativePlatform()) {
    native = await requestNativePushPermission()
    const wr = await registerSimvestWebPushIfPossible()
    web = wr.ok
  } else {
    const wr = await registerSimvestWebPushIfPossible()
    web = wr.ok
    if (!wr.ok && wr.reason === 'denied') return { ok: false, reason: 'denied' }
  }
  if (native || web) return { ok: true, native, web }
  return { ok: false, reason: 'unsupported' }
}
