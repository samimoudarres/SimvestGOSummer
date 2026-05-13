import { useCallback, useEffect, useMemo, useState } from 'react'
import { simvestFetch } from '../api/simvestFetch'
import { GAME_SLUG, gameTitle, slugToVariant } from '../challenge/gameMeta'
import { buildJoinGameUrl } from './joinLinks'
import './inviteGameSheet.css'

type InvitePayload = { slug: string; joinCode: string; displayTitle: string }

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatCodeDisplay(code: string): string {
  const d = code.replace(/\D/g, '')
  if (d.length === 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  return code
}

type Props = {
  open: boolean
  onClose: () => void
  gameSlug: string
}

export function InviteGameSheet({ open, onClose, gameSlug }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [payload, setPayload] = useState<InvitePayload | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const joinUrl = useMemo(
    () => (payload?.joinCode ? buildJoinGameUrl(payload.joinCode) : ''),
    [payload?.joinCode],
  )

  const heading = useMemo(() => {
    const slug = gameSlug.trim()
    if (slug === GAME_SLUG.nov2024 || slug === GAME_SLUG.newTemplate) {
      return gameTitle(slugToVariant(slug))
    }
    return (payload?.displayTitle ?? slug).replace(/\s+/g, ' ').trim() || slug
  }, [gameSlug, payload?.displayTitle])

  useEffect(() => {
    if (!open) {
      setStatus('idle')
      setErr(null)
      setPayload(null)
      setQrDataUrl(null)
      setCopyHint(null)
      setReloadNonce(0)
      return
    }
    let cancelled = false
    setStatus('loading')
    setErr(null)
    setPayload(null)
    setQrDataUrl(null)
    void (async () => {
      try {
        const r = await simvestFetch(`/api/games/${encodeURIComponent(gameSlug)}/invite`)
        const body = (await r.json().catch(() => ({}))) as InvitePayload & { error?: string }
        if (cancelled) return
        if (!r.ok) {
          setErr(typeof body.error === 'string' ? body.error : 'Could not load invite')
          setStatus('error')
          return
        }
        if (!body.joinCode || !body.slug) {
          setErr('Invalid invite response')
          setStatus('error')
          return
        }
        setPayload({ slug: body.slug, joinCode: body.joinCode, displayTitle: body.displayTitle ?? '' })
        setStatus('ready')
      } catch {
        if (!cancelled) {
          setErr('Network error')
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, gameSlug, reloadNonce])

  useEffect(() => {
    if (!open || !joinUrl) return
    let cancelled = false
    void import('qrcode')
      .then((QR) => QR.default.toDataURL(joinUrl, { width: 280, margin: 2, errorCorrectionLevel: 'M' }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, joinUrl])

  const onShare = useCallback(async () => {
    if (!joinUrl) return
    const title = `Join ${heading} on Simvest`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: title, url: joinUrl })
        return
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopyHint('Link copied — you can paste it anywhere.')
      window.setTimeout(() => setCopyHint(null), 3500)
    } catch {
      setCopyHint('Copy blocked — try your browser Share menu.')
      window.setTimeout(() => setCopyHint(null), 3500)
    }
  }, [joinUrl, heading])

  const onCopyLink = useCallback(async () => {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopyHint('Join link copied to clipboard.')
    } catch {
      setCopyHint('Could not copy — long-press the link or use Share.')
    }
    window.setTimeout(() => setCopyHint(null), 3500)
  }, [joinUrl])

  const onPrint = useCallback(() => {
    if (!joinUrl || !payload) return
    const safeTitle = escHtml(heading)
    const safeCode = escHtml(formatCodeDisplay(payload.joinCode))
    const safeUrl = escHtml(joinUrl)
    const srcSafe = qrDataUrl ? qrDataUrl.replace(/'/g, '%27') : ''
    const imgTag = qrDataUrl
      ? `<img class="invPrint__qr" src='${srcSafe}' alt="QR code" width="280" height="280" />`
      : `<p class="invPrint__noqr">QR unavailable — use code <strong>${safeCode}</strong></p>`
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle} — Invite</title>
<style>
  body { font-family: 'Nunito Sans', system-ui, sans-serif; text-align: center; padding: 32px 20px; color: #1c1c1c; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .invPrint__code { font-size: 28px; font-weight: 800; letter-spacing: 0.06em; margin: 12px 0 24px; color: #05557d; }
  .invPrint__qr { width: 280px; height: 280px; margin: 0 auto 16px; display: block; }
  .invPrint__url { font-size: 13px; word-break: break-all; color: #444; max-width: 420px; margin: 0 auto; }
  .invPrint__logo { font-size: 14px; font-weight: 800; color: #05557d; margin-bottom: 24px; letter-spacing: 0.12em; }
</style>
</head>
<body>
  <p class="invPrint__logo">SIMVEST</p>
  <h1>${safeTitle}</h1>
  <p>Game code</p>
  <p class="invPrint__code">${safeCode}</p>
  ${imgTag}
  <p class="invPrint__url">${safeUrl}</p>
  <script>window.onload = function () { window.focus(); window.print(); }</script>
</body>
</html>`
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      setCopyHint('Pop-up blocked — allow pop-ups to print.')
      window.setTimeout(() => setCopyHint(null), 4000)
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
  }, [joinUrl, payload, heading, qrDataUrl])

  if (!open) return null

  return (
    <div
      className="invSheetOverlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="invSheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-sheet-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="invSheet__handle" aria-hidden />
        <button type="button" className="invSheet__close" aria-label="Close" onClick={onClose}>
          Close
        </button>
        <h2 id="inv-sheet-title" className="invSheet__eyebrow">
          Invite to game
        </h2>
        {status === 'loading' ? <p className="invSheet__status">Loading…</p> : null}
        {status === 'error' ? (
          <div className="invSheet__status invSheet__status--err">
            <p>{err ?? 'Something went wrong.'}</p>
            <button
              type="button"
              className="invSheet__retry"
              onClick={() => {
                setErr(null)
                setStatus('loading')
                setReloadNonce((n) => n + 1)
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
        {status === 'ready' && payload ? (
          <>
            <h3 className="invSheet__gameTitle">{heading}</h3>
            <p className="invSheet__codeLabel">Game code</p>
            <p className="invSheet__code">{formatCodeDisplay(payload.joinCode)}</p>
            <div className="invSheet__qrWrap">
              {qrDataUrl ? (
                <img className="invSheet__qr" src={qrDataUrl} alt="QR code to join this game" width={220} height={220} />
              ) : (
                <div className="invSheet__qrPh">Generating QR…</div>
              )}
            </div>
            <p className="invSheet__hint">Scan to open Simvest and join this game.</p>
            <button type="button" className="invSheet__share" onClick={() => void onShare()}>
              Share
            </button>
            <button type="button" className="invSheet__copy" onClick={() => void onCopyLink()}>
              Copy link
            </button>
            <button type="button" className="invSheet__print" onClick={onPrint}>
              Print
            </button>
            {copyHint ? <p className="invSheet__toast">{copyHint}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
