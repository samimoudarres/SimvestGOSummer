/** Small sessionStorage JSON cache with TTL — instant paint, background refresh. */

type Wrapped<T> = { savedAt?: number; data?: T }

function readWrapped<T>(key: string): Wrapped<T> | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Wrapped<T>
    if (typeof parsed?.savedAt !== 'number' || parsed.data === undefined) return null
    return parsed
  } catch {
    return null
  }
}

/** Fresh-only read — used to skip redundant warm requests. */
export function readSessionJson<T>(key: string, maxAgeMs: number): T | null {
  const parsed = readWrapped<T>(key)
  if (!parsed) return null
  if (Date.now() - parsed.savedAt! > maxAgeMs) return null
  return parsed.data as T
}

/**
 * Last-good read for tab remounts — ignore TTL so switching tabs never flashes
 * empty/loading shells while a silent refresh runs.
 */
export function readSessionJsonStale<T>(key: string): T | null {
  const parsed = readWrapped<T>(key)
  return parsed ? (parsed.data as T) : null
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
