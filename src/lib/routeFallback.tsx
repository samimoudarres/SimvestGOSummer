/** Brand splash while a lazy route chunk loads — spinner so slow loads don’t look hung. */
export function RouteFallback() {
  return (
    <main
      className="sv-route-fallback"
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: '#07406a',
        color: '#fff',
        fontFamily: "'Nunito Sans', sans-serif",
        fontSize: 16,
        fontWeight: 700,
      }}
    >
      <span
        className="sv-route-fallback-spin"
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.28)',
          borderTopColor: '#fff',
          animation: 'sv-route-spin 0.7s linear infinite',
        }}
      />
      Loading…
      <style>{`@keyframes sv-route-spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  )
}
