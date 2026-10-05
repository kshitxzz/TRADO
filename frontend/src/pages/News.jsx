import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Newspaper, Clock, RefreshCw, ExternalLink, Eye, Crosshair, AlertCircle,
  TrendingUp, TrendingDown, Minus, Flame,
} from 'lucide-react'
import toast from 'react-hot-toast'
import PageWrapper from '../components/layout/PageWrapper'
import MarketHoursTab from '../components/news/MarketHoursTab'
import { useAuth } from '../hooks/useAuth'
import { useTimeFormat } from '../hooks/useTimeFormat'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'
import { SESSIONS, activeSessionIds } from '../lib/marketSessions'

// ── Colours ───────────────────────────────────────────────────────────────
const GREEN = '#22C55E'
const RED   = '#F43F5E'
const AMBER = '#F59E0B'
const GRAY  = '#9CA3AF'
const IMPACT_COLOR    = { HIGH: RED, MEDIUM: AMBER, LOW: GRAY }
const SENTIMENT_COLOR = { bullish: GREEN, bearish: RED, neutral: GRAY }

// ── "Your markets": map the user's traded symbols onto story tags ─────────
const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'])
const CRYPTO_BASES = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'LTC', 'AVAX', 'LINK', 'DOT', 'TRX', 'MATIC', 'SHIB'])

function tagsForSymbol(raw) {
  // MT5 brokers decorate symbols: "XAUUSD.m", "EURUSDm", "XAUUSD#" …
  const s = String(raw || '').trim()
    .replace(/[.#_-].*$/, '')
    .replace(/^([A-Z0-9]{5,})[a-z]{1,3}$/, '$1')
    .toUpperCase()
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
  if (p >= 1)     return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return p.toFixed(4)
}

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined)

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

// ── Ticker strip ──────────────────────────────────────────────────────────
function TickerStrip({ items }) {
  if (!items?.length) return null
  return (
    <div className="glass-card px-4 py-2.5 flex items-center gap-7 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {items.map(t => {
        const up = t.changePct >= 0
        return (
          <div key={t.label} className="flex items-center gap-2.5 whitespace-nowrap flex-shrink-0">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{t.label}</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtPrice(t.price)}</span>
            <span className="text-[11px] font-semibold" style={{ color: up ? GREEN : RED }}>
              {up ? '▲' : '▼'} {Math.abs(t.changePct).toFixed(2)}%
            </span>
            <Sparkline data={t.spark} up={up} />
          </div>
        )
      })}
    </div>
  )
}

// ── Desk bar (clock, sessions, pulse) ─────────────────────────────────────
function DeskBar({ pulse, radarCount, hasSymbols, generatedAt, onRefresh, refreshing }) {
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
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {fmtTime(now, { seconds: true, timeZone: 'UTC' })} UTC
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
      {hasSymbols && (
        <span className="flex items-center gap-1 font-semibold tracking-wide" style={{ color: 'var(--accent-purple-light)' }}>
          <Crosshair size={11} />{radarCount} ON YOUR RADAR
        </span>
      )}

      <div className="ml-auto flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        {generatedAt && <span>Updated {fmtTime(generatedAt)}</span>}
        <button onClick={onRefresh} disabled={refreshing} title="Refresh news"
                className="p-1.5 rounded-md transition-colors hover:bg-white/5 disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}

// ── Live wire ─────────────────────────────────────────────────────────────
function LiveWire({ items, nowMs }) {
  const { fmtDateTime } = useTimeFormat()
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
             className="grid grid-cols-[84px_1fr_auto] sm:grid-cols-[110px_1fr_auto] gap-3 items-baseline px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
             style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-[10px] font-semibold tracking-wider uppercase truncate" style={{ color: 'var(--text-muted)' }}>{it.source}</span>
            <span className="text-[13px] leading-snug" style={{ color: 'var(--text-primary)' }}>{it.title}</span>
            <span className="text-[10px] whitespace-nowrap" title={fmtDateTime(it.publishedAt)} style={{ color: 'var(--text-muted)' }}>{ago(it.publishedAt, nowMs)}</span>
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

function SourceLine({ story, nowMs }) {
  const { fmtDateTime } = useTimeFormat()
  const extra = story.sources.length - 1
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      <span className="truncate" title={fmtDateTime(story.publishedAt)}>
        {story.source}{extra > 0 ? ` +${extra} more` : ''} · {ago(story.publishedAt, nowMs)}
      </span>
      <a href={safeUrl(story.url)} target="_blank" rel="noopener noreferrer"
         className="flex items-center gap-1 font-semibold flex-shrink-0 hover:underline" style={{ color: 'var(--accent-purple-light)' }}>
        Read <ExternalLink size={11} />
      </a>
    </div>
  )
}

function TopStory({ story, mine, ticker, nowMs }) {
  const px = ticker?.find(t => story.tags.includes(t.tag))
  return (
    <div className="glass-card p-5 grid lg:grid-cols-[1fr_260px] gap-5"
         style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-widest mr-1" style={{ color: 'var(--accent-purple-light)' }}>TOP STORY</span>
          <Chip color={IMPACT_COLOR[story.impact]}>{story.impact}</Chip>
          <SentimentChip sentiment={story.sentiment} />
          {mine && <Chip color="#8B5CF6" icon={Crosshair}>YOUR MARKET</Chip>}
        </div>
        <h2 className="text-lg sm:text-xl font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>{story.title}</h2>
        {story.summary && <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{story.summary}</p>}
        <WatchLine text={story.watch} />
        <TagRow tags={story.tags} />
        <div className="mt-auto pt-1"><SourceLine story={story} nowMs={nowMs} /></div>
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
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Last 24h</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StoryCard({ story, mine, nowMs }) {
  return (
    <article className="glass-card p-4 flex flex-col gap-2.5"
             style={mine ? { borderColor: 'rgba(139,92,246,0.3)' } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {mine && <Chip color="#8B5CF6" icon={Crosshair}>YOUR MARKET</Chip>}
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
      <div className="mt-auto pt-1"><SourceLine story={story} nowMs={nowMs} /></div>
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
      <Skeleton className="h-56" />
      <Skeleton className="h-52" />
      <div className="grid md:grid-cols-2 gap-4"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function News() {
  const { user } = useAuth()
  const [tab, setTab] = useState('news')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [symbols, setSymbols] = useState([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const pendingTries = useRef(0)
  const lastStamp = useRef(null)

  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    if (force) setRefreshing(true)
    try {
      const d = await api.get(force ? '/news?refresh=1' : '/news')
      if (force && lastStamp.current && d.generatedAt === lastStamp.current) toast('Already up to date')
      lastStamp.current = d.generatedAt
      setData(d)
      setError('')
    } catch (e) {
      if (!silent) setError(e?.message || 'Could not load the news.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Relative timestamps tick every 30s; the data itself refreshes every 5 minutes while the tab is visible.
  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 30_000)
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load({ silent: true }) }, 5 * 60_000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [load])

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

  const userTags = useMemo(() => {
    const all = new Set()
    for (const s of new Set(symbols)) for (const t of tagsForSymbol(s)) all.add(t)
    return all
  }, [symbols])

  const isMine = useCallback((story) => story.tags.some(t => userTags.has(t)), [userTags])

  const stories = data?.stories || []
  const mineCount = useMemo(() => stories.filter(isMine).length, [stories, isMine])
  const top = stories[0]
  const rest = useMemo(() => {
    const r = stories.slice(1)
    return filter === 'mine' ? r.filter(isMine) : r
  }, [stories, filter, isMine])

  const srcOk = data?.meta?.sources?.filter(s => s.ok).length ?? 0
  const srcAll = data?.meta?.sources?.length ?? 0

  return (
    <PageWrapper>
      {/* Header */}
      <div className="glass-card p-5 mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
            <Newspaper size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>News</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>What's moving markets right now, matched to your symbols</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FilterChip active={tab === 'news'} onClick={() => setTab('news')}>
            <span className="inline-flex items-center gap-1.5"><Flame size={13} />News</span>
          </FilterChip>
          <FilterChip active={tab === 'hours'} onClick={() => setTab('hours')}>
            <span className="inline-flex items-center gap-1.5"><Clock size={13} />Market Hours</span>
          </FilterChip>
        </div>
      </div>

      {tab === 'hours' && <MarketHoursTab />}

      {tab === 'news' && (
        <>
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
              <TickerStrip items={data.ticker} />
              <DeskBar
                pulse={data.pulse}
                radarCount={mineCount}
                hasSymbols={userTags.size > 0}
                generatedAt={data.generatedAt}
                onRefresh={() => load({ force: true })}
                refreshing={refreshing}
              />
              <LiveWire items={data.wire} nowMs={nowMs} />

              {top ? (
                <>
                  <TopStory story={top} mine={isMine(top)} ticker={data.ticker} nowMs={nowMs} />

                  <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Latest stories</h2>
                    {userTags.size > 0 && (
                      <div className="flex items-center gap-2">
                        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
                        <FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')}>Your markets ({mineCount})</FilterChip>
                      </div>
                    )}
                  </div>

                  {rest.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-4">
                      {rest.map(s => <StoryCard key={s.id} story={s} mine={isMine(s)} nowMs={nowMs} />)}
                    </div>
                  ) : (
                    <div className="glass-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      No other stories match your symbols right now.
                    </div>
                  )}
                </>
              ) : (
                <div className="glass-card p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No market-moving stories yet — the live wire above still updates.
                </div>
              )}

              <p className="text-[11px] px-1 pb-2" style={{ color: 'var(--text-muted)' }}>
                {srcAll > 0 && `${srcOk}/${srcAll} sources live · `}
                {aiState === 'ready' && 'Summaries are AI-generated from public headlines. '}
                {aiState === 'pending' && 'AI summaries are loading… '}
                {aiState === 'unavailable' && 'AI summaries are unavailable right now, showing headlines only. '}
                Sentiment and heat are rough indicators, not trading signals or financial advice. Open the source before acting on anything.
              </p>
            </div>
          )}
        </>
      )}
    </PageWrapper>
  )
}