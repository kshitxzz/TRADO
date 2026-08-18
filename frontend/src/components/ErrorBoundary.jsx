import { Component } from 'react'

// ─── Global error boundary ─────────────────────────────────────────────────
// Without this, any uncaught exception during render (anywhere in the tree)
// unmounts the whole app and leaves a blank white page with zero indication
// of what happened — that's what was showing up as the "crash". This catches
// it, prints the real error on screen, and lets the person recover without
// losing the tab entirely.
//
// Must be a class component — React only supports error boundaries via
// getDerivedStateFromError / componentDidCatch, there's no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // Keep this — it's the fastest way to grab a stack trace from DevTools
    // console when something like this happens again.
    console.error('Uncaught render error:', error, info)
  }

  handleReload = () => {
    this.setState({ error: null, info: null })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0A0A0F)', display: 'flex',
                     alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="glass-card" style={{ maxWidth: 640, width: '100%', padding: 28 }}>
          <p style={{ color: 'var(--negative-red)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            Something broke while rendering this page
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
            This is the actual error — copy it over so it can be fixed properly, rather than guessing blind.
          </p>
          <pre style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            borderRadius: 8, padding: 14, fontSize: 12.5, color: 'var(--text-primary, #fff)',
            overflow: 'auto', maxHeight: 280, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {String(this.state.error?.stack || this.state.error)}
            {this.state.info?.componentStack ? `\n\nComponent stack:${this.state.info.componentStack}` : ''}
          </pre>
          <button onClick={this.handleReload} className="btn-primary text-sm px-4 py-2" style={{ marginTop: 16 }}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}