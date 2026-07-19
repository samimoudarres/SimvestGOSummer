/** User-facing message for a failed fetch (timeout / offline / generic). */
export function networkErrorMessage(err?: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.'
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Request timed out. Please try again.'
  }
  if (err instanceof Error && /aborted|timeout/i.test(err.message)) {
    return 'Request timed out. Please try again.'
  }
  return 'Network error. Please try again.'
}
