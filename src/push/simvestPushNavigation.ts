import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

let bound = false

function navigateToPushUrl(url: string): void {
  const path = url.startsWith('/') ? url : `/${url}`
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('simvest-push-nav', { detail: { url: path } }))
}

function urlFromNotificationData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null
  const raw = data.url
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

/** Open in-app routes when the user taps a native push notification. */
export function bindSimvestPushNavigation(): void {
  if (bound || !Capacitor.isNativePlatform()) return
  bound = true
  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data as Record<string, unknown> | undefined
    const url = urlFromNotificationData(data)
    if (url) navigateToPushUrl(url)
  })
}
