/**
 * `setInterval` that uses a slower cadence while the document is hidden, and
 * re-arms (optionally ticks once) when the tab/app becomes visible again.
 */
export function visibilityAwareInterval(
  tick: () => void,
  opts: {
    visibleMs: number
    /** Default: max(visibleMs * 8, 60_000) */
    hiddenMs?: number
    /** Fire immediately when becoming visible (default true). */
    runOnVisible?: boolean
  },
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  const visibleMs = Math.max(1_000, opts.visibleMs)
  const hiddenMs = Math.max(visibleMs, opts.hiddenMs ?? Math.max(visibleMs * 8, 60_000))
  const runOnVisible = opts.runOnVisible !== false

  let timer: number | null = null

  const currentMs = () => (document.hidden ? hiddenMs : visibleMs)

  const arm = () => {
    if (timer != null) window.clearInterval(timer)
    timer = window.setInterval(tick, currentMs())
  }

  const onVis = () => {
    arm()
    if (runOnVisible && document.visibilityState === 'visible') tick()
  }

  arm()
  document.addEventListener('visibilitychange', onVis)
  return () => {
    if (timer != null) window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVis)
  }
}
