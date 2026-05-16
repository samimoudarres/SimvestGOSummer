/**
 * Smoke-test Massive branding proxy: reference ticker → CDN asset → bytes.
 * Run: npx tsx server/scripts/verifyBrandingIcons.ts
 */
import 'dotenv/config'
import { massiveGet } from '../massiveClient'
import { sendBrandingIcon } from '../branding'

type TickerDetails = {
  results?: { branding?: { icon_url?: string; logo_url?: string } }
}

async function probe(ticker: string): Promise<boolean> {
  const ref = await massiveGet<TickerDetails>(`/v3/reference/tickers/${encodeURIComponent(ticker)}`)
  const raw = ref.results?.branding?.icon_url ?? ref.results?.branding?.logo_url
  console.log(`[${ticker}] ref url:`, raw ? raw.slice(0, 80) + '…' : '(none)')

  let bodyLen = 0
  let contentType = ''
  const mockRes = {
    setHeader(k: string, v: string) {
      if (k.toLowerCase() === 'content-type') contentType = v
    },
    status() {
      return this
    },
    end() {},
    send(buf: Buffer) {
      bodyLen = buf?.length ?? 0
    },
  }

  await sendBrandingIcon(ticker, mockRes as never)
  const ok = bodyLen > 32 && contentType.length > 0
  console.log(`[${ticker}] proxy: ${bodyLen} bytes, ${contentType}, ok=${ok}`)
  return ok
}

async function main() {
  if (!process.env.MASSIVE_API_KEY?.trim()) {
    console.error('MASSIVE_API_KEY missing in .env')
    process.exit(1)
  }
  const tickers = ['AAPL', 'MSFT', 'NVDA']
  let pass = 0
  for (const t of tickers) {
    if (await probe(t)) pass++
  }
  if (pass < tickers.length) {
    console.error(`FAIL: ${pass}/${tickers.length} tickers returned branding bytes`)
    process.exit(1)
  }
  console.log(`PASS: ${pass}/${tickers.length} branding icons proxied successfully`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
