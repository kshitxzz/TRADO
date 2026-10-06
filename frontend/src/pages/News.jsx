import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import {
  Newspaper, RefreshCw, ExternalLink, Eye, Crosshair, AlertCircle,
  TrendingUp, TrendingDown, Minus, Flame, Plus, X, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../hooks/useAuth'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { useTimezone, TIMEZONES } from '../hooks/useTimezone'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'
import { SESSIONS, activeSessionIds } from '../lib/marketSessions'

// ── Colours ───────────────────────────────────────────────────────────────
const GREEN = '#22C55E'
const RED   = '#F43F5E'
const AMBER = '#F59E0B'
const GRAY  = '#9CA3AF'
const PURPLE = '#8B5CF6'
const IMPACT_COLOR    = { HIGH: RED, MEDIUM: AMBER, LOW: GRAY }
const SENTIMENT_COLOR = { bullish: GREEN, bearish: RED, neutral: GRAY }

// ── "Your markets": map symbols onto story tags ───────────────────────────
const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'])
const CRYPTO_BASES = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'LTC', 'AVAX', 'LINK', 'DOT', 'TRX', 'MATIC', 'SHIB'])

// MT5 brokers decorate symbols: "XAUUSD.m", "EURUSDm", "XAUUSD#" …
const cleanSymbol = (raw) => String(raw || '').trim()
  .replace(/[.#_-].*$/, '')
  .replace(/^([A-Z0-9]{5,})[a-z]{1,3}$/, '$1')
  .toUpperCase()

function tagsForSymbol(raw) {
  const s = cleanSymbol(raw)
  const tags = new Set()
  if (!s) return tags

  if (/^(XAU|GOLD)/.test(s))                                                    { tags.add('XAU'); tags.add('USD') }
  else if (/^(XAG|SILVER)/.test(s))                                             { tags.add('XAG'); tags.add('USD') }
  else if (/^(WTI|USOIL|XTI|CLUSDT|BRENT|UKOIL|XBR|BZUSDT|USOUSD|UKOUSD)/.test(s)) { tags.add('OIL') }
  else if (/^(NATGAS|NGAS|XNG)/.test(s))                                        { tags.add('NATGAS') }
  else if (/^(US500|SPX|SP500)/.test(s))                                        { tags.add('US500') }
  else if (/^(NAS100|USTEC|NDX|US100)/.test(s))                                 { tags.add('NAS100') }
  else if (/^(US30|DJ30|WS30|DJI)/.test(s))                                     { tags.add('US30') }
  else {
    const m = /^([A-Z0-9]{2,6}?)(USDT|USD)$/.exec(s)
    if (m && CRYPTO_BASES.has(m[1])) { tags.add(m[1]); tags.add('CRYPTO') }
    else if (/^[A-Z]{6}$/.test(s) && CURRENCIES.has(s.slice(0, 3)) && CURRENCIES.has(s.slice(3))) {
      tags.add(s.slice(0, 3)); tags.add(s.slice(3))
    }
  }
  return tags
}

// What the user types → a symbol we can match ("eur/usd" → EURUSD)
const normalizeSymbol = (input) => String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

const MAX_WATCHLIST = 20
const SUGGESTIONS = [
  { group: 'Forex',           items: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY'] },
  { group: 'Metals & energy', items: ['XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL', 'NATGAS'] },
  { group: 'Crypto',          items: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'DOGEUSD'] },
  { group: 'Indices',         items: ['US500', 'NAS100', 'US30'] },
]
const KNOWN_SYMBOLS = SUGGESTIONS.flatMap(g => g.items)

// The watchlist lives in this browser, per account.
function useWatchlist(userId) {
  const key = userId ? `trado_news_watchlist:${userId}` : null
  const [list, setList] = useState([])

  useEffect(() => {
    if (!key) return
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]')
      setList(Array.isArray(raw) ? raw.filter(x => typeof x === 'string').slice(0, MAX_WATCHLIST) : [])
    } catch { setList([]) }
  }, [key])

  const toggle = useCallback((symbol) => {
    setList(prev => {
      const next = prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : (prev.length >= MAX_WATCHLIST ? prev : [...prev, symbol])
      if (key) { try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* storage unavailable */ } }
      return next
    })
  }, [key])

  return [list, toggle]
}

// ── Small helpers ─────────────────────────────────────────────────────────
function ago(iso, nowMs) {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((nowMs - t) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtPrice(p) {
  if (!Number.isFinite(p)) return '—'
  if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 100)   return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (p >= 1)     return p.toFixed(4)
  return p.toFixed(5)
}

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined)

// Same base URL convention as lib/api.js (VITE_BACKEND_URL → Render backend).
const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'}/api`

// Live prices arrive over one long-lived Server-Sent-Events connection. It is
// opened with fetch() (not EventSource) so the login token can be sent as a
// header — the server checks it once, not on every price update.
async function readPriceStream({ signal, onSnapshot, onTick }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_BASE}/news/stream`, {
    headers: { Accept: 'text/event-stream', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    cache: 'no-store',
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Price stream unavailable (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buf += decoder.decode(value, { stream: true })
    let end
    while ((end = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, end)
      buf = buf.slice(end + 2)
      const event = /^event: (.+)$/m.exec(block)?.[1]
      const raw = /^data: (.+)$/m.exec(block)?.[1]
      if (!event || !raw) continue // heartbeat comments have neither
      let data
      try { data = JSON.parse(raw) } catch { continue }
      if (event === 'snapshot') onSnapshot(data)
      else if (event === 'tick') onTick(data)
      else if (event === 'bye') return // server rotates connections every few minutes
    }
  }
}

// ── Atoms ─────────────────────────────────────────────────────────────────
function Chip({ color, icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md whitespace-nowrap"
          style={{ color, background: `${color}1f`, border: `1px solid ${color}38` }}>
      {Icon && <Icon size={10} />}{children}
    </span>
  )
}

function Sparkline({ data, up, w = 84, h = 24 }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? GREEN : RED} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function SentimentChip({ sentiment }) {
  if (!sentiment) return null
  const Icon = sentiment === 'bullish' ? TrendingUp : sentiment === 'bearish' ? TrendingDown : Minus
  return <Chip color={SENTIMENT_COLOR[sentiment]} icon={Icon}>{sentiment.toUpperCase()}</Chip>
}

function Skeleton({ className = '', style }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.05)', ...style }} />
}

// ── Moving ticker (forex, metals, oil, crypto, indices) ───────────────────
const TICKER_PX_PER_SECOND = 48 // scroll speed — lower = slower

// Briefly tints the price green/red when it ticks up/down.
function usePriceFlash(price) {
  const prev = useRef(price)
  const [dir, setDir] = useState(null)
  useEffect(() => {
    if (price === prev.current) return
    setDir(price > prev.current ? 'up' : 'down')
    prev.current = price
    const id = setTimeout(() => setDir(null), 700)
    return () => clearTimeout(id)
  }, [price])
  return dir
}

function TickerItem({ t }) {
  const up = t.changePct >= 0
  const flash = usePriceFlash(t.price)
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap flex-shrink-0">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}
            title={t.live ? 'Live — updating every second' : 'Refreshed about every 15 seconds — may be delayed'}>
        <span className={`w-1.5 h-1.5 rounded-full ${t.live ? 'animate-pulse' : ''}`}
              style={t.live ? { background: GREEN } : { border: '1px solid var(--text-muted)' }} />
        {t.label}
      </span>
      <span className="text-xs font-semibold tabular-nums transition-colors duration-500"
            style={{ color: flash === 'up' ? GREEN : flash === 'down' ? RED : 'var(--text-primary)' }}>
        {fmtPrice(t.price)}
      </span>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: up ? GREEN : RED }}>
        {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
      </span>
      <Sparkline data={t.spark} up={up} />
    </div>
  )
}

function TickerStrip({ items }) {
  const copyRef = useRef(null)
  const [seconds, setSeconds] = useState(150)
  const labelsKey = items?.map(t => t.label).join('|') || ''

  // Constant speed regardless of how many instruments there are: loop time = width ÷ speed.
  // (Only re-measured when the set of instruments changes, never on a price tick.)
  useLayoutEffect(() => {
    const w = copyRef.current?.scrollWidth || 0
    if (w > 0) setSeconds(Math.max(30, w / TICKER_PX_PER_SECOND))
  }, [labelsKey])

  if (!items?.length) return null
  // Repeat short lists so one copy always fills a wide screen, then render two
  // identical copies and slide by exactly half → a seamless loop.
  const base = items.length >= 10 ? items : Array.from({ length: Math.ceil(10 / items.length) }, () => items).flat()
  const renderCopy = (copy) => base.map((t, i) => <TickerItem key={`${copy}${i}${t.label}`} t={t} />)

  return (
    <div className="glass-card px-4 py-2.5" role="region" aria-label="Market prices (hover to pause)">
      <style>{`
        .news-ticker-viewport { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
        .news-ticker-track { display: flex; width: max-content; animation: news-ticker-slide linear infinite; }
        .news-ticker-viewport:hover .news-ticker-track { animation-play-state: paused; }
        .news-ticker-copy { display: flex; align-items: center; gap: 28px; padding-right: 28px; flex-shrink: 0; }
        @keyframes news-ticker-slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .news-ticker-viewport { overflow-x: auto; -webkit-mask-image: none; mask-image: none; }
          .news-ticker-track { animation: none; }
        }
      `}</style>
      <div className="news-ticker-viewport">
        <div className="news-ticker-track" style={{ animationDuration: `${seconds}s` }}>
          <div className="news-ticker-copy" ref={copyRef}>{renderCopy('a')}</div>
          <div className="news-ticker-copy" aria-hidden="true">{renderCopy('b')}</div>
        </div>
      </div>
    </div>
  )
}

// ── Desk bar (clock, sessions, pulse) ─────────────────────────────────────
function DeskBar({ pulse, radarCount, hasMarkets, generatedAt, updatedTitle, onRefresh, refreshing, tz, tzLabel }) {
  const { fmtTime } = useTimeFormat()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const minute = Math.floor(now / 60000)
  const active = useMemo(() => activeSessionIds(minute * 60000), [minute])
  const total = pulse.bull + pulse.bear

  return (
    <div className="glass-card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: GREEN }} />
        <span className="font-semibold tracking-widest" style={{ color: GREEN }}>DESK LIVE</span>
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }} title="Your selected timezone">
          {fmtTime(now, { seconds: true, timeZone: tz })} {tzLabel}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {SESSIONS.map(s => {
          const on = active.includes(s.id)
          return (
            <span key={s.id} title={`${s.name} ${on ? 'open' : 'closed'}`}
                  className="px-1.5 py-0.5 rounded font-semibold tracking-wide"
                  style={on ? { color: s.color, background: `${s.color}22`, border: `1px solid ${s.color}55` }
                            : { color: 'var(--text-muted)', border: '1px solid transparent', opacity: 0.6 }}>
              {s.id}
            </span>
          )
        })}
      </div>

      {total > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex h-1.5 w-20 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ width: `${(pulse.bull / total) * 100}%`, background: GREEN }} />
            <div style={{ width: `${(pulse.bear / total) * 100}%`, background: RED }} />
          </div>
          <span style={{ color: 'var(--text-secondary)' }}>{pulse.bull} bull / {pulse.bear} bear</span>
        </div>
      )}

      {pulse.highImpact > 0 && <span className="font-semibold tracking-wide" style={{ color: RED }}>{pulse.highImpact} HIGH-IMPACT</span>}
      {hasMarkets && (
        <span className="flex items-center gap-1 font-semibold tracking-wide" style={{ color: 'var(--accent-purple-light)' }}>
          <Crosshair size={11} />{radarCount} ON YOUR RADAR
        </span>
      )}

      <div className="ml-auto flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        {generatedAt && <span title={updatedTitle}>Updated {ago(generatedAt, now)}</span>}
        <button onClick={onRefresh} disabled={refreshing} title="Refresh news" aria-label="Refresh news"
                className="p-1.5 rounded-md transition-colors hover:bg-white/5 disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

// ── Your markets (watchlist) ──────────────────────────────────────────────
function AddMarketPanel({ watchlist, onToggle }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const norm = normalizeSymbol(q)
  const groups = SUGGESTIONS
    .map(g => ({ ...g, items: g.items.filter(s => !norm || s.includes(norm)) }))
    .filter(g => g.items.length > 0)
  const matches = groups.flatMap(g => g.items)
  const canAddCustom = norm.length >= 3 && !KNOWN_SYMBOLS.includes(norm) && tagsForSymbol(norm).size > 0
  const unrecognised = norm.length >= 3 && !canAddCustom && matches.length === 0
  const full = watchlist.length >= MAX_WATCHLIST

  const submit = () => {
    if (canAddCustom && !full) { onToggle(norm); setQ(''); return }
    if (matches.length === 1) onToggle(matches[0])
  }

  return (
    <div role="dialog" aria-label="Add markets"
         className="absolute left-3 right-3 sm:right-auto top-full mt-2 z-30 sm:w-[380px] rounded-xl p-3 shadow-2xl"
         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)' }}>
      <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
             placeholder="Search or type a symbol, e.g. EURUSD"
             className="w-full text-sm rounded-lg px-3 py-2 outline-none"
             style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />

      <div className="max-h-72 overflow-y-auto mt-3 space-y-3">
        {canAddCustom && (
          <button onClick={() => { if (!full) { onToggle(norm); setQ('') } }} disabled={full}
                  className="w-full text-left text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                  style={{ color: 'var(--accent-purple-light)', background: 'rgba(139,92,246,0.12)', border: '1px dashed rgba(139,92,246,0.45)' }}>
            + Add “{norm}”
          </button>
        )}

        {groups.map(g => (
          <div key={g.group}>
            <p className="text-[10px] font-semibold tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{g.group.toUpperCase()}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map(sym => {
                const on = watchlist.includes(sym)
                return (
                  <button key={sym} onClick={() => onToggle(sym)} disabled={!on && full} aria-pressed={on}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                          style={on
                            ? { color: 'var(--accent-purple-light)', background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.5)' }
                            : { color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                    {on && <Check size={11} />}{sym}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {unrecognised && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            “{norm}” isn't a market we can match news to yet. Try forex pairs (EURUSD), metals (XAUUSD), oil (USOIL), crypto (BTCUSD) or indices (US500).
          </p>
        )}
      </div>

      <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
        {watchlist.length}/{MAX_WATCHLIST} markets · saved in this browser · Esc to close
      </p>
    </div>
  )
}

function YourMarkets({ watchlist, autoSymbols, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="glass-card px-4 py-3 relative">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest mr-1" style={{ color: 'var(--accent-purple-light)' }}>
          <Crosshair size={12} />YOUR MARKETS
        </span>

        {watchlist.map(sym => (
          <span key={sym} className="inline-flex items-center gap-1 text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-lg"
                style={{ color: 'var(--accent-purple-light)', background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.4)' }}>
            {sym}
            <button onClick={() => onToggle(sym)} aria-label={`Remove ${sym}`} className="p-0.5 rounded hover:bg-white/10"><X size={11} /></button>
          </span>
        ))}

        {autoSymbols.map(sym => (
          <span key={`auto-${sym}`} title="Added automatically from your trades"
                className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{ color: 'var(--text-secondary)', border: '1px dashed var(--border-subtle)' }}>
            {sym}
          </span>
        ))}

        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors hover:brightness-125"
                style={{ color: '#fff', background: 'var(--gradient-primary)' }}>
          <Plus size={13} />Add market
        </button>
      </div>

      {watchlist.length === 0 && autoSymbols.length === 0 && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Add the markets you trade and the news that affects them gets flagged and can be filtered.
        </p>
      )}

      {open && <AddMarketPanel watchlist={watchlist} onToggle={onToggle} />}
    </div>
  )
}

// ── Live wire ─────────────────────────────────────────────────────────────
function LiveWire({ items, nowMs, stamp, clock }) {
  if (!items?.length) return null
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#3B82F6' }} />
          <span className="text-[10px] font-semibold tracking-widest" style={{ color: 'var(--text-muted)' }}>LIVE WIRE · RAW HEADLINES</span>
        </div>
        <span className="text-[10px] tracking-wide" style={{ color: 'var(--text-muted)' }}>{items.length} LIVE · SCROLL FOR MORE</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {items.map(it => (
          <a key={it.id} href={safeUrl(it.url)} target="_blank" rel="noopener noreferrer"
             title={`Published ${stamp(it.publishedAt)}`}
             className="grid grid-cols-[84px_1fr_auto] sm:grid-cols-[110px_1fr_auto] gap-3 items-baseline px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
             style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-[10px] font-semibold tracking-wider uppercase truncate" style={{ color: 'var(--text-muted)' }}>{it.source}</span>
            <span className="text-[13px] leading-snug" style={{ color: 'var(--text-primary)' }}>{it.title}</span>
            <span className="text-[10px] whitespace-nowrap text-right" style={{ color: 'var(--text-muted)' }}>
              {ago(it.publishedAt, nowMs)}
              <span className="hidden sm:inline"> · {clock(it.publishedAt)}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Story pieces ──────────────────────────────────────────────────────────
function WatchLine({ text }) {
  if (!text) return null
  return (
    <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <Eye size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-purple-light)' }} />
      <span><span className="font-semibold tracking-wide" style={{ color: 'var(--text-muted)' }}>WATCH </span>{text}</span>
    </p>
  )
}

function TagRow({ tags, limit = 5 }) {
  if (!tags?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.slice(0, limit).map(t => (
        <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}>{t}</span>
      ))}
    </div>
  )
}

function SourceLine({ story, nowMs, stamp }) {
  const extra = story.sources.length - 1
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      <span className="truncate" title={`First reported ${stamp(story.publishedAt)}`}>
        {story.source}{extra > 0 ? ` +${extra} more` : ''} · {ago(story.publishedAt, nowMs)}
      </span>
      <a href={safeUrl(story.url)} target="_blank" rel="noopener noreferrer"
         className="flex items-center gap-1 font-semibold flex-shrink-0 hover:underline" style={{ color: 'var(--accent-purple-light)' }}>
        Read <ExternalLink size={11} />
      </a>
    </div>
  )
}

function TopStory({ story, mine, ticker, nowMs, stamp }) {
  const px = ticker?.find(t => t.tag === story.tags.find(tag => ticker.some(x => x.tag === tag)))
  return (
    <div className="glass-card p-5 grid lg:grid-cols-[1fr_260px] gap-5"
         style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest mr-1" style={{ color: 'var(--accent-purple-light)' }}>TOP STORY</span>
          <Chip color={IMPACT_COLOR[story.impact]}>{story.impact}</Chip>
          <SentimentChip sentiment={story.sentiment} />
          {mine && <Chip color={PURPLE} icon={Crosshair}>YOUR MARKET</Chip>}
        </div>
        <h2 className="text-lg sm:text-xl font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>{story.title}</h2>
        {story.summary && <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{story.summary}</p>}
        <WatchLine text={story.watch} />
        <TagRow tags={story.tags} />
        <div className="mt-auto pt-1"><SourceLine story={story} nowMs={nowMs} stamp={stamp} /></div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-[10px] font-semibold tracking-widest" style={{ color: 'var(--text-muted)' }}>HEAT</span>
            <span className="text-2xl font-bold leading-none" style={{ color: AMBER }}>{story.heat}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full" style={{ width: `${story.heat}%`, background: `linear-gradient(90deg, ${AMBER}, ${RED})` }} />
          </div>
        </div>
        {px && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{px.label}</span>
              <span className="text-[11px] font-semibold" style={{ color: px.changePct >= 0 ? GREEN : RED }}>
                {px.changePct >= 0 ? '+' : '−'}{Math.abs(px.changePct).toFixed(2)}%
              </span>
            </div>
            <p className="text-xl font-bold my-1" style={{ color: 'var(--text-primary)' }}>{fmtPrice(px.price)}</p>
            <Sparkline data={px.spark} up={px.changePct >= 0} w={220} h={44} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Recent price action</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StoryCard({ story, mine, nowMs, stamp }) {
  return (
    <article className="glass-card p-4 flex flex-col gap-2.5"
             style={mine ? { borderColor: 'rgba(139,92,246,0.3)' } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {mine && <Chip color={PURPLE} icon={Crosshair}>YOUR MARKET</Chip>}
          <Chip color={IMPACT_COLOR[story.impact]}>{story.impact}</Chip>
          <SentimentChip sentiment={story.sentiment} />
        </div>
        <span className="flex items-center gap-1 text-xs font-bold flex-shrink-0" style={{ color: AMBER }} title="Heat score">
          <Flame size={12} />{story.heat}
        </span>
      </div>
      <h3 className="text-sm font-semibold leading-snug line-clamp-3" style={{ color: 'var(--text-primary)' }}>{story.title}</h3>
      {story.summary && <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{story.summary}</p>}
      <WatchLine text={story.watch} />
      <TagRow tags={story.tags} limit={4} />
      <div className="mt-auto pt-1"><SourceLine story={story} nowMs={nowMs} stamp={stamp} /></div>
    </article>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={active
              ? { color: 'var(--accent-purple-light)', background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.4)' }
              : { color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      {children}
    </button>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-11" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
      <Skeleton className="h-52" />
      <Skeleton className="h-52" />
      <div className="grid md:grid-cols-2 gap-4"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
    </div>
  )
}

const INITIAL_VISIBLE = 10

// ── Page ──────────────────────────────────────────────────────────────────
export default function News() {
  const { user } = useAuth()
  const { fmtTime } = useTimeFormat()
  const { timezone } = useTimezone()
  const [data, setData] = useState(null)
  const [ticker, setTicker] = useState([])
  const [tickerMeta, setTickerMeta] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [symbols, setSymbols] = useState([])
  const [watchlist, toggleWatch] = useWatchlist(user?.id)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const pendingTries = useRef(0)
  const lastStamp = useRef(null)

  // Every time on this page is shown in the timezone chosen in the app.
  const tzLabel = TIMEZONES.find(t => t.value === timezone)?.label.split(' — ')[0] || timezone
  const clock = useCallback((iso) => fmtTime(iso, { timeZone: timezone }), [fmtTime, timezone])
  const stamp = useCallback((iso) => {
    const day = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })
    return `${day}, ${fmtTime(iso, { timeZone: timezone })} ${tzLabel}`
  }, [fmtTime, timezone, tzLabel])

  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    if (force) setRefreshing(true)
    try {
      const d = await api.get(force ? '/news?refresh=1' : '/news')
      if (force && lastStamp.current && d.generatedAt === lastStamp.current) toast('Already up to date')
      lastStamp.current = d.generatedAt
      setData(d)
      if (d.ticker?.length) setTicker(d.ticker)
      if (d.tickerMeta) setTickerMeta(d.tickerMeta)
      setError('')
    } catch (e) {
      if (!silent) setError(e?.message || 'Could not load the news.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Relative times tick every 30s; the stories refresh every 5 minutes while the tab is visible.
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 30_000)
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load({ silent: true }) }, 5 * 60_000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [load])

  // Live prices: one streaming connection pushes every price change (about once a second).
  const applySnapshot = useCallback((d) => {
    if (d.items?.length) setTicker(d.items)
    if (d.meta) setTickerMeta(d.meta)
    setStreaming(true)
  }, [])
  const applyTick = useCallback((changed) => {
    setTicker(prev => prev.map(t => {
      const v = changed[t.label] // [price, changePct, live(0|1)]
      if (!v) return t
      const spark = t.spark?.length > 1 ? [...t.spark.slice(0, -1), v[0]] : t.spark
      return { ...t, price: v[0], changePct: v[1], live: v[2] === 1, spark }
    }))
  }, [])

  useEffect(() => {
    let stopped = false
    let ctrl = null
    let retry = null
    let failures = 0

    const run = async () => {
      if (stopped || document.visibilityState === 'hidden') return
      ctrl = new AbortController()
      try {
        await readPriceStream({ signal: ctrl.signal, onSnapshot: (d) => { failures = 0; applySnapshot(d) }, onTick: applyTick })
        failures = 0 // ended cleanly — the server rotates connections periodically
      } catch (e) {
        if (stopped || e?.name === 'AbortError') return
        failures += 1
        setStreaming(false)
      }
      if (!stopped) retry = setTimeout(run, failures ? Math.min(30_000, 1000 * 2 ** failures) : 300)
    }

    // Don't hold a connection open for a tab nobody is looking at.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { ctrl?.abort() }
      else { clearTimeout(retry); failures = 0; run() }
    }
    document.addEventListener('visibilitychange', onVisibility)
    run()
    return () => {
      stopped = true
      clearTimeout(retry)
      ctrl?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [applySnapshot, applyTick])

  // Fallback: if the live stream can't connect, poll for prices instead.
  const hasTicker = ticker.length > 0
  useEffect(() => {
    if (streaming) return
    let tries = 0
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      if (!hasTicker && ++tries > 8) return
      try {
        const d = await api.get('/news/ticker')
        if (d.ticker?.length) setTicker(d.ticker)
        if (d.tickerMeta) setTickerMeta(d.tickerMeta)
      } catch { /* keep showing the last prices */ }
    }, hasTicker ? 10_000 : 8_000)
    return () => clearInterval(id)
  }, [streaming, hasTicker])

  // AI summaries land a few seconds after the headlines — re-check a few times.
  const aiState = data?.meta?.ai
  useEffect(() => {
    if (aiState !== 'pending') { pendingTries.current = 0; return }
    if (pendingTries.current >= 10) return
    const id = setTimeout(() => { pendingTries.current += 1; load({ silent: true }) }, 6000)
    return () => clearTimeout(id)
  }, [aiState, data?.generatedAt, load])

  // Symbols only (no full trade rows) — just enough to match stories to what the user trades.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    supabase.from('trades').select('symbol').eq('user_id', user.id)
      .order('closed_at', { ascending: false }).limit(500)
      .then(({ data: rows }) => { if (!cancelled && rows) setSymbols(rows.map(r => r.symbol).filter(Boolean)) })
    return () => { cancelled = true }
  }, [user?.id])

  // Most-traded recognised symbols that aren't already on the watchlist (shown as dashed chips).
  const autoSymbols = useMemo(() => {
    const counts = new Map()
    for (const raw of symbols) {
      const sym = cleanSymbol(raw)
      if (!sym || tagsForSymbol(sym).size === 0) continue
      counts.set(sym, (counts.get(sym) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).filter(s => !watchlist.includes(s)).slice(0, 6)
  }, [symbols, watchlist])

  // Watchlist + everything the user trades decide what counts as "your market".
  const userTags = useMemo(() => {
    const all = new Set()
    for (const s of watchlist) for (const t of tagsForSymbol(s)) all.add(t)
    for (const s of new Set(symbols)) for (const t of tagsForSymbol(s)) all.add(t)
    return all
  }, [watchlist, symbols])

  const isMine = useCallback((story) => story.tags.some(t => userTags.has(t)), [userTags])

  const stories = data?.stories || []
  const mineCount = useMemo(() => stories.filter(isMine).length, [stories, isMine])
  const top = stories[0]
  const rest = useMemo(() => {
    const r = stories.slice(1)
    return filter === 'mine' ? r.filter(isMine) : r
  }, [stories, filter, isMine])
  const visible = filter === 'all' && !showAll ? rest.slice(0, INITIAL_VISIBLE) : rest
  const hiddenCount = rest.length - visible.length

  const liveCount = useMemo(() => ticker.filter(t => t.live).length, [ticker])
  const srcOk = data?.meta?.sources?.filter(s => s.ok).length ?? 0
  const srcAll = data?.meta?.sources?.length ?? 0

  return (
    <PageWrapper>
      {/* Header */}
      <div className="glass-card p-5 mb-5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
          <Newspaper size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>News</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>What's moving markets right now, matched to your symbols</p>
        </div>
      </div>

      {loading && !data && <LoadingState />}

      {!loading && !data && (
        <div className="glass-card p-8 text-center">
          <AlertCircle size={28} className="mx-auto mb-3" style={{ color: AMBER }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn't load the news</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{error || 'Try again in a moment.'}</p>
          <button onClick={() => { setLoading(true); load() }} className="btn-primary text-sm px-4 py-2">Retry</button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <TickerStrip items={ticker} />
          <DeskBar
            pulse={data.pulse}
            radarCount={mineCount}
            hasMarkets={userTags.size > 0}
            generatedAt={data.generatedAt}
            updatedTitle={`Fetched ${stamp(data.generatedAt)}`}
            onRefresh={() => load({ force: true })}
            refreshing={refreshing}
            tz={timezone}
            tzLabel={tzLabel}
          />
          <YourMarkets watchlist={watchlist} autoSymbols={autoSymbols} onToggle={toggleWatch} />
          <LiveWire items={data.wire} nowMs={nowMs} stamp={stamp} clock={clock} />

          {top ? (
            <>
              <TopStory story={top} mine={isMine(top)} ticker={ticker} nowMs={nowMs} stamp={stamp} />

              <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Latest stories</h2>
                {userTags.size > 0 && (
                  <div className="flex items-center gap-2">
                    <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
                    <FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')}>Your markets ({mineCount})</FilterChip>
                  </div>
                )}
              </div>

              {visible.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {visible.map(s => <StoryCard key={s.id} story={s} mine={isMine(s)} nowMs={nowMs} stamp={stamp} />)}
                </div>
              ) : (
                <div className="glass-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  {userTags.size === 0
                    ? 'Add a market above and the stories that affect it will show up here.'
                    : 'No other stories match your markets right now.'}
                </div>
              )}

              {hiddenCount > 0 && (
                <div className="text-center">
                  <FilterChip active={false} onClick={() => setShowAll(true)}>Show {hiddenCount} more</FilterChip>
                </div>
              )}
            </>
          ) : (
            <div className="glass-card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No market-moving stories yet — the live wire above still updates.
            </div>
          )}

          <p className="text-[11px] px-1 pb-2" style={{ color: 'var(--text-muted)' }}>
            {srcAll > 0 && `${srcOk}/${srcAll} news sources live · `}
            {tickerMeta?.total > 0 && `${tickerMeta.ok}/${tickerMeta.total} prices · ${liveCount} streaming live${streaming ? '' : ' (stream offline, refreshing every 10s)'} · `}
            {aiState === 'ready' && 'Summaries are AI-generated from public headlines. '}
            {aiState === 'pending' && 'AI summaries are loading… '}
            {aiState === 'unavailable' && 'AI summaries are unavailable right now, showing headlines only. '}
            Times are shown in {tzLabel} and reflect when each outlet first published. Prices with a green dot stream live; hollow dots refresh about every 15 seconds and may be delayed. Prices are indicative and can differ from your broker's quotes.
            Sentiment and heat are rough indicators, not trading signals or financial advice. Open the source before acting on anything.
          </p>
        </div>
      )}
    </PageWrapper>
  )
}