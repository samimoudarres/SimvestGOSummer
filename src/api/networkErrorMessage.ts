/** User-facing message for a failed fetch (timeout / offline / HTTP / generic). */
export function networkErrorMessage(err?: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.'
  }
  /* DOMException or Error — both appear across browsers / AbortController. */
  if (
    (err instanceof DOMException || err instanceof Error) &&
    err.name === 'AbortError'
  ) {
    return 'Request timed out. Please try again.'
  }
  if (err instanceof Error) {
    if (/aborted|timeout/i.test(err.message)) {
      return 'Request timed out. Please try again.'
    }
    if (/\b503\b|temporarily unavailable|service unavailable/i.test(err.message)) {
      return 'Service temporarily unavailable. Please retry in a moment.'
    }
  }
  return 'Network error. Please try again.'
}
