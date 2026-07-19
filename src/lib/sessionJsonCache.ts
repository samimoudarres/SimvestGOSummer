/** Small sessionStorage JSON cache with TTL — instant paint, background refresh. */

export function readSessionJson<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T }
    if (typeof parsed?.savedAt !== 'number' || parsed.data === undefined) return null
    if (Date.now() - parsed.savedAt > maxAgeMs) return null
    return parsed.data as T
  } catch {
    return null
  }
}

export function writeSessionJson<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    /* quota */
  }
}

export function clearSessionJson(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Drop every sessionStorage entry whose key starts with `prefix` (logout cache hygiene). */
export function clearSessionJsonPrefix(prefix: string): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) sessionStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}
