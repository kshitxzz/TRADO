import { useState, useRef, useEffect } from 'react'
import {
  Sparkles, Send, Loader2, Trash2, Bot, BarChart3, TrendingDown, TrendingUp,
  Shield, AlertTriangle, Clock, Target, Brain,
} from 'lucide-react'
import { computeStats, formatPnl } from '../../lib/utils'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

const QUICK_ACTIONS = [
  { icon: BarChart3,     label: 'Analyze my recent trades' },
  { icon: TrendingDown,  label: 'Why am I losing?' },
  { icon: TrendingUp,    label: 'Improve my win rate' },
  { icon: Shield,        label: 'Risk management tips' },
  { icon: AlertTriangle, label: 'Avoid revenge trading' },
  { icon: Clock,         label: 'Best trading hours' },
  { icon: Target,        label: 'Position sizing help' },
  { icon: Brain,         label: 'Trading psychology' },
]

const FOLLOW_UPS = [
  'What patterns do you see in my last 10 trades?',
  'Am I revenge trading?',
  "What's my best setup this week?",
  "How's my risk management trending?",
]

export default function AICoachTab({ user, trades }) {
  const stats = computeStats(trades)
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [history, setHistory]   = useState([])
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function send(msg) {
    const text = (msg || input).trim()
    if (!text || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])
    setLoading(true)

    const newHistory = [...history, { role: 'user', text }]
    try {
      const res = await fetch(`${BACKEND}/api/ai/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, tradeContext: trades.slice(0, 40), conversationHistory: history.slice(-6) }),
      })
      const data = await res.json()
      const aiText = data.aiAvailable ? data.content : (data.message || 'Trado AI is unavailable right now — try again shortly.')
      setMessages(m => [...m, { role: 'ai', text: aiText }])
      setHistory([...newHistory, { role: 'ai', text: aiText }])
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Could not reach the AI coach — check your connection and try again.' }])
    }
    setLoading(false)
  }

  function clearChat() {
    setMessages([])
    setHistory([])
  }

  const hasStarted = messages.length > 0

  return (
    <div className="glass-card flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 300px)', minHeight: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)' }}>
            <Bot size={17} style={{ color: 'var(--accent-purple)' }} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ background: 'var(--positive-green)', borderColor: 'var(--bg-card)' }} />
          </div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Trado AI Coach</h2>
        </div>
        {hasStarted && (
          <button onClick={clearChat} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>

      {!hasStarted ? (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
              <Sparkles size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>How can I help you today?</h3>
            <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
              I'm your AI trading coach. Ask me about trading strategies, analyze your performance, or get help with trading psychology — in any language you're comfortable with.
            </p>
          </div>

          {/* Trading context */}
          <div className="mx-5 mb-4 rounded-xl px-5 py-4 flex items-center justify-around gap-4" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)' }}>
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: stats.totalPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>{formatPnl(stats.totalPnl)}</p>
              <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>Recent P&L</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: 'var(--text-primary)' }}>{stats.winRate.toFixed(0)}%</p>
              <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>Win Rate</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: 'var(--text-primary)' }}>{stats.tradeCount}</p>
              <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>Trades</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="px-5 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Quick Actions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_ACTIONS.map(qa => (
                <button key={qa.label} onClick={() => send(qa.label)}
                        className="flex items-center gap-2.5 text-left text-xs font-medium px-3.5 py-2.5 rounded-lg transition-colors hover:opacity-90"
                        style={{ background: 'var(--bg-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <qa.icon size={14} style={{ color: 'var(--accent-purple)' }} className="flex-shrink-0" />
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'ai' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5" style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
                  <Bot size={13} className="text-white" />
                </div>
              )}
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap"
                   style={{
                     background: m.role === 'user' ? 'var(--accent-purple)' : 'var(--bg-hover, rgba(255,255,255,0.04))',
                     color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                     border: m.role === 'ai' ? '1px solid var(--border-subtle)' : 'none',
                     borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                     lineHeight: '1.6',
                   }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2" style={{ background: 'linear-gradient(135deg,#7c3aed,#db2777)' }}>
                <Bot size={13} className="text-white" />
              </div>
              <div className="rounded-2xl px-4 py-3 flex items-center gap-1" style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border-subtle)', borderRadius: '16px 16px 16px 4px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--accent-purple)', animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          {!loading && messages.length > 0 && messages[messages.length - 1].role === 'ai' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {FOLLOW_UPS.map(q => (
                <button key={q} onClick={() => send(q)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
                        style={{ background: 'var(--bg-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input row */}
      <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex gap-2.5 items-center">
          <input
            className="input-dark flex-1"
            placeholder="Ask your trading coach anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
                  className="btn-primary w-10 h-10 flex items-center justify-center flex-shrink-0 disabled:opacity-40 p-0">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          AI responses are for educational purposes only. Always do your own research.
        </p>
      </div>
    </div>
  )
}