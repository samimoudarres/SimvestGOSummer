/**
 * Best-effort: send the user to the OS place where they can enable notifications.
 * Websites cannot get iOS’s in-app “Open Settings?” alert; this is the closest supported option.
 */

function isLikelyIOS(): boolean {
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function isLikelyAndroid(): boolean {
  return /Android/i.test(navigator.userAgent || '')
}

/** Chrome package when notifications are denied (common Android browser for this app). */
function androidChromePackage(): string {
  const ua = navigator.userAgent || ''
  if (/SamsungBrowser/i.test(ua)) return 'com.sec.android.app.sbrowser'
  if (/EdgA/i.test(ua)) return 'com.microsoft.emmx'
  if (/Firefox/i.test(ua)) return 'org.mozilla.firefox'
  return 'com.android.chrome'
}

/**
 * Open system Settings toward app / browser notifications (platform-dependent).
 * Call from a direct tap handler when possible.
 */
export function openOsNotificationSettings(): void {
  try {
    if (isLikelyIOS()) {
      // Opens the Settings app; user then enables notifications for Safari or this web app.
      window.location.assign('app-settings:')
      return
    }
    if (isLikelyAndroid()) {
      const pkg = androidChromePackage()
      const intent = `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${pkg};end`
      window.location.assign(intent)
      return
    }
    // Desktop: no universal “notification settings” URL; user uses browser UI.
  } catch {
    /* ignore */
  }
}
