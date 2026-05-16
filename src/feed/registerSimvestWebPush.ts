/**
 * Best-effort Web Push registration for “notify when this author posts”.
 * Requires `VAPID_*` env on the server and HTTPS (or localhost).
 */
import { simvestFetch } from '../api/simvestFetch'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export type WebPushRegisterResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'no_vapid' | 'denied' | 'subscribe_failed' | 'save_failed' }

export async function registerSimvestWebPushIfPossible(): Promise<WebPushRegisterResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (typeof Notification === 'undefined') return { ok: false, reason: 'unsupported' }
  const before = Notification.permission
  if (before === 'denied') return { ok: false, reason: 'denied' }
  try {
    const vr = await simvestFetch('/api/me/push/vapid-public')
    const body = (await vr.json().catch(() => ({}))) as { publicKey?: string | null }
    const publicKey = typeof body.publicKey === 'string' && body.publicKey.length > 0 ? body.publicKey : null
    if (!publicKey) return { ok: false, reason: 'no_vapid' }

    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    const perm = before === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: 'denied' }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
    const json = sub.toJSON()
    const r = await simvestFetch('/api/me/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    })
    if (!r.ok) return { ok: false, reason: 'save_failed' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'subscribe_failed' }
  }
}
