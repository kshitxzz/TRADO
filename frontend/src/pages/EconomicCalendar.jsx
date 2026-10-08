import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { Search, RefreshCw, ChevronDown, ExternalLink, Globe, Clock, X, AlertCircle } from 'lucide-react'
import { US, EU, GB, JP, AU, CA, CH, NZ, CN } from 'country-flag-icons/react/1x1'
import PageWrapper from '../components/layout/PageWrapper'
import { api } from '../lib/api'
import { useTimezone } from '../hooks/useTimezone'
import { useTimeFormat, formatTime } from '../hooks/useTimeFormat'
import {
  CURRENCIES, CCY, TABS, filterEvents, groupByDay, dayNumber, countdownText, zoneLabel, sourceUrl, IMPACT_LABEL,
} from '../lib/economicCalendar'

const FLAGS = { US, EU, GB, JP, AU, CA, CH, NZ, CN }
const PAGE_SIZE = 15
const POLL_MS = 45_000           // normal refresh cadence
const HOT_POLL_MS = 4_000        // around a release: re-check the server every few seconds
const HOT_WINDOW_MS = 8 * 60_000 // how long after a release we keep waiting for the actual
const FILTER_KEY = 'trado_calendar_filters'
const ALL_IMPACTS = ['high', 'medium', 'low']

function readFilters() {
  const d = { tab: 'today', impacts: ['high', 'medium'], currency: 'ALL' }
  try {
    const s = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}')
    return {
      tab: TABS.some(t => t.id === s.tab) ? s.tab : d.tab,
      impacts: Array.isArray(s.impacts) && s.impacts.length && s.impacts.every(i => ALL_IMPACTS.includes(i)) ? s.impacts : d.impacts,
      currency: s.currency === 'ALL' || CCY[s.currency] ? s.currency : d.currency,
    }
  } catch { return d }
}

function Flag({ code, size = 24 }) {
  const F = FLAGS[CCY[code]?.flag]
  return (
    <span className="ec-flag" style={{ width: size, height: size }}>
      {F ? <F /> : <Globe size={Math.round(size * 0.7)} />}
    </span>
  )
}

// ── Currency dropdown (custom — native <select> bleeds OS chrome through the dark theme) ──
function CurrencyMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const label = value === 'ALL' ? 'All Currencies' : value
  const pick = (v) => { onChange(v); setOpen(false) }
  return (
    <div className="ec-ccy" ref={ref}>
      <button type="button" className={`ec-ccy-btn ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <Flag code={value} size={16} />
        <span>{label}</span>
        <ChevronDown size={14} className="ec-ccy-chev" />
      </button>
      {open && (
        <div className="ec-ccy-menu" role="listbox">
          <button type="button" role="option" aria-selected={value === 'ALL'} className={value === 'ALL' ? 'sel' : ''} onClick={() => pick('ALL')}>
            <Flag code="ALL" size={18} /><span>All Currencies</span>
          </button>
          {CURRENCIES.map(c => (
            <button type="button" role="option" aria-selected={value === c.code} key={c.code} className={value === c.code ? 'sel' : ''} onClick={() => pick(c.code)}>
              <Flag code={c.code} size={18} />
              <span>{c.code}</span>
              <em>{c.name}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── One event row ─────────────────────────────────────────────────────────
// FF writes bond-auction figures as "yield|bid-to-cover" (e.g. 4.83|2.7).
const fmtVal = (e, v) => (e.category === 'Bond Auction' && v.includes('|') ? `${v.split('|')[0]}% | ${v.split('|')[1]}` : v)

const EventRow = memo(function EventRow({ e, now, tz, timeFormat, open, onToggle, isNext, actualsOn }) {
  const countdown = countdownText(e.time, now)
  const released = countdown === null
  const awaiting = released && e.actual == null && actualsOn && e.impact !== 'holiday' && now - e.time < HOT_WINDOW_MS
  const when = e.impact === 'holiday' ? 'All Day' : formatTime(e.time, timeFormat, { timeZone: tz })
  const full = `${new Date(e.time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz })} · ${formatTime(e.time, timeFormat, { timeZone: tz })}`
  const dash = <span className="ec-dash">-</span>

  return (
    <div className={`ec-row ${open ? 'open' : ''}`}>
      <button type="button" className="ec-main" onClick={onToggle} aria-expanded={open}>
        <span className="ec-time">{when}</span>
        <Flag code={e.currency} />
        <span className="ec-chip">{e.currency}</span>
        <span className={`ec-impact ${e.impact}`}><i />{IMPACT_LABEL[e.impact]}</span>
        <span className="ec-title">
          <b>{e.title}</b>
          {e.measure && <small>{e.measure}</small>}
        </span>
        <span className="ec-stats">
          <span className="ec-stat">
            <label>ACTUAL</label>
            {!released
              ? <strong className="ec-count">{countdown}</strong>
              : e.actual != null
                ? <strong className="ec-actual">{e.actual}</strong>
                : awaiting
                  ? <span className="ec-wait" title="Released — waiting for the actual value"><i /><i /><i /></span>
                  : <span className="ec-dash" title={actualsOn ? 'Not available from the data provider' : 'No actuals provider is connected (the Forex Factory feed has none)'}>-</span>}
          </span>
          <span className="ec-stat"><label>FORECAST</label>{e.forecast != null ? <span className="ec-val">{fmtVal(e, e.forecast)}</span> : dash}</span>
          <span className="ec-stat"><label>PREVIOUS</label>{e.previous != null ? <span className={`ec-val ${e.previousRevised ? 'ec-rev' : ''}`} title={e.previousRevised ? 'Revised value (the original figure was changed after publication)' : undefined}>{fmtVal(e, e.previous)}</span> : dash}</span>
        </span>
        <ChevronDown size={15} className="ec-chev" />
        {isNext && <span className="ec-next">NEXT UP</span>}
      </button>

      <div className={`ec-exp ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="ec-exp-in">
          <div className="ec-exp-body">
            <div className="ec-cat">
              <label>CATEGORY</label>
              <b>{e.category}</b>
              <a href={sourceUrl(e.time)} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}>
                <ExternalLink size={12} /> Source
              </a>
            </div>
            <div className="ec-sum">
              <label>EVENT SUMMARY</label>
              <p>
                {e.summary} Scheduled for {full}{e.currency !== 'ALL' ? ` (${e.currency})` : ''}.
                {e.id.startsWith('mt5-')
                  ? ' Source: MetaQuotes economic calendar (via MetaTrader 5).'
                  : e.source === 'MetaQuotes'
                    ? ' Schedule and impact rating: Forex Factory. Actual, forecast and previous: MetaQuotes (MetaTrader 5).'
                    : ' Impact rating, forecast and previous: Forex Factory.'}
                {released && e.actual != null && !e.source && ' Actual: Financial Modeling Prep.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

// ── Page ──────────────────────────────────────────────────────────────────
export default function EconomicCalendar() {
  const { timezone } = useTimezone()
  const { timeFormat } = useTimeFormat()

  const init = useMemo(readFilters, [])
  const [tab, setTab] = useState(init.tab)
  const [impacts, setImpacts] = useState(() => new Set(init.impacts))
  const [currency, setCurrency] = useState(init.currency)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [count, setCount] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const hasData = useRef(false)
  const clockOffset = useRef(0)                     // server time − device time
  const [tick, setTick] = useState(() => Date.now())
  const now = tick + clockOffset.current

  // Persist filters
  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify({ tab, impacts: [...impacts], currency })) } catch { /* private mode */ }
  }, [tab, impacts, currency])

  // Is a release happening right now? (drives 1-second ticks and fast polling)
  const hotRef = useRef({ tick: false, poll: false })

  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    if (force) setRefreshing(true)
    else if (!silent) setLoading(true)
    const t0 = Date.now()
    try {
      const res = await api.get(force ? '/calendar?refresh=1' : '/calendar')
      const t1 = Date.now()
      if (res.serverTime) clockOffset.current = res.serverTime - (t0 + t1) / 2
      setTick(Date.now())
      hasData.current = true
      setData(res)
      setError(null)
    } catch (err) {
      if (!hasData.current) setError(err.message || 'Could not load the economic calendar.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Live clock: 1s while a release is within a minute either side (so the countdown flips exactly on time),
  // 15s otherwise.
  useEffect(() => {
    let id
    const run = () => {
      setTick(Date.now())
      id = setTimeout(run, hotRef.current.tick ? 1000 : 15_000)
    }
    id = setTimeout(run, 1000)
    return () => clearTimeout(id)
  }, [])

  // Data refresh: every few seconds around a release (the server only re-asks its provider when it is
  // worth it), 45s otherwise. Also refreshes the moment the tab regains focus.
  useEffect(() => {
    let id, dead = false
    const loop = async () => {
      if (dead) return
      if (!document.hidden) await load({ silent: true })
      id = setTimeout(loop, hotRef.current.poll ? HOT_POLL_MS : POLL_MS)
    }
    id = setTimeout(loop, POLL_MS)
    const wake = () => { if (!document.hidden) load({ silent: true }) }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => { dead = true; clearTimeout(id); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake) }
  }, [load])

  // Search debounce (shows the same short "loading" state as the reference)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 280)
    return () => clearTimeout(id)
  }, [query])
  const searching = query.trim() !== debounced.trim()

  // Reset paging when the result set changes
  useEffect(() => { setCount(PAGE_SIZE); setExpanded(null) }, [tab, impacts, currency, debounced])

  const events = data?.events || []
  // Release window: from 60s before an event until HOT_WINDOW after it (High/Medium only, like the server).
  useEffect(() => {
    const t = Date.now() + clockOffset.current
    hotRef.current = {
      tick: events.some(e => e.time - t < 60_000 && t - e.time < 60_000),
      poll: events.some(e => e.impact !== 'low' && e.impact !== 'holiday' && e.time - t < 30_000 && t - e.time < HOT_WINDOW_MS && (e.actual == null)),
    }
  }, [events, tick])
  const filtered = useMemo(
    () => filterEvents(events, { tab, impacts, currency, query: debounced }, now, timezone),
    [events, tab, impacts, currency, debounced, now, timezone],
  )
  const visible = filtered.slice(0, count)
  const groups = useMemo(() => groupByDay(visible, now, timezone), [visible, now, timezone])
  const nextId = useMemo(() => filtered.find(e => e.time > now)?.id, [filtered, now])
  // Per-day totals count everything that matches the filters, not just the rows loaded so far.
  const dayCounts = useMemo(() => {
    const m = {}
    for (const e of filtered) { const d = dayNumber(e.time, timezone); m[d] = (m[d] || 0) + 1 }
    return m
  }, [filtered, timezone])
  const remaining = filtered.length - visible.length

  const loadMore = () => {
    if (loadingMore) return
    setLoadingMore(true)
    setTimeout(() => { setCount(c => c + PAGE_SIZE); setLoadingMore(false) }, 450)
  }

  const toggleImpact = (key) => {
    setImpacts(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next.size ? next : new Set(ALL_IMPACTS)          // never end up with nothing selected
    })
  }
  const allImpacts = impacts.size === ALL_IMPACTS.length

  const zone = zoneLabel(timezone, now)
  const meta = data?.meta
  const delayed = !!meta && (meta.stale || !!meta.error)
  const updated = meta?.updatedAt ? formatTime(meta.updatedAt, timeFormat, { timeZone: timezone, seconds: true, hour: 'numeric' }) : null
  const actualsOn = !!meta?.actuals?.enabled

  const clearFilters = () => { setQuery(''); setDebounced(''); setTab('all'); setImpacts(new Set(ALL_IMPACTS)); setCurrency('ALL') }

  return (
    <PageWrapper>
      <style>{CSS}</style>
      <div className="ec">
        {/* Header */}
        <div className="ec-head">
          <div>
            <h1>Economic Calendar</h1>
            <p>Track high-impact economic events and news that move the markets</p>
          </div>
          <div className="ec-status">
            <Clock size={13} />
            <b>{zone.name}</b>
            <span>{zone.offset}</span>
            <span className={`ec-live ${delayed ? 'delayed' : ''}`}><i />{delayed ? 'DELAYED' : 'LIVE'}</span>
            {updated && <span className="ec-upd">Updated {updated}</span>}
            {meta?.feed?.configured && meta.feed.live && !meta.feed.error && <span className="ec-upd ec-ok" title="Actual, forecast and previous values are streaming from the MetaTrader 5 (MetaQuotes) calendar.">· Actuals live</span>}
            {meta?.feed?.configured && (!meta.feed.live || meta.feed.error) && <span className="ec-upd ec-warn" title={meta.feed.error || 'The MetaTrader 5 calendar feed has not reported for over 5 minutes, so new actual values will not appear until it reconnects.'}>· Actuals feed offline</span>}
            {meta && !meta.feed?.configured && !actualsOn && <span className="ec-upd" title="Actual values need an actuals provider. The Forex Factory feed publishes schedule, forecast and previous only.">· Actuals not connected</span>}
            {meta && actualsOn && meta.actuals.lastError && <span className="ec-upd ec-warn" title="The actuals provider rejected or failed the last request, so Actual values cannot be filled in right now.">· Actuals unavailable ({meta.actuals.lastError})</span>}
          </div>
        </div>
        <div className="ec-rule" />

        {/* Tabs + filters */}
        <div className="ec-filters">
          <div className="ec-tabs" role="tablist">
            {TABS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ec-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ec-imp">
            <button type="button" className={`ec-ibtn all ${allImpacts ? 'on' : ''}`} onClick={() => setImpacts(new Set(ALL_IMPACTS))}>All</button>
            <button type="button" className={`ec-ibtn high ${impacts.has('high') ? 'on' : ''}`} onClick={() => toggleImpact('high')}><i />High</button>
            <button type="button" className={`ec-ibtn med ${impacts.has('medium') ? 'on' : ''}`} onClick={() => toggleImpact('medium')}><i />Med</button>
            <button type="button" className={`ec-ibtn low ${impacts.has('low') ? 'on' : ''}`} onClick={() => toggleImpact('low')}><i />Low</button>
          </div>
          <CurrencyMenu value={currency} onChange={setCurrency} />
        </div>

        <div className="ec-search-row">
          <label className="ec-search">
            <Search size={15} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events..." spellCheck={false} />
            {query && <button type="button" className="ec-x" onClick={() => setQuery('')} aria-label="Clear search"><X size={12} /></button>}
          </label>
          <button type="button" className={`ec-refresh ${refreshing ? 'spin' : ''}`} onClick={() => load({ force: true })} disabled={refreshing} aria-label="Refresh events" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="ec-rule" />

        {/* Body */}
        {loading && !data ? (
          <div className="ec-note"><span className="ec-spin" /> LOADING EVENTS...</div>
        ) : error && !data ? (
          <div className="ec-error">
            <AlertCircle size={18} />
            <p>{error}</p>
            <button type="button" onClick={() => load()}>Try again</button>
          </div>
        ) : (
          <>
            <div className="ec-count-row">
              {searching
                ? <span className="ec-note inline"><span className="ec-spin" /> LOADING EVENTS...</span>
                : <span>{filtered.length} {filtered.length === 1 ? 'EVENT' : 'EVENTS'}</span>}
              {query && <button type="button" className="ec-clear" onClick={() => setQuery('')}>Clear search</button>}
            </div>

            {!searching && filtered.length === 0 && (
              <div className="ec-empty">
                <p>No events match these filters.</p>
                <button type="button" onClick={clearFilters}>Show everything</button>
              </div>
            )}

            {!searching && groups.map(g => (
              <section key={g.day} className="ec-day">
                <header>
                  <h2>{g.label}</h2>
                  <span>{dayCounts[g.day]} {dayCounts[g.day] === 1 ? 'EVENT' : 'EVENTS'}</span>
                </header>
                {g.events.map(e => (
                  <EventRow
                    key={e.id} e={e} now={now} tz={timezone} timeFormat={timeFormat}
                    open={expanded === e.id} onToggle={() => setExpanded(x => (x === e.id ? null : e.id))}
                    isNext={e.id === nextId} actualsOn={actualsOn}
                  />
                ))}
              </section>
            ))}

            {!searching && filtered.length > 0 && (
              remaining > 0 ? (
                <div className="ec-more">
                  <button type="button" className={loadingMore ? 'busy' : ''} onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <><span className="ec-spin" /> Loading more...</> : <><ChevronDown size={14} /> Load More Events</>}
                  </button>
                </div>
              ) : (
                <div className="ec-end">All events loaded</div>
              )
            )}
          </>
        )}
      </div>
    </PageWrapper>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────
const CSS = `
.ec {
  --ec-card: #0F0F0F; --ec-hover: #121214; --ec-border: #1f1f1f; --ec-chip: #191919; --ec-input: #0b0b0c;
  --ec-text: #fff; --ec-muted: #7a7a82; --ec-dim: #55555c; --ec-label: #5c5c63; --ec-blue: #0864F7;
  max-width: 1440px; margin: 0 auto; padding: 8px 4px 48px; font-family: inherit; color: var(--ec-text);
}
html.light .ec {
  --ec-card: #ffffff; --ec-hover: #f6f6f8; --ec-border: #e4e4e8; --ec-chip: #efeff2; --ec-input: #ffffff;
  --ec-text: #0b0b0f; --ec-muted: #6b6b75; --ec-dim: #9a9aa3; --ec-label: #8a8a93;
}
.ec button { font-family: inherit; }
.ec-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
.ec-head h1 { font-size: 34px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
.ec-head p { margin-top: 10px; font-size: 14px; color: var(--ec-dim); }
.ec-status { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ec-muted); margin-top: 8px; flex-wrap: wrap; }
.ec-status b { color: var(--ec-text); font-weight: 600; }
.ec-live { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11.5px; color: #22c55e; letter-spacing: 0.02em; }
.ec-live i { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: ecPulse 1.8s ease-out infinite; }
.ec-live.delayed { color: #f59e0b; } .ec-live.delayed i { background: #f59e0b; animation: none; }
.ec-upd { color: var(--ec-dim); } .ec-warn { color: #f59e0b; } .ec-ok { color: #22c55e; }
@keyframes ecPulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); } 70% { box-shadow: 0 0 0 7px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
.ec-rule { height: 1px; background: var(--ec-border); margin: 0 0 18px; }

/* tabs + impact + currency */
.ec-filters { display: flex; align-items: center; gap: 30px; flex-wrap: wrap; margin-bottom: 18px; }
.ec-tabs, .ec-imp { display: flex; align-items: center; gap: 4px; }
.ec-tab { position: relative; background: none; border: none; cursor: pointer; padding: 8px 12px; font-size: 13.5px; font-weight: 600; color: var(--ec-dim); transition: color 160ms ease; }
.ec-tab:hover { color: var(--ec-text); }
.ec-tab.on { color: var(--ec-text); font-weight: 700; }
.ec-tab::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 2px; border-radius: 2px; background: var(--ec-blue); transform: scaleX(0); transition: transform 220ms cubic-bezier(.4,0,.2,1); }
.ec-tab.on::after { transform: scaleX(1); }
.ec-ibtn { position: relative; display: inline-flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; padding: 8px 12px; font-size: 13.5px; font-weight: 600; color: var(--ec-dim); transition: color 160ms ease; }
.ec-ibtn:hover { color: var(--ec-text); }
.ec-ibtn.all.on { color: var(--ec-text); }
.ec-ibtn i { width: 13px; height: 13px; border-radius: 50%; opacity: 0.45; transition: opacity 160ms ease, transform 160ms ease; }
.ec-ibtn.on i { opacity: 1; }
.ec-ibtn:hover i { transform: scale(1.12); }
.ec-ibtn::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 2px; border-radius: 2px; transform: scaleX(0); transition: transform 220ms cubic-bezier(.4,0,.2,1); }
.ec-ibtn.on::after { transform: scaleX(1); }
.ec-ibtn.high i { background: radial-gradient(circle at 35% 30%, #ff6a85, #dc2848); } .ec-ibtn.high.on { color: #f0425f; } .ec-ibtn.high::after { background: rgba(220,40,72,0.55); }
.ec-ibtn.med i { background: radial-gradient(circle at 35% 30%, #ffe469, #e0a216); } .ec-ibtn.med.on { color: #f5a524; } .ec-ibtn.med::after { background: rgba(245,165,36,0.55); }
.ec-ibtn.low i { background: radial-gradient(circle at 35% 30%, #4ade80, #1f7a45); } .ec-ibtn.low.on { color: #3dba6f; } .ec-ibtn.low::after { background: rgba(61,186,111,0.55); }

.ec-ccy { position: relative; }
.ec-ccy-btn { display: inline-flex; align-items: center; gap: 10px; padding: 9px 14px; background: var(--ec-input); border: 1px solid var(--ec-border); border-radius: 12px; color: var(--ec-text); font-size: 13.5px; font-weight: 500; cursor: pointer; transition: border-color 160ms ease, background 160ms ease; }
.ec-ccy-btn:hover, .ec-ccy-btn.open { border-color: rgba(8,100,247,0.5); }
.ec-ccy-chev { color: var(--ec-dim); transition: transform 200ms ease; } .ec-ccy-btn.open .ec-ccy-chev { transform: rotate(180deg); }
.ec-ccy-menu { position: absolute; top: calc(100% + 8px); left: 0; z-index: 30; min-width: 250px; padding: 6px; background: var(--ec-card); border: 1px solid var(--ec-border); border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,0.45); animation: ecDrop 160ms ease; }
@keyframes ecDrop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.ec-ccy-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: none; background: none; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--ec-text); text-align: left; transition: background 120ms ease; }
.ec-ccy-menu button:hover { background: var(--ec-hover); } .ec-ccy-menu button.sel { background: rgba(8,100,247,0.12); }
.ec-ccy-menu em { margin-left: auto; font-style: normal; font-weight: 500; font-size: 11.5px; color: var(--ec-dim); }
.ec-flag { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; overflow: hidden; background: var(--ec-chip); color: var(--ec-muted); box-shadow: 0 0 0 1px rgba(255,255,255,0.07); }
.ec-flag svg { width: 100%; height: 100%; display: block; }

/* search + refresh */
.ec-search-row { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.ec-search { display: flex; align-items: center; gap: 10px; width: 310px; max-width: 100%; padding: 0 12px; height: 40px; background: var(--ec-input); border: 1px solid var(--ec-border); border-radius: 11px; color: var(--ec-dim); transition: border-color 160ms ease, box-shadow 160ms ease; }
.ec-search:focus-within { border-color: var(--ec-blue); box-shadow: 0 0 0 3px rgba(8,100,247,0.18); color: var(--ec-muted); }
.ec-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--ec-text); font-size: 13.5px; font-family: inherit; }
.ec-search input::placeholder { color: var(--ec-dim); }
.ec-x { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: none; background: var(--ec-chip); color: var(--ec-muted); cursor: pointer; }
.ec-x:hover { color: var(--ec-text); }
.ec-refresh { width: 42px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--ec-input); border: 1px solid var(--ec-border); border-radius: 11px; color: var(--ec-muted); cursor: pointer; transition: border-color 160ms ease, color 160ms ease; }
.ec-refresh:hover:not(:disabled) { border-color: rgba(8,100,247,0.5); color: var(--ec-text); }
.ec-refresh.spin svg { animation: ecSpin 0.8s linear infinite; }
@keyframes ecSpin { to { transform: rotate(360deg); } }

.ec-count-row { display: flex; align-items: center; gap: 14px; margin: 4px 0 26px; font-size: 11.5px; font-weight: 500; letter-spacing: 0.1em; color: var(--ec-dim); }
.ec-clear { background: none; border: none; cursor: pointer; font-size: 12px; letter-spacing: 0; color: var(--ec-muted); } .ec-clear:hover { color: var(--ec-text); text-decoration: underline; }
.ec-note { display: flex; align-items: center; gap: 10px; padding: 18px 2px; font-size: 11.5px; font-weight: 500; letter-spacing: 0.1em; color: var(--ec-dim); }
.ec-note.inline { padding: 0; }
.ec-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--ec-dim); border-top-color: transparent; display: inline-block; animation: ecSpin 0.7s linear infinite; }

/* days + rows */
.ec-day { margin-bottom: 34px; animation: ecFade 260ms ease both; }
@keyframes ecFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.ec-day header { display: flex; align-items: baseline; justify-content: space-between; padding: 0 4px 12px; border-bottom: 1px solid var(--ec-border); }
.ec-day h2 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.ec-day header span { font-size: 11.5px; font-weight: 500; letter-spacing: 0.1em; color: var(--ec-dim); }
.ec-row { position: relative; border-bottom: 1px solid var(--ec-border); border-radius: 0; transition: background 160ms ease, border-color 160ms ease; }
.ec-row:hover { background: var(--ec-hover); }
.ec-row.open { margin: 6px 0; background: var(--ec-card); border: 1px solid var(--ec-border); border-radius: 14px; }
.ec-main {
  position: relative; width: 100%; display: grid; align-items: center; gap: 0 16px; padding: 16px 18px; background: none; border: none; cursor: pointer; text-align: left; color: inherit;
  grid-template-columns: 92px 24px 58px 88px minmax(0, 1fr) auto 20px;
}
.ec-time { font-size: 14.5px; font-weight: 700; letter-spacing: 0.01em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ec-chip { justify-self: start; padding: 6px 12px; background: var(--ec-chip); border-radius: 8px; font-size: 12.5px; font-weight: 700; }
.ec-impact { justify-self: start; display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 8px; border: 1px solid; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; }
.ec-impact i { width: 9px; height: 9px; border-radius: 50%; }
.ec-impact.high { color: #f0425f; background: rgba(220,40,72,0.13); border-color: rgba(220,40,72,0.38); } .ec-impact.high i { background: radial-gradient(circle at 35% 30%, #ff6a85, #dc2848); }
.ec-impact.medium { color: #f5a524; background: #31240F; border-color: rgba(245,165,36,0.38); } .ec-impact.medium i { background: radial-gradient(circle at 35% 30%, #ffe469, #e0a216); }
.ec-impact.low { color: #3dba6f; background: rgba(61,186,111,0.11); border-color: rgba(61,186,111,0.32); } .ec-impact.low i { background: radial-gradient(circle at 35% 30%, #4ade80, #1f7a45); }
.ec-impact.holiday { color: var(--ec-muted); background: var(--ec-chip); border-color: var(--ec-border); } .ec-impact.holiday i { background: var(--ec-dim); }
.ec-title { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ec-title b { font-size: 15px; font-weight: 600; line-height: 1.3; }
.ec-title small { font-size: 12px; color: var(--ec-dim); }
.ec-stats { display: flex; gap: 8px; }
.ec-stat { width: 84px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ec-stat label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; color: var(--ec-label); cursor: inherit; }
.ec-val, .ec-dash { font-size: 14.5px; font-weight: 500; color: var(--ec-muted); font-variant-numeric: tabular-nums; }
.ec-dash { color: var(--ec-dim); }
.ec-rev { color: #f59e0b; text-decoration: underline dotted; text-underline-offset: 4px; }
.ec-actual { font-size: 14.5px; font-weight: 700; color: var(--ec-text); font-variant-numeric: tabular-nums; }
.ec-wait { display: inline-flex; gap: 4px; height: 20px; align-items: center; }
.ec-wait i { width: 5px; height: 5px; border-radius: 50%; background: var(--ec-blue); animation: ecDot 1s ease-in-out infinite; }
.ec-wait i:nth-child(2) { animation-delay: 0.15s; } .ec-wait i:nth-child(3) { animation-delay: 0.3s; }
@keyframes ecDot { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.15); } }
.ec-count { font-size: 12.5px; font-weight: 700; color: var(--ec-text); white-space: nowrap; }
.ec-chev { color: var(--ec-dim); transition: transform 240ms cubic-bezier(.4,0,.2,1), color 160ms ease; }
.ec-row:hover .ec-chev { color: var(--ec-text); } .ec-row.open .ec-chev { transform: rotate(180deg); }
.ec-next { position: absolute; top: 0; right: 44px; padding: 3px 9px; background: var(--ec-blue); color: #fff; border-radius: 0 0 4px 4px; font-size: 9px; font-weight: 800; letter-spacing: 0.1em; box-shadow: 0 2px 10px rgba(8,100,247,0.4); }

/* expanded */
.ec-exp { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 280ms cubic-bezier(.4,0,.2,1); }
.ec-exp.open { grid-template-rows: 1fr; }
.ec-exp-in { overflow: hidden; min-height: 0; }
.ec-exp-body { margin: 0 18px; padding: 16px 0 20px; border-top: 1px solid var(--ec-border); opacity: 0; transform: translateY(-4px); transition: opacity 220ms ease 60ms, transform 220ms ease 60ms; }
.ec-exp.open .ec-exp-body { opacity: 1; transform: none; }
.ec-exp label { display: inline-block; font-size: 10px; font-weight: 600; letter-spacing: 0.12em; color: var(--ec-label); }
.ec-cat { display: flex; align-items: center; gap: 14px; padding: 4px 0 16px; border-bottom: 1px solid var(--ec-border); }
.ec-cat b { font-size: 14px; font-weight: 600; }
.ec-cat a { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; font-size: 13px; font-weight: 600; color: var(--ec-blue); text-decoration: none; }
.ec-cat a:hover { text-decoration: underline; }
.ec-sum { padding-top: 16px; }
.ec-sum p { margin-top: 10px; font-size: 14px; line-height: 1.65; color: var(--ec-muted); }

/* footer states */
.ec-more { display: flex; justify-content: center; padding: 6px 0 4px; }
.ec-more button { display: inline-flex; align-items: center; gap: 9px; padding: 11px 22px; background: var(--ec-card); border: 1px solid var(--ec-border); border-radius: 11px; color: var(--ec-text); font-size: 13.5px; font-weight: 600; cursor: pointer; transition: border-color 160ms ease, background 160ms ease; }
.ec-more button:hover:not(:disabled) { border-color: rgba(8,100,247,0.5); background: var(--ec-hover); }
.ec-more button.busy { border-color: var(--ec-blue); box-shadow: 0 0 0 3px rgba(8,100,247,0.14); cursor: default; }
.ec-end { text-align: center; padding: 14px 0 6px; font-size: 12px; color: var(--ec-dim); }
.ec-empty, .ec-error { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 54px 0; color: var(--ec-muted); font-size: 14px; text-align: center; }
.ec-empty button, .ec-error button { padding: 9px 18px; background: var(--ec-card); border: 1px solid var(--ec-border); border-radius: 10px; color: var(--ec-text); font-size: 13px; font-weight: 600; cursor: pointer; } .ec-empty button:hover, .ec-error button:hover { border-color: rgba(8,100,247,0.5); }
.ec-error { color: #f0425f; } .ec-error p { color: var(--ec-muted); }

/* responsive */
@media (max-width: 1100px) { .ec-filters { gap: 18px; } .ec-main { grid-template-columns: 84px 24px 54px 84px minmax(0, 1fr) auto 18px; gap: 0 12px; padding: 14px; } .ec-stat { width: 72px; } }
@media (max-width: 820px) {
  .ec-head h1 { font-size: 28px; }
  .ec-tabs, .ec-imp { overflow-x: auto; max-width: 100%; scrollbar-width: none; } .ec-tabs::-webkit-scrollbar, .ec-imp::-webkit-scrollbar { display: none; }
  .ec-main { grid-template-columns: auto auto auto 1fr 18px; grid-template-areas: "time flag chip impact chev" "title title title title title" "stats stats stats stats stats"; gap: 10px 10px; padding: 14px 12px; }
  .ec-time { grid-area: time; } .ec-main > .ec-flag { grid-area: flag; } .ec-chip { grid-area: chip; } .ec-impact { grid-area: impact; } .ec-chev { grid-area: chev; justify-self: end; } .ec-title { grid-area: title; } .ec-stats { grid-area: stats; justify-content: space-between; gap: 4px; } .ec-stat { flex: 1; width: auto; align-items: flex-start; }
  .ec-next { right: 38px; } .ec-exp-body { margin: 0 12px; }
  .ec-day h2 { font-size: 22px; } .ec-search { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .ec *, .ec *::before, .ec *::after { animation: none !important; transition: none !important; } }
`