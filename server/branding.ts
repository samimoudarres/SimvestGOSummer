import type { Response } from 'express'
import { massiveGet } from './massiveClient'
import { normalizeCryptoCompositeTicker, normalizeTicker } from './stockService'

type TickerDetails = {
  results?: {
    branding?: { icon_url?: string; logo_url?: string }
    icon_url?: string
    logo_url?: string
    name?: string
  }
}

function initialsLetters(sym: string): string {
  const t = normalizeTicker(sym) ?? sym.toUpperCase()
  if (t.startsWith('X:')) {
    const pair = t.slice(2).replace(/USD|EUR|GBP|USDT|USDC|DAI$/i, '')
    const letters = pair.replace(/[^A-Z]/g, '').slice(0, 3)
    return letters || 'CRY'
  }
  const letters = t.replace(/[^A-Z]/g, '').slice(0, 2)
  return letters || '—'
}

function initialsSvg(ticker: string): string {
  const letters = initialsLetters(ticker)
  const safe = letters.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#e8e8e8"/>
  <text x="64" y="74" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#555">${safe}</text>
</svg>`
}

function pickBrandingUrl(r: TickerDetails['results']): string | undefined {
  if (!r) return undefined
  return (
    r.branding?.icon_url ??
    r.branding?.logo_url ??
    r.icon_url ??
    r.logo_url
  )
}

/** Massive often omits `branding` on crypto — load a standard PNG (same circle treatment as proxied logos). */
async function tryCryptoBrandingPng(sym: string): Promise<Buffer | null> {
  if (!sym.startsWith('X:')) return null
  const base = sym
    .slice(2)
    .replace(/(USD|USDT|EUR|GBP|USDC|DAI)$/i, '')
    .toLowerCase()
  if (!base || !/^[a-z0-9]{1,15}$/.test(base)) return null
  const url = `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/png/128/color/${base}.png`
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 6000)
    const asset = await fetch(url, { signal: ac.signal })
    clearTimeout(t)
    if (!asset.ok) return null
    const buf = Buffer.from(await asset.arrayBuffer())
    if (buf.length < 80) return null
    return buf
  } catch {
    return null
  }
}

/** Download icon/logo bytes from Massive/Polygon CDN (apiKey query and/or Bearer). */
async function fetchMassiveBrandingAsset(
  rawUrl: string,
  apiKey: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const withKey = rawUrl.includes('apiKey=')
    ? rawUrl
    : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(apiKey)}`
  const candidates = [...new Set([withKey, rawUrl])]
  const authHeaders: HeadersInit[] = [{ Authorization: `Bearer ${apiKey}` }, {}]

  for (const url of candidates) {
    for (const headers of authHeaders) {
      try {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 15_000)
        const asset = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: ac.signal,
        })
        clearTimeout(timer)
        if (!asset.ok) continue
        const buf = Buffer.from(await asset.arrayBuffer())
        if (buf.length < 16) continue
        const contentType = asset.headers.get('content-type') ?? 'application/octet-stream'
        return { body: buf, contentType }
      } catch {
        /* try next */
      }
    }
  }
  return null
}

/** Streams company icon (or logo) from Massive using the server API key — browser-safe. */
export async function sendBrandingIcon(tickerRaw: string, res: Response): Promise<void> {
  const rawIn = String(tickerRaw ?? '').trim()
  const sym = normalizeCryptoCompositeTicker(rawIn) ?? normalizeTicker(rawIn)
  if (!sym) {
    res.status(400).end()
    return
  }

  try {
    const ref = await massiveGet<TickerDetails>(`/v3/reference/tickers/${encodeURIComponent(sym)}`)
    const r = ref.results
    const raw = pickBrandingUrl(r)
    if (!raw) {
      const png = await tryCryptoBrandingPng(sym)
      if (png) {
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.send(png)
        return
      }
      const svg = initialsSvg(sym)
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.send(svg)
      return
    }

    const key = process.env.MASSIVE_API_KEY
    if (!key) {
      res.status(500).end()
      return
    }
    const asset = await fetchMassiveBrandingAsset(raw, key)
    if (!asset) {
      const svg = initialsSvg(sym)
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.send(svg)
      return
    }
    const ct = asset.contentType
    res.setHeader('Content-Type', ct)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(asset.body)
  } catch {
    const svg = initialsSvg(sym)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(svg)
  }
}
