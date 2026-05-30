import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Express, Request, Response } from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const legalDir = path.join(__dirname, '..', 'public', 'legal')

/** Slug → preloaded HTML (served with 200, no redirect — required for Google Play crawlers). */
const htmlBySlug = new Map<string, string>()

const LEGAL_PAGES: { slug: string; file: string }[] = [
  { slug: 'privacy-policy', file: 'privacy-policy.html' },
  { slug: 'terms-of-service', file: 'terms-of-service.html' },
  { slug: 'delete-account', file: 'delete-account.html' },
]

function readLegalFile(file: string): string | null {
  const filePath = path.join(legalDir, file)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf8')
}

export function preloadLegalPages(): void {
  htmlBySlug.clear()
  for (const { slug, file } of LEGAL_PAGES) {
    const html = readLegalFile(file)
    if (html) htmlBySlug.set(slug, html)
  }
  if (!htmlBySlug.has('privacy-policy')) {
    console.warn(
      `[simvest] public/legal/privacy-policy.html missing — run "npm run build:legal" before deploy.`,
    )
  }
}

export function isPrivacyPolicyReady(): boolean {
  const html = htmlBySlug.get('privacy-policy')
  return Boolean(html && html.includes('Privacy Policy'))
}

function sendLegalHtml(res: Response, slug: string, title: string): void {
  const html = htmlBySlug.get(slug)
  if (!html) {
    res
      .status(503)
      .type('html')
      .send(
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Simvest — ${title}</title></head><body><main><h1>Simvest ${title}</h1><p>This page is temporarily unavailable. Please try again in a few minutes.</p></main></body></html>`,
      )
    return
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).send(html)
}

/** Public legal pages + robots.txt for store review crawlers. Register early in app setup. */
export function registerLegalPages(app: Express): void {
  preloadLegalPages()

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain')
    res.send(['User-agent: *', 'Allow: /', 'Allow: /legal/', ''].join('\n'))
  })

  for (const { slug } of LEGAL_PAGES) {
    const title = slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    const handler = (_req: Request, res: Response) => sendLegalHtml(res, slug, title)
    app.get(`/legal/${slug}`, handler)
    app.get(`/legal/${slug}.html`, handler)
  }
}
