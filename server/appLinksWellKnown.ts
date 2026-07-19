import type { Express, Request, Response } from 'express'

/** Production join / legal host (same origin as Render API + SPA). */
export const APP_LINKS_HOST = 'simvest-api.onrender.com'

const ANDROID_PACKAGE = 'com.simvest.myapp'
const IOS_BUNDLE_ID = 'com.simvest.myapp'

/**
 * Optional Play App Signing SHA-256 fingerprints (colon-separated hex, uppercase).
 * Comma-separated for multiple. Do not invent values — copy from Play Console →
 * App integrity → App signing key certificate after Play App Signing is enabled.
 */
function androidSha256Fingerprints(): string[] {
  const raw = (process.env.ANDROID_APP_LINK_SHA256 ?? '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase().replace(/\s+/g, ''))
    .filter((s) => /^[0-9A-F:]+$/.test(s) && s.includes(':'))
}

function appleTeamId(): string {
  return (process.env.APPLE_TEAM_ID ?? '').trim()
}

function sendJson(res: Response, body: unknown, contentType: string): void {
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.status(200).send(JSON.stringify(body, null, 2))
}

/**
 * Digital Asset Links + Apple App Site Association for HTTPS join deep links.
 * Paths (must be HTTPS, no redirect):
 *   https://simvest-api.onrender.com/.well-known/assetlinks.json
 *   https://simvest-api.onrender.com/.well-known/apple-app-site-association
 */
export function registerAppLinksWellKnown(app: Express): void {
  app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    const fingerprints = androidSha256Fingerprints()
    const statement = {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    }
    /* Always 200 so the route exists; empty fingerprints mean verification fails until env is set. */
    sendJson(res, [statement], 'application/json; charset=utf-8')
  })

  const aasaHandler = (_req: Request, res: Response) => {
    const teamId = appleTeamId()
    const appID = teamId ? `${teamId}.${IOS_BUNDLE_ID}` : `TEAMID.${IOS_BUNDLE_ID}`
    const body = {
      applinks: {
        apps: [],
        details: [
          {
            appID,
            paths: ['/join', '/join/*'],
          },
        ],
      },
    }
    /* Apple expects application/json (often without charset) and no .json extension. */
    sendJson(res, body, 'application/json')
  }

  app.get('/.well-known/apple-app-site-association', aasaHandler)
  /* Some CDNs / docs still probe this path. */
  app.get('/apple-app-site-association', aasaHandler)
}
