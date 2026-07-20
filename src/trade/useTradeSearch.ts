import { useEffect, useRef, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import {
  dedupeSimvestJsonFetch,
  readSimvestJsonCacheStale,
  writeSimvestJsonCache,
} from '../api/simvestJsonCache'
import { LIVE_MARKETS_POLL_HIDDEN_MS, LIVE_MARKETS_POLL_MS } from '../config/liveMarketsPoll'
import { onDocumentVisible } from '../lib/onDocumentVisible'
import { visibilityAwareInterval } from '../lib/visibilityAwareInterval'
import { isMassiveCryptoSymbol } from '../stocks/displayTicker'
import { TRADE_BROWSE_CACHE_MS, tradeBrowseClientCacheKey } from './tradePrefetch'
import type { TradeBrowseRow } from './tradeTypes'

type Status = 'idle' | 'loading' | 'ready' | 'error'

type SearchPayload = { rows: TradeBrowseRow[] }

function searchUrl(gameSlug: string, q: string): string {
  return `/api/games/${encodeURIComponent(gameSlug)}/trade/search?q=${encodeURIComponent(q)}`
}

function recentsUrl(gameSlug: string, tickers: string[]): string {
  const recents = tickers.map((s) => encodeURIComponent(s)).join(',')
  return `/api/games/${encodeURIComponent(gameSlug)}/trade/search?recents=${recents}`
}

/** Loads ranked search hits or hydrated recent tickers (debounced query handled by caller). */
export function useTradeSearchResults(
  gameSlug: string | undefined,
  enabled: boolean,
  debouncedQuery: string,
  recentTickers: string[],
) {
  const nonCryptoRecents = recentTickers.filter((s) => !isMassiveCryptoSymbol(s))
  const q = debouncedQuery.trim()
  const url =
    enabled && gameSlug
      ? q.length >= 1
        ? searchUrl(gameSlug, q)
        : nonCryptoRecents.length >= 1
          ? recentsUrl(gameSlug, nonCryptoRecents)
          : ''
      : ''
  const cacheKey = url ? tradeBrowseClientCacheKey(url) : ''
  const cachedInitial = cacheKey ? readSimvestJsonCacheStale<SearchPayload>(cacheKey) : undefined
  const [rows, setRows] = useState<TradeBrowseRow[]>(() =>
    cachedInitial?.rows?.filter((row) => !isMassiveCryptoSymbol(row.symbol)) ?? [],
  )
  const [status, setStatus] = useState<Status>(() => (cachedInitial ? 'ready' : 'idle'))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(!!cachedInitial?.rows?.length)

  useEffect(() => {
    if (!enabled || !gameSlug) {
      setRows([])
      setStatus('idle')
      setError(null)
      hasDataRef.current = false
      return
    }

    let cancelled = false
    const query = debouncedQuery.trim()
    const recents = recentTickers.filter((s) => !isMassiveCryptoSymbol(s))

    if (query.length < 1 && recents.length < 1) {
      setRows([])
      setStatus('ready')
      setError(null)
      return
    }

    const nextUrl = query.length >= 1 ? searchUrl(gameSlug, query) : recentsUrl(gameSlug, recents)
    const key = tradeBrowseClientCacheKey(nextUrl)
    const cached = readSimvestJsonCacheStale<SearchPayload>(key)
    if (cached?.rows) {
      const filtered = cached.rows.filter((row) => !isMassiveCryptoSymbol(row.symbol))
      setRows(filtered)
      setStatus('ready')
      setError(null)
      hasDataRef.current = true
    } else if (!hasDataRef.current) {
      setStatus('loading')
      setError(null)
    }

    const run = async (isPoll: boolean) => {
      const silent = isPoll || hasDataRef.current
      if (!silent) {
        setStatus('loading')
        setError(null)
      }
      try {
        const { ok, body } = await dedupeSimvestJsonFetch(key, async () => {
          const r = await simvestFetch(nextUrl, { cache: 'no-store' })
          const parsed = (await r.json().catch(() => ({}))) as { rows?: unknown; error?: string }
          return { ok: r.ok, body: parsed }
        })
        if (cancelled) return
        if (ok && body && Array.isArray(body.rows)) {
          const next = (body.rows as TradeBrowseRow[]).filter((row) => !isMassiveCryptoSymbol(row.symbol))
          writeSimvestJsonCache(key, { rows: body.rows }, TRADE_BROWSE_CACHE_MS)
          setRows(next)
          hasDataRef.current = true
          setStatus('ready')
          setError(null)
        } else if (!silent) {
          setError(typeof body?.error === 'string' ? body.error : query.length >= 1 ? 'Search failed' : 'Could not load recents')
          setStatus('error')
        }
      } catch {
        if (!cancelled && !silent) {
          setError('Network error')
          setStatus('error')
        }
      }
    }

    void run(false)
    const stopPoll = visibilityAwareInterval(() => void run(true), {
      visibleMs: LIVE_MARKETS_POLL_MS,
      hiddenMs: LIVE_MARKETS_POLL_HIDDEN_MS,
      runOnVisible: false,
    })
    const offVisible = onDocumentVisible(() => void run(true))
    return () => {
      cancelled = true
      stopPoll()
      offVisible()
    }
  }, [enabled, gameSlug, debouncedQuery, recentTickers])

  return { rows, status, error }
}
