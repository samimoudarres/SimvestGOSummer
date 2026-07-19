import { getSimvestUserId } from '../user/simvestUserId'

/** Prefix session cache keys with viewer id so a slug-only key cannot leak across accounts. */
export function viewerScopedCacheKey(prefix: string, rest: string): string {
  const uid = getSimvestUserId().trim() || '_'
  return `${prefix}:${uid}:${rest}`
}
