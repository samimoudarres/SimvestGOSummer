/** Canonical HTTPS legal URLs for Play Console / App Store (must match server routes). */
export const LEGAL_API_ORIGIN = 'https://simvest-api.onrender.com'

export const PRIVACY_POLICY_URL = `${LEGAL_API_ORIGIN}/legal/privacy-policy`
export const TERMS_OF_SERVICE_URL = `${LEGAL_API_ORIGIN}/legal/terms-of-service`
export const DELETE_ACCOUNT_URL = `${LEGAL_API_ORIGIN}/legal/delete-account`

export function openLegalUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}
