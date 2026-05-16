import { apiAssetSrc } from '../config/apiAssetSrc'

export type TradeCategoryId =
  | 'popular'
  | 'crypto'
  | 'following'
  | 'indexfunds'
  | 'etf'
  | 'gainers'
  | 'losers'
  | 'tech'
  | 'healthcare'
  | 'energy'
  | 'finance'
  | 'industrial'
  | 'consumer'
  | 'infrastructure'
  | 'utilities'
  | 'active'

/**
 * Figma column-major order (node 192:1835) — the strip wraps top-to-bottom in 2 rows,
 * so this list is the visual order: column 1 top → column 1 bottom → column 2 top, …
 * Keep in sync with `server/tradeService.ts` `TRADE_CATEGORY_OPTIONS`.
 *
 * All IDs are lowercase to match the server's `category` query string normalization.
 */
export const TRADE_CATEGORY_OPTIONS: { id: TradeCategoryId; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'following', label: 'Following' },
  { id: 'indexfunds', label: 'Index Funds' },
  { id: 'etf', label: 'ETFs' },
  { id: 'gainers', label: 'Top Gainers' },
  { id: 'losers', label: 'Top Losers' },
  { id: 'tech', label: 'Technology' },
  { id: 'healthcare', label: 'Health' },
  { id: 'energy', label: 'Energy' },
  { id: 'finance', label: 'Financial' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'consumer', label: 'Consumer' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'active', label: 'Most Active' },
]

/**
 * Per-category UI styling for the browse strip — matches Figma node 185:1347.
 * `borderColor`/`glowColor` drive the colored outline and glow shadow on each card.
 *
 * The three icon slots can be provided either as a stock ticker (resolved via the
 * `/api/stocks/.../branding-icon` endpoint) **or** as a direct image URL. We use
 * direct URLs for crypto (cryptocurrency-icons CDN) and for index funds / ETF
 * brand marks because Massive's `branding.icon_url` is sparse for those — the
 * direct URL keeps the card visually correct regardless of API coverage.
 */
export type CategoryIcon = { ticker: string } | { url: string }

export type CategoryVisual = {
  borderColor: string
  glowColor: string
  icons: readonly [CategoryIcon, CategoryIcon, CategoryIcon]
}

/** Inline SVG data URL — render a colored circle with a single white glyph in the middle. */
function glyphIcon(bg: string, glyph: string, opts?: { color?: string; fontSize?: number }): string {
  const color = opts?.color ?? '#fff'
  const fontSize = opts?.fontSize ?? 16
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>` +
    `<circle cx='16' cy='16' r='16' fill='${bg}'/>` +
    `<text x='16' y='${16 + fontSize / 3}' text-anchor='middle' ` +
    `font-family='Inter,system-ui,sans-serif' font-size='${fontSize}' ` +
    `font-weight='800' fill='${color}'>${glyph}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Stable CDN icons for the three majors shown in the Figma "Crypto" card. */
const CRYPTO_ICON_BTC = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/btc.svg'
const CRYPTO_ICON_ETH = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/eth.svg'
const CRYPTO_ICON_SOL = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/sol.svg'

export const TRADE_CATEGORY_VISUALS: Record<TradeCategoryId, CategoryVisual> = {
  popular: {
    borderColor: '#03480c',
    glowColor: 'rgba(3, 72, 12, 0.8)',
    icons: [{ ticker: 'TSLA' }, { ticker: 'AAPL' }, { ticker: 'GOOGL' }],
  },
  crypto: {
    borderColor: '#000fb3',
    glowColor: 'rgba(17, 33, 214, 0.8)',
    icons: [{ url: CRYPTO_ICON_BTC }, { url: CRYPTO_ICON_ETH }, { url: CRYPTO_ICON_SOL }],
  },
  following: {
    borderColor: '#0a6efd',
    glowColor: 'rgba(10, 110, 253, 0.75)',
    icons: [
      { url: glyphIcon('#0a6efd', '★', { fontSize: 15 }) },
      { url: glyphIcon('#3d8bfd', '★', { fontSize: 15 }) },
      { url: glyphIcon('#6ea8fe', '★', { fontSize: 15 }) },
    ],
  },
  indexfunds: {
    borderColor: '#d48f03',
    glowColor: 'rgba(212, 143, 3, 0.8)',
    icons: [
      // Visual stand-ins for the three index families shown in the Figma card.
      { url: glyphIcon('#cc0033', 'S', { fontSize: 18 }) },
      { url: glyphIcon('#003478', 'R', { fontSize: 18 }) },
      { url: glyphIcon('#1a1a1a', 'D', { fontSize: 18 }) },
    ],
  },
  etf: {
    borderColor: '#730586',
    glowColor: 'rgba(115, 5, 134, 0.8)',
    icons: [
      // SPDR red, iShares blue, Schwab green — neutral mark approximations.
      { url: glyphIcon('#c8102e', 'V', { fontSize: 16 }) },
      { url: glyphIcon('#0f5dc6', 'i', { fontSize: 18 }) },
      { url: glyphIcon('#1c8a52', 'S', { fontSize: 16 }) },
    ],
  },
  gainers: {
    borderColor: '#0fae37',
    glowColor: 'rgba(15, 174, 55, 0.8)',
    icons: [{ ticker: 'NVDA' }, { ticker: 'TSLA' }, { ticker: 'AMD' }],
  },
  losers: {
    borderColor: '#d93025',
    glowColor: 'rgba(217, 48, 37, 0.8)',
    icons: [{ ticker: 'ETSY' }, { ticker: 'INTC' }, { ticker: 'PFE' }],
  },
  tech: {
    borderColor: '#00accf',
    glowColor: 'rgba(0, 172, 207, 0.8)',
    icons: [{ ticker: 'MSFT' }, { ticker: 'AMZN' }, { ticker: 'META' }],
  },
  healthcare: {
    borderColor: '#244cff',
    glowColor: 'rgba(36, 76, 255, 0.8)',
    icons: [{ ticker: 'UNH' }, { ticker: 'PFE' }, { ticker: 'JNJ' }],
  },
  energy: {
    borderColor: '#d6b600',
    glowColor: 'rgba(214, 182, 0, 0.8)',
    icons: [{ ticker: 'XOM' }, { ticker: 'CVX' }, { ticker: 'NEE' }],
  },
  finance: {
    borderColor: '#2e8a33',
    glowColor: 'rgba(46, 138, 51, 0.8)',
    icons: [{ ticker: 'MS' }, { ticker: 'GS' }, { ticker: 'BAC' }],
  },
  industrial: {
    borderColor: '#7a1111',
    glowColor: 'rgba(122, 17, 17, 0.8)',
    icons: [{ ticker: 'GE' }, { ticker: 'CAT' }, { ticker: 'HON' }],
  },
  consumer: {
    borderColor: '#240329',
    glowColor: 'rgba(36, 3, 41, 0.8)',
    icons: [{ ticker: 'NKE' }, { ticker: 'MCD' }, { ticker: 'SBUX' }],
  },
  infrastructure: {
    borderColor: '#ff9500',
    glowColor: 'rgba(255, 149, 0, 0.8)',
    icons: [{ ticker: 'BIP' }, { ticker: 'CCI' }, { ticker: 'BEP' }],
  },
  utilities: {
    borderColor: '#c700c7',
    glowColor: 'rgba(199, 0, 199, 0.8)',
    icons: [{ ticker: 'NEE' }, { ticker: 'DUK' }, { ticker: 'PCG' }],
  },
  active: {
    borderColor: '#ff9500',
    glowColor: 'rgba(255, 149, 0, 0.8)',
    icons: [{ ticker: 'SPY' }, { ticker: 'TSLA' }, { ticker: 'NVDA' }],
  },
}

/** Resolve a `CategoryIcon` to a usable `<img src>` (absolute on Capacitor for `/api/...`). */
export function categoryIconSrc(icon: CategoryIcon): string {
  if ('url' in icon) return apiAssetSrc(icon.url)
  return apiAssetSrc(`/api/stocks/${encodeURIComponent(icon.ticker)}/branding-icon`)
}

export type TradeBrowseRow = {
  symbol: string
  companyName: string
  price: string
  changeLabel: string
  positive: boolean
  logoUrl: string
  sparkline: number[]
}

export type TradeBrowsePayload = {
  category: TradeCategoryId
  categories: { id: TradeCategoryId; label: string }[]
  rows: TradeBrowseRow[]
}
