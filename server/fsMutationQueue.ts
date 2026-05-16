/**
 * Serialize async work per key so JSON read–modify–write on the same file cannot
 * interleave (last writer would otherwise drop concurrent updates).
 */

const tails = new Map<string, Promise<unknown>>()

export function runSerializedByKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  const p = prev.then(() => fn()) as Promise<T>
  tails.set(key, p.then(() => undefined, () => undefined))
  return p
}
