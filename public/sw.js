/* Simvest — minimal Web Push handler (paired with server `web-push` + VAPID keys). */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* ignore */
  }
  const title = typeof data.title === 'string' && data.title.length > 0 ? data.title : 'Simvest'
  const body = typeof data.body === 'string' && data.body.length > 0 ? data.body : 'New activity'
  const url = typeof data.url === 'string' && data.url.length > 0 ? data.url : '/'
  event.waitUntil(self.registration.showNotification(title, { body, data: { url } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/'
  event.waitUntil(self.clients.openWindow(url))
})
