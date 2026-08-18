import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Wallet, TrendingUp, Flame, Trophy,
  RefreshCw, Plug, Sparkles, Plus, Share2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import PageWrapper from '../components/layout/PageWrapper'
import RollingNumber from '../components/ui/RollingNumber'
import TradeScoreRadar, { computeTradeScore, TradeScoreGrid } from '../components/charts/TradeScoreRadar'
import TradingHeatmap, { pickHeatmapYear } from '../components/charts/TradingHeatmap'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import { computeStats, buildEquityCurve, getTodayPnl, getMonthStats, formatPnl, pnlColor, greeting } from '../lib/utils'
import { checkAndFireCoachAlerts } from '../lib/coachAlertRunner'

// ─── Small rounded icon badge used inside stat tiles ──────────────────────────
function IconBadge({ icon: Icon, color, bg, onClick, title }) {
  const El = onClick ? 'button' : 'div'
  return (
    <El onClick={onClick} title={title}
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform"
        style={{ background: bg || 'rgba(255,255,255,0.05)', cursor: onClick ? 'pointer' : 'default' }}
        onMouseEnter={onClick ? (e => e.currentTarget.style.transform = 'scale(1.06)') : undefined}
        onMouseLeave={onClick ? (e => e.currentTarget.style.transform = 'scale(1)') : undefined}>
      <Icon size={15} style={{ color: color || 'var(--text-muted)' }} />
    </El>
  )
}

// ─── Large top stat card ──────────────────────────────────────────────────────
// Pass `rawValue` + `format` to render through RollingNumber — each digit
// rolls vertically to its new value (odometer-style) whenever `rawValue`
// changes, matching the broker's own live P&L ticker. This applies any time
// the number can change (Today, Total P&L, Balance), not just while a
// position happens to be open. `showLiveDot` is purely cosmetic — it shows
// the pulsing "LIVE" badge for cards actively streaming from an open
// position. Omit `rawValue`/`format` and pass a pre-formatted `value`
// string for static cards.
function BigCard({ label, value, rawValue, format, valueColor, sub, icon: Icon, iconColor, iconBg, onShare, showLiveDot, children }) {
  return (
    <div className="stat-tile p-6">
      <div className="flex items-start justify-between mb-4">
        <span className="text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          {label}
          {showLiveDot && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ color: 'var(--positive-green)', background: 'rgba(34,197,94,0.12)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--positive-green)' }} />
              LIVE
            </span>
          )}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onShare && <IconBadge icon={Share2} onClick={onShare} title="Share this stat" />}
          {Icon && <IconBadge icon={Icon} color={iconColor} bg={iconBg} />}
        </div>
      </div>
      {format ? (
        <RollingNumber value={rawValue} format={format}
                        className="text-3xl font-bold leading-tight" style={{ color: valueColor || 'var(--text-primary)' }} />
      ) : (
        <p className="text-3xl font-bold leading-tight" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
      )}
      {sub && <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      {children}
    </div>
  )
}

// ─── Small secondary stat card ────────────────────────────────────────────────
function SmallCard({ label, value, valueColor, sub, subColor, icon: Icon, iconColor, iconBg }) {
  return (
    <div className="stat-tile p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
        {Icon && <IconBadge icon={Icon} color={iconColor} bg={iconBg} />}
      </div>
      <p className="text-2xl font-bold leading-none" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1.5" style={{ color: subColor || 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { user, profile } = useAuth()
  const { trades, account, loading, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const navigate = useNavigate()

  const stats = computeStats(trades)
  const curve = buildEquityCurve(trades)
  const today = getTodayPnl(trades)
  const monthStats = getMonthStats(trades)
  const monthName  = new Date().toLocaleDateString('en-US', { month: 'long' })
  const name  = profile?.full_name || user?.user_metadata?.full_name || 'Trader'

  const closedTrades = trades.filter(t => t.status === 'closed')
  const openCount    = trades.filter(t => t.status === 'open').length

  // Dashboard is the highest-traffic page after login, so the coach-rule
  // check runs here (once trades/account have actually loaded) instead of
  // only ever firing when someone happens to have the AI Alerts tab open.
  // Any alert this creates is picked up app-wide by NotificationsProvider's
  // realtime subscription — this effect only needs to create the row.
  useEffect(() => {
    if (loading || !user?.id) return
    checkAndFireCoachAlerts({
      userId: user.id,
      trades,
      coachSettings: profile?.coach_settings,
      accountBalance: account?.balance != null ? parseFloat(account.balance) : null,
      emailEnabled: !!profile?.notification_settings?.email,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id])

  // ── Current balance: prefer the real broker-synced balance, fall back to a
  //    notional starting balance + cumulative P&L for brand-new manual
  //    accounts that don't carry a `balance` field — but show $0 when
  //    there's no connected account at all, rather than a fake estimate.
  const currentBalance = account?.balance != null
    ? parseFloat(account.balance)
    : account
      ? 10000 + stats.totalPnl
      : 0

  // ── Best day: group closed trades by date, find the highest total P&L day
  const bestDay = useMemo(() => {
    const map = {}
    closedTrades.forEach(t => {
      const key = t.closed_at?.slice(0, 10)
      if (!key) return
      map[key] = (map[key] || 0) + (t.pnl || 0)
    })
    const entries = Object.entries(map)
    if (!entries.length) return null
    const [date, pnl] = entries.reduce((best, cur) => cur[1] > best[1] ? cur : best)
    return { date, pnl }
  }, [closedTrades])

  // ── Trade Score (6-axis radar + overall score) ───────────────────────────
  const tradeScore = useMemo(() => computeTradeScore(trades, curve), [trades, curve])
  const heatmapYear = useMemo(() => pickHeatmapYear(trades), [trades])
  const yearTradeCount = useMemo(() =>
    closedTrades.filter(t => new Date(t.closed_at).getFullYear() === heatmapYear).length,
  [closedTrades, heatmapYear])

  // ── Analytical Overview: P&L by symbol ────────────────────────────────────
  const bySymbol = useMemo(() => {
    const m = {}
    closedTrades.forEach(t => {
      if (!t.symbol) return
      if (!m[t.symbol]) m[t.symbol] = { symbol: t.symbol, pnl: 0 }
      m[t.symbol].pnl += t.pnl || 0
    })
    return Object.values(m).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 6)
  }, [closedTrades])
  const maxSymbolAbs = Math.max(1, ...bySymbol.map(s => Math.abs(s.pnl)))

  // ── Analytical Overview: equity curve, formatted for a labeled axis ──────
  const equityChartData = useMemo(() =>
    curve.map(pt => ({ ...pt, label: pt.date ? new Date(pt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' })),
  [curve])

  // ── AI take on the Trade Score — purely supplementary text, fetched in the
  //    background. The radar itself never waits on this: it's computed
  //    instantly and locally from real trade data above, so it renders the
  //    moment the page loads regardless of whether this call succeeds.
  const [aiTake, setAiTake] = useState('')
  const [aiTakeLoading, setAiTakeLoading] = useState(false)
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

  useEffect(() => {
    if (closedTrades.length === 0) { setAiTake(''); return }
    let cancelled = false
    setAiTakeLoading(true)
    const axesMap = Object.fromEntries(tradeScore.axes.map(a => [a.dimension, a.value]))

    fetch(`${backendUrl}/api/ai/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'trade_score_take',
        trades: closedTrades.slice(0, 20),
        axes: axesMap,
        overall: tradeScore.overall,
      }),
    })
      .then(res => res.json())
      .then(data => { if (!cancelled) setAiTake(data.content?.trim() || '') })
      .catch(() => { if (!cancelled) setAiTake('') })
      .finally(() => { if (!cancelled) setAiTakeLoading(false) })

    return () => { cancelled = true }
  }, [closedTrades.length, tradeScore.overall])

  if (loading) return (
    <PageWrapper>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {[...Array(3)].map((_,i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_,i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
    </PageWrapper>
  )

  return (
    <PageWrapper>
      {/* ── Greeting row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Good {greeting()},{' '}
            <span style={{ color: 'var(--accent-purple-light)' }}>{name}</span>
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Here's your trading performance overview</p>
        </div>

        {!account ? (
          <button onClick={() => navigate('/accounts')} className="btn-teal text-sm px-4 py-2">
            <Plug size={14} /> Connect Account
          </button>
        ) : isManualAccount ? (
          <button onClick={() => navigate('/trades')} className="btn-primary text-sm px-4 py-2">
            <Plus size={14} /> Add Trade
          </button>
        ) : (
          <button onClick={syncTrades} disabled={syncing}
                  className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Trades'}
          </button>
        )}
      </div>

      {/* ── No account CTA ────────────────────────────────────────────────── */}
      {!account && (
        <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
                    className="glass-card p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Connect your MT5 account</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Link your account and sync trades automatically</p>
          </div>
        </motion.div>
      )}

      {/* ── Row 1: 3 large stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

        {/* Today — while any position is open, the headline switches fully
            to live unrealized P&L (that's the number that matters right
            now). The moment nothing is open, it switches back to plain
            today's realized P&L, exactly as before. */}
        <BigCard
          label="Today"
          rawValue={today.openCount > 0 ? today.unrealized : today.realized}
          format={formatPnl}
          valueColor={pnlColor(today.openCount > 0 ? today.unrealized : today.realized)}
          sub={
            today.openCount > 0
              ? `Unrealized · ${today.openCount} open position${today.openCount > 1 ? 's' : ''}`
              : new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })
          }
          icon={Activity} iconColor="#22C55E" iconBg="rgba(34,197,94,0.12)"
          onShare={() => navigate('/share-cards')}
        >
          {today.openCount > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22C55E' }} />
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: '#22C55E' }}>
                LIVE
              </span>
            </div>
          )}
        </BigCard>

        {/* Current Balance — moves with every trade update (open P&L ticking
            or a trade closing), so it gets the same rolling-digit treatment
            as Today/Total P&L. */}
        <BigCard
          label="Current Balance"
          rawValue={currentBalance}
          format={(v) => `$${v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
          sub={account ? `${account.broker_name || 'MT5'} · #${account.account_number}` : 'Broker account'}
          icon={Wallet} iconColor="#8B5CF6" iconBg="rgba(139,92,246,0.12)"
        />

        {/* Total P&L — the full picture: every closed trade's realized P&L
            plus any open position's live unrealized P&L, exactly like the
            broker's own tile. Ticks in real time while positions are open. */}
        <BigCard
          label="Total P&L"
          rawValue={stats.totalPnl}
          format={formatPnl}
          valueColor={pnlColor(stats.totalPnl)}
          showLiveDot={openCount > 0}
          icon={TrendingUp} iconColor="#22C55E" iconBg="rgba(34,197,94,0.12)"
        >
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Gross P&L</span>
            <RollingNumber value={stats.totalPnl} format={formatPnl}
                            className="text-sm font-semibold" style={{ color: pnlColor(stats.totalPnl) }} />
          </div>
          <div className="flex items-center gap-1.5 text-sm mt-3 pt-3"
               style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            <span>{trades.length} trades</span>
            <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>·</span>
            <span style={{ color: '#A78BFA', fontWeight: 600 }}>{openCount} open</span>
            <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>·</span>
            <span>{stats.winRate.toFixed(0)}% win rate</span>
          </div>
        </BigCard>
      </div>

      {/* ── Row 2: 4 small stat cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

        <SmallCard
          label="Streak"
          value={<><span style={{ color: stats.streakType==='win' ? '#22C55E' : '#EF4444' }}>{stats.streak}</span>{' '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                    {stats.streakType==='win' ? 'wins' : 'losses'}
                  </span></>}
          sub={stats.streak === 0 ? 'No trades yet' : stats.streakType==='win' ? "🔥 You're on fire!" : '❄️ Cold streak'}
          subColor={stats.streakType==='win' ? '#F59E0B' : '#60A5FA'}
          icon={Flame} iconColor={stats.streakType==='win' ? '#F59E0B' : '#6B7280'}
          iconBg={stats.streakType==='win' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)'}
        />

        <div className="stat-tile p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{monthName}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <IconBadge icon={Share2} onClick={() => navigate('/share-cards')} title="Share this stat" />
              <TrendingUp size={15} style={{ color: pnlColor(monthStats.pnl) }} />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none" style={{ color: pnlColor(monthStats.pnl) }}>
            {formatPnl(monthStats.pnl)}
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {monthStats.count} {monthStats.count === 1 ? 'trade' : 'trades'} this month
          </p>
        </div>

        <SmallCard
          label="Biggest Win"
          value={`+$${Math.max(0, stats.bestTrade).toFixed(2)}`}
          valueColor="#22C55E"
          sub="Single trade best"
          icon={TrendingUp} iconColor="#22C55E" iconBg="rgba(34,197,94,0.12)"
        />

        <SmallCard
          label="Best Day"
          value={bestDay ? `${bestDay.pnl>=0?'+':'-'}$${Math.abs(bestDay.pnl).toFixed(2)}` : '—'}
          valueColor="#F59E0B"
          sub={bestDay ? new Date(bestDay.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'No trades yet'}
          icon={Trophy} iconColor="#F59E0B" iconBg="rgba(245,158,11,0.12)"
        />
      </div>

      {/* ── Row 3: Trade Score + Trading Activity — side by side ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Trade Score */}
        <div className="glass-card p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Trade Score</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Your overall trading performance</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold leading-none" style={{ color: tradeScore.labelColor }}>{tradeScore.overall}</p>
              <p className="text-xs font-semibold mt-1" style={{ color: tradeScore.labelColor }}>{tradeScore.label}</p>
            </div>
          </div>

          <div className="max-w-lg mx-auto">
            <TradeScoreRadar axes={tradeScore.axes} height={260} />
          </div>

          <TradeScoreGrid axes={tradeScore.axes} />

          {/* AI take — supplementary only; radar above never waits on this */}
          {(aiTakeLoading || aiTake) && (
            <div className="flex items-start gap-2 mt-1 pt-3 px-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <Sparkles size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-purple-light)' }} />
              {aiTakeLoading ? (
                <div className="h-3.5 rounded animate-pulse w-3/4" style={{ background: 'var(--border-subtle)' }} />
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{aiTake}</p>
              )}
            </div>
          )}
        </div>

        {/* Trading Activity */}
        <div className="glass-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>Trading Activity</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {yearTradeCount} trades in {heatmapYear}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              <div className="flex items-center gap-1">
                <span>Loss</span>
                <div className="flex gap-0.5">
                  {['#4c1018','#9f1239','#dc2626','#ef4444','#f87171'].map((c,i) => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span>Profit</span>
                <div className="flex gap-0.5">
                  {['#0f3d22','#15803d','#16a34a','#22c55e','#4ade80'].map((c,i) => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <TradingHeatmap trades={trades} year={heatmapYear} compact />
        </div>
      </div>

      {/* ── Row 4: Analytical Overview — Equity Curve + P&L by Symbol ──────── */}
      <div className="mt-4">
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Analytical Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Equity Curve */}
          <div className="glass-card p-5">
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Equity Curve</h3>
            <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-muted)' }}>Cumulative P&L over time</p>
            {equityChartData.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: 240 }}>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
              </div>
            ) : (
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                           axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                           tickFormatter={v => `$${v.toLocaleString('en-US')}`} width={64} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const v = payload[0].value
                      return (
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                          <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
                          <p style={{ color: v >= 0 ? 'var(--positive-green)' : 'var(--negative-red)', fontWeight: 700 }}>
                            {v >= 0 ? '+' : ''}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )
                    }} cursor={{ stroke: 'var(--border-subtle)' }} />
                    <Line type="monotone" dataKey="pnl" stroke="#8B5CF6" strokeWidth={2}
                          dot={false} activeDot={{ r: 4, fill: '#8B5CF6', strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* P&L by Symbol */}
          <div className="glass-card p-5">
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>P&L by Symbol</h3>
            <p className="text-xs mt-0.5 mb-4" style={{ color: 'var(--text-muted)' }}>Best & worst performing pairs</p>
            {bySymbol.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: 240 }}>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No trade data yet</p>
              </div>
            ) : (
              <div className="space-y-3.5" style={{ minHeight: 240 }}>
                {bySymbol.map(s => (
                  <div key={s.symbol} className="flex items-center gap-3">
                    <span className="text-sm font-semibold w-20 flex-shrink-0 truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.symbol}
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
                      <div style={{
                        width: `${Math.max(4, (Math.abs(s.pnl) / maxSymbolAbs) * 100)}%`, height: '100%',
                        background: s.pnl >= 0 ? 'linear-gradient(90deg,#16a34a,#4ade80)' : 'linear-gradient(90deg,#dc2626,#f87171)',
                        borderRadius: 999,
                      }} />
                    </div>
                    <span className="text-sm font-bold w-28 text-right flex-shrink-0" style={{ color: pnlColor(s.pnl) }}>
                      {formatPnl(s.pnl)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Floating help */}
      <button className="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-2xl z-50"
              style={{ background: 'var(--gradient-primary)', boxShadow: '0 4px 20px rgba(139,92,246,0.4)' }}>?</button>
    </PageWrapper>
  )
}