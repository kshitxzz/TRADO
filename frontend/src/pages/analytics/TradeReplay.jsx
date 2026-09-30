import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, Info, Play } from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import TradeList from '../../components/replay/TradeList'
import TradeSummaryBar from '../../components/replay/TradeSummaryBar'
import ReplayControls from '../../components/replay/ReplayControls'
import ReplayChart, { CANDLE_DOWN, CANDLE_UP } from '../../components/replay/ReplayChart'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'
import { useReplayCandles } from '../../hooks/useReplayCandles'
import {
  BASE_TICK_MS, DEFAULT_TIMEFRAME, buildReplayPlan, calibrateFeed, fmtPnl, fmtReplayClock,
  livePnl, pricePrecision, replayableTrades, shiftCandles, tfByKey,
} from '../../lib/replayUtils'

function EmptyState() {
  return (
    <div className="glass-card flex flex-col items-center justify-center text-center px-6 py-16 min-h-[260px]">
      <Play size={26} strokeWidth={1.5} className="mb-4" style={{ color: 'var(--text-muted)' }} />
      <h2 className="text-lg font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Select a trade to replay</h2>
      <p className="text-[13px] max-w-sm" style={{ color: 'var(--text-muted)' }}>
        Choose a trade from the list to replay it with real market data, entry/exit markers, and playback controls
      </p>
    </div>
  )
}

export default function TradeReplay() {
  const { user } = useAuth()
  const { trades, account, syncing, syncTrades, isManualAccount } = useTrades(user?.id)
  const [params, setParams] = useSearchParams()

  // ── Trades ───────────────────────────────────────────────────────────────
  const all = useMemo(() => replayableTrades(trades, Infinity), [trades])
  const [selectedId, setSelectedId] = useState(null)
  const trade = useMemo(() => all.find(t => t.id === selectedId) || null, [all, selectedId])

  // The list shows the 100 most recent; if a deep link points further back,
  // pin that trade to the top so it is still visible + highlighted.
  const list = useMemo(() => {
    const top = all.slice(0, 100)
    if (trade && !top.some(t => t.id === trade.id)) return [trade, ...top.slice(0, 99)]
    return top
  }, [all, trade])

  // Deep links from Day View: ?trade=<id> or ?date=YYYY-MM-DD (that day's first trade).
  const tradeParam = params.get('trade')
  const dateParam  = params.get('date')
  const appliedRef = useRef('')
  useEffect(() => {
    const key = tradeParam ? `t:${tradeParam}` : dateParam ? `d:${dateParam}` : ''
    if (!key || !all.length || appliedRef.current === key) return
    let target = null
    if (tradeParam) target = all.find(t => t.id === tradeParam)
    else {
      target = all
        .filter(t => t.closedAt.slice(0, 10) === dateParam) // same day-key Day View groups by
        .sort((a, b) => a.entryTs - b.entryTs)[0]
    }
    appliedRef.current = key
    if (target) setSelectedId(target.id)
  }, [tradeParam, dateParam, all])

  function selectTrade(id) {
    appliedRef.current = `t:${id}`
    setSelectedId(id)
    setParams({ trade: id }, { replace: true })
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME)
  const tf = tfByKey(timeframe)
  const { candles: rawCandles, loading, error, ready } = useReplayCandles(trade, timeframe)
  const plan = useMemo(() => (ready && trade ? buildReplayPlan(rawCandles, trade, tf.secs) : null), [ready, rawCandles, trade, tf.secs])

  const precision = useMemo(
    () => (trade ? pricePrecision(trade.symbol, trade.entryPrice, trade.exitPrice, rawCandles[0]?.close) : 2),
    [trade, rawCandles],
  )

  // Free feeds aren't the trader's broker feed — line the candles up with the
  // fills when the difference is a clean constant (see calibrateFeed).
  const calibration = useMemo(() => (plan && trade ? calibrateFeed(rawCandles, plan, trade) : null), [plan, rawCandles, trade])
  const candles = useMemo(
    () => (calibration?.applied ? shiftCandles(rawCandles, calibration.offset, precision) : rawCandles),
    [rawCandles, calibration, precision],
  )


  // ── Replay engine ────────────────────────────────────────────────────────
  // `replay` is tied to the exact dataset it was started on, so changing trade
  // or timeframe (→ new candles) silently drops back to the overview.
  const [replay, setReplay] = useState(null)     // { candles, count } | null
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const inReplay = !!replay && replay.candles === candles && !!plan
  const mode = inReplay ? 'replay' : 'overview'
  const total = ready ? candles.length : 0
  const count = inReplay ? Math.min(replay.count, total) : total
  const isPlaying = playing && inReplay

  useEffect(() => { setPlaying(false) }, [candles])

  // Tick: reveal one more candle every BASE_TICK_MS / speed.
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setReplay(r => (r && r.candles === candles ? { ...r, count: r.count + 1 } : r))
    }, BASE_TICK_MS / speed)
    return () => clearInterval(id)
  }, [isPlaying, speed, candles])

  // Stop once the trade has played out (exit + a few trailing candles).
  useEffect(() => {
    if (isPlaying && plan && count >= plan.endCount) setPlaying(false)
  }, [isPlaying, plan, count])

  const finished = inReplay && !!plan && count >= plan.endCount && !isPlaying

  function togglePlay() {
    if (!plan) return
    if (isPlaying) { setPlaying(false); return }
    if (inReplay && count < plan.endCount) { setPlaying(true); return } // resume
    setReplay({ candles, count: plan.startCount })                       // (re)start
    setPlaying(true)
  }
  function resetReplay() { setReplay(null); setPlaying(false) }

  // ── Derived display ──────────────────────────────────────────────────────
  const lastIdx = count - 1
  const live = useMemo(() => {
    if (!inReplay || !plan || !trade) return null
    if (lastIdx >= plan.entryIdx && lastIdx < plan.exitIdx) return livePnl(trade, candles[lastIdx].close)
    return null
  }, [inReplay, plan, trade, lastIdx, candles])

  // Markers are pinned to the exact fill price (not to the candle's edge).
  const markers = useMemo(() => {
    if (!plan || !trade) return []
    const long = trade.side === 'long'
    const px = (n) => n.toFixed(precision)
    return [
      {
        time: candles[plan.entryIdx].time,
        position: 'atPriceMiddle',
        price: trade.entryPrice,
        shape: long ? 'arrowUp' : 'arrowDown',
        color: CANDLE_UP,
        text: `Entry @ ${px(trade.entryPrice)}`,
      },
      {
        time: candles[plan.exitIdx].time,
        position: 'atPriceMiddle',
        price: trade.exitPrice,
        shape: long ? 'arrowDown' : 'arrowUp',
        color: trade.pnl >= 0 ? CANDLE_UP : CANDLE_DOWN,
        text: `Exit @ ${px(trade.exitPrice)}`,
      },
    ]
  }, [plan, trade, candles, precision])

  const progressLabel = inReplay && candles[lastIdx] ? fmtReplayClock(candles[lastIdx], tf.secs) : ''
  const counter = `${count}/${total}`

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <BarChart3 size={18} style={{ color: 'var(--accent-purple)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Trade Replay</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Replay your trades with real market data</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
        <TradeList trades={list} selectedId={trade?.id} onSelect={selectTrade} />

        {!trade ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 min-w-0">
            <TradeSummaryBar trade={trade} precision={precision} livePnl={live} />

            <ReplayControls
              timeframe={timeframe} onTimeframe={setTimeframe}
              speed={speed} onSpeed={setSpeed}
              playing={isPlaying} canPlay={!!plan && !loading}
              onTogglePlay={togglePlay} onReset={resetReplay}
              progressLabel={progressLabel} counter={counter}
            />

            <div className="glass-card p-4">
              <div className="h-[380px] sm:h-[480px] xl:h-[520px]">
                <ReplayChart
                  candles={candles} count={count} mode={mode} view={plan?.view}
                  markers={markers} precision={precision} tfSecs={tf.secs}
                  ready={ready} loading={loading} error={error}
                >
                  {(calibration?.applied || calibration?.mismatch) && ready && (
                    <div
                      className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]"
                      title={calibration.applied
                        ? 'Free market data is a different price feed than your broker’s. Candles were shifted by a constant amount so your entry and exit line up with the candles.'
                        : 'Your entry/exit prices don’t line up with this market-data feed, so candle prices may differ from your broker’s.'}
                      style={{
                        background: 'rgba(20,20,26,0.82)',
                        border: `1px solid ${calibration.mismatch ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        color: calibration.mismatch ? 'var(--warning-orange)' : 'var(--text-muted)',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <Info size={12} />
                      {calibration.applied
                        ? `Aligned to your fills (${calibration.offset > 0 ? '+' : '−'}$${Math.abs(calibration.offset).toFixed(2)} vs feed)`
                        : 'Feed prices differ from your fills'}
                    </div>
                  )}

                  {finished && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
                      className="absolute right-4 bottom-4 z-10 rounded-xl px-4 py-3 text-left"
                      style={{
                        background: trade.pnl >= 0 ? 'rgba(52,211,153,0.10)' : 'rgba(244,63,94,0.10)',
                        border: `1px solid ${trade.pnl >= 0 ? 'rgba(52,211,153,0.28)' : 'rgba(244,63,94,0.28)'}`,
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] mb-1" style={{ color: 'var(--text-muted)' }}>
                        Trade completed
                      </p>
                      <p className="text-2xl font-bold leading-none tabular-nums"
                         style={{ color: trade.pnl >= 0 ? 'var(--positive-green-bright)' : 'var(--negative-red)' }}>
                        {fmtPnl(trade.pnl)}
                      </p>
                    </motion.div>
                  )}
                </ReplayChart>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}