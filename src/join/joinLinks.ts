/** Absolute URL that opens the Join Game screen with this six-digit code pre-filled. */
export function buildJoinGameUrl(joinCode: string): string {
  const code = joinCode.trim()
  const path = `/join?code=${encodeURIComponent(code)}`
  if (typeof window === 'undefined' || !window.location?.origin) {
    return path
  }
  return `${window.location.origin}${path}`
}
