import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { gamePaths } from '../gameRoutes'
import { BackArrowIcon } from '../icons/BackArrowIcon'
import { fetchJoinWelcome } from './fetchJoinWelcome'
import type { Html5Qrcode } from 'html5-qrcode'
import './joinGameScreen.css'

const QR_SCANNER_EL_ID = 'jg-qr-reader-video'

function extractSixDigitCode(text: string): string | null {
  const t = text.trim()
  if (/^\d{6}$/.test(t)) return t
  const m = t.match(/\b(\d{6})\b/)
  if (m) return m[1]
  try {
    const u = new URL(t)
    const c = u.searchParams.get('code') ?? u.searchParams.get('gameCode')
    if (c && /^\d{6}$/.test(c)) return c
  } catch {
    /* not a URL */
  }
  return null
}

function QrMarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M3 3h6v6H3V3zm2 2v2h2V5H5zm8-2h6v6h-6V3zm2 2v2h2V5h-2zM3 15h6v6H3v-6zm2 2v2h2v-2H5zm13-2h2v2h-2v-2zm-4 0h2v4h-2v-4zm4 4h2v2h-2v-2zm-4-8h2v2h14V9H16z"
      />
    </svg>
  )
}

export function JoinGameScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [joinSubmitting, setJoinSubmitting] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const stoppingRef = useRef(false)

  const fullCode = useMemo(() => digits.join(''), [digits])

  useEffect(() => {
    inputsRef.current = inputsRef.current.slice(0, 6)
  }, [])

  useEffect(() => {
    const raw = params.get('code')?.trim()
    if (!raw) return
    const extracted = extractSixDigitCode(raw) ?? (/^\d{6}$/.test(raw) ? raw : null)
    if (!extracted) return
    const chars = extracted.split('')
    setDigits([chars[0]!, chars[1]!, chars[2]!, chars[3]!, chars[4]!, chars[5]!])
  }, [params])

  const setDigitAt = useCallback((index: number, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[index] = d
      return next
    })
    setFeedback(null)
    if (d && index < 5) {
      queueMicrotask(() => inputsRef.current[index + 1]?.focus())
    }
  }, [])

  const onKeyDownCell = useCallback(
    (index: number, e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        e.preventDefault()
        inputsRef.current[index - 1]?.focus()
        setDigits((prev) => {
          const next = [...prev]
          next[index - 1] = ''
          return next
        })
        setFeedback(null)
      }
    },
    [digits],
  )

  const onPasteRow = useCallback((e: ReactClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const chars = pasted.split('')
    setDigits([
      chars[0] ?? '',
      chars[1] ?? '',
      chars[2] ?? '',
      chars[3] ?? '',
      chars[4] ?? '',
      chars[5] ?? '',
    ])
    setFeedback(null)
    const last = Math.min(chars.length - 1, 5)
    queueMicrotask(() => inputsRef.current[last]?.focus())
  }, [])

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current
    if (!inst || stoppingRef.current) return
    stoppingRef.current = true
    try {
      await inst.stop()
    } catch {
      /* not running or already stopped */
    }
    try {
      inst.clear()
    } catch {
      /* ignore */
    }
    scannerRef.current = null
    stoppingRef.current = false
  }, [])

  useLayoutEffect(() => {
    if (!scannerOpen) return

    let cancelled = false
    setScannerError(null)

    const run = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerError('Camera access is not available in this browser.')
        return
      }

      await new Promise<number>((r) => requestAnimationFrame(() => r(0)))

      if (cancelled) return

      const { Html5Qrcode: Scanner } = await import('html5-qrcode')
      if (cancelled) return

      const inst = new Scanner(QR_SCANNER_EL_ID)
      scannerRef.current = inst

      const qc = typeof window !== 'undefined' ? window.innerWidth : 400
      const qrboxSize = Math.min(280, Math.floor(qc * 0.72))

      try {
        await inst.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: qrboxSize, height: qrboxSize },
            aspectRatio: 1,
          },
          async (decoded) => {
            const code = extractSixDigitCode(decoded)
            if (code) {
              const arr = code.split('')
              setDigits([arr[0]!, arr[1]!, arr[2]!, arr[3]!, arr[4]!, arr[5]!])
              setFeedback(`Code ${code} scanned. Tap Join to continue.`)
              await stopScanner()
              setScannerOpen(false)
            }
          },
          () => {
            /* per-frame decode miss — expected */
          },
        )
      } catch (err) {
        try {
          inst.clear()
        } catch {
          /* ignore */
        }
        if (scannerRef.current === inst) {
          scannerRef.current = null
        }
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Could not start the camera.'
        if (!cancelled) {
          const friendly =
            /Permission|denied|NotAllowed/i.test(msg)
              ? 'Camera permission was blocked. Allow camera access for this site, then try again.'
              : msg
          setScannerError(friendly)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      void stopScanner()
    }
  }, [scannerOpen, stopScanner])

  const onJoin = useCallback(async () => {
    if (!/^\d{6}$/.test(fullCode)) {
      setFeedback('Enter all 6 digits to join.')
      return
    }
    setJoinSubmitting(true)
    try {
      const payload = await fetchJoinWelcome(fullCode)
      if (!payload) {
        setFeedback('We could not find a live game that matches this code.')
        return
      }
      navigate(gamePaths.joinWelcome(fullCode))
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Could not verify this code. Try again.')
    } finally {
      setJoinSubmitting(false)
    }
  }, [fullCode, navigate])

  const openScanner = useCallback(() => {
    setScannerError(null)
    setScannerOpen(true)
  }, [])

  const closeScanner = useCallback(async () => {
    await stopScanner()
    setScannerOpen(false)
    setScannerError(null)
  }, [stopScanner])

  return (
    <div className="jg-root">
      <div className="jg-phone" data-node-id="284:7146">
        <button type="button" className="jg-back" onClick={() => navigate(-1)} aria-label="Back">
          <BackArrowIcon />
        </button>
        <h1 className="jg-logo">SIMVEST</h1>

        <h2 className="jg-section-title">Enter Game Code</h2>

        <div className="jg-code-row" role="group" aria-label="Six-digit game code">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el
              }}
              className="jg-code-cell"
              aria-label={`Digit ${i + 1}`}
              value={digits[i] ?? ''}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={1}
              onChange={(e) => setDigitAt(i, e.target.value)}
              onKeyDown={(e) => onKeyDownCell(i, e)}
              onPaste={onPasteRow}
              onFocus={() => setFeedback(null)}
            />
          ))}
        </div>

        {feedback ? (
          <p
            className={`jg-feedback${/scanned|ready|soon/i.test(feedback) ? ' jg-feedback--ok' : ''}`}
            role="status"
          >
            {feedback}
          </p>
        ) : null}

        <button
          type="button"
          className="jg-join"
          disabled={!/^\d{6}$/.test(fullCode) || joinSubmitting}
          onClick={() => void onJoin()}
        >
          {joinSubmitting ? 'Checking…' : 'Join'}
        </button>

        <p className="jg-or">Or</p>

        <p className="jg-scan-label">Scan QR Code</p>

        <button type="button" className="jg-qr-tile" onClick={openScanner} aria-label="Scan QR code">
          <QrMarkIcon className="jg-qr-icon" />
        </button>

        {scannerOpen ? (
          <div className="jg-scanner-overlay" role="dialog" aria-modal="true" aria-label="Scan QR">
            <div className="jg-scanner-panel">
              <div className="jg-scanner-header">
                <h3 className="jg-scanner-title">Scan QR code</h3>
                <button type="button" className="jg-scanner-close" onClick={() => void closeScanner()}>
                  Close
                </button>
              </div>
              <div className="jg-scanner-video-wrap">
                <div id={QR_SCANNER_EL_ID} />
              </div>
              <p className="jg-scanner-hint">
                Point your camera at the game QR code. We need camera access to read the code.
              </p>
              {scannerError ? <p className="jg-scanner-error">{scannerError}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
