/**
 * Runs `fn` whenever the document becomes visible again. Browsers throttle `setInterval`
 * heavily in background tabs; this refetches as soon as the user returns to the app.
 */
export function onDocumentVisible(fn: () => void): () => void {
  const handler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fn()
    }
  }
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}
