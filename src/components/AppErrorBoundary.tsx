import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Root boundary so a render crash in a route does not white-screen the Capacitor WebView.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[simvest] UI crash', error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: null })
  }

  private goHome = () => {
    this.setState({ error: null })
    try {
      window.location.assign('/')
    } catch {
      window.location.href = '/'
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#07406a',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, opacity: 0.85, maxWidth: 320, fontSize: 14 }}>
          The screen crashed. You can retry or return home.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={this.retry}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#0a95db',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={this.goHome}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'transparent',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            Home
          </button>
        </div>
      </div>
    )
  }
}
