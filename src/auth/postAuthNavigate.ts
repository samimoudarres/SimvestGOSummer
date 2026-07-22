/** Safe post-login / post-signup destination (preserves join ?code= etc.). */
export function resolvePostAuthPath(state: unknown): string {
  const from =
    state && typeof state === 'object' && 'from' in state
      ? (state as { from?: unknown }).from
      : undefined
  if (typeof from !== 'string') return '/'
  const path = from.trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) return '/'
  if (path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/admin')) return '/'
  return path
}
