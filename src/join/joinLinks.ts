import { apiPublicOrigin, isCapacitorShell } from '../config/apiPublicOrigin'
import { LEGAL_API_ORIGIN } from '../legal/legalUrls'

function shareableJoinOrigin(): string {
  const api = apiPublicOrigin().replace(/\/+$/, '')
  if (api && /^https:\/\//i.test(api)) return api

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin
    if (
      isCapacitorShell() ||
      /localhost|127\.0\.0\.1/i.test(origin) ||
      !/^https:\/\//i.test(origin)
    ) {
      return LEGAL_API_ORIGIN
    }
    return origin
  }

  return LEGAL_API_ORIGIN
}

/** Absolute HTTPS URL that opens Join with this six-digit code (App Links host). */
export function buildJoinGameUrl(joinCode: string): string {
  const code = joinCode.trim()
  const path = `/join?code=${encodeURIComponent(code)}`
  return `${shareableJoinOrigin()}${path}`
}
