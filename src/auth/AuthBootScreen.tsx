/** Brief splash while we verify login state on cold start (native + web). */
export function AuthBootScreen() {
  return (
    <main
      className="sv-auth-boot"
      aria-busy="true"
      aria-live="polite"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07406a',
        color: '#fff',
        fontFamily: "'Nunito Sans', sans-serif",
        fontSize: 16,
      }}
    >
      Loading…
    </main>
  )
}
