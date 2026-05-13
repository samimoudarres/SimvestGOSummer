/**
 * Trim route / body game slug. Never substitute another game's slug — callers must validate non-empty.
 */
export function normalizeGameSlugParam(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return s
}

/** Case-insensitive key for matching feed rows to routes (URLs may differ in casing). */
export function canonicalGameSlugKey(raw: unknown): string {
  return normalizeGameSlugParam(raw).toLowerCase()
}
