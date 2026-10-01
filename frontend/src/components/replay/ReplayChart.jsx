import { useEffect, useRef } from 'react'
import {
  createChart, createSeriesMarkers, CandlestickSeries,
  ColorType, CrosshairMode, LineStyle,
} from 'lightweight-charts'
import { Loader2, CircleAlert } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { REPLAY_BAR_SPACING, fmtAxisTick, fmtCrosshairTime } from '../../lib/replayUtils'

export const CANDLE_UP   = '#26B570'
export const CANDLE_DOWN = '#D4263A'

function palette(isDark) {
  return isDark
    ? {
        text: '#9CA3AF',
        grid: 'rgba(255,255,255,0.045)',
        cross: 'rgba(255,255,255,0.55)',
        crossLabel: '#211D26',
        surface: '#0B0B0E',
      }
    : {
        text: '#6B7280',
        grid: 'rgba(0,0,0,0.07)',
        cross: 'rgba(0,0,0,0.45)',
        crossLabel: '#374151',
        surface: '#F7F6FB',
      }
}

const toBar = (c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })

/**
 * The chart itself. It is *driven* by props but talks to Lightweight Charts
 * imperatively, so a replay tick is one `series.update()` — no re-creating the
 * chart and no re-setting the whole dataset.
 *
 *   candles  full dataset for this trade / timeframe
 *   count    how many candles are revealed (candles.slice(0, count))
 *   mode     'overview' → whole dataset, framed around the trade
 *            'replay'   → follows the newest revealed candle
 *   markers  [{ time, position, shape, color, text }] — shown once revealed
 */
export default function ReplayChart({
  candles, count, mode, view, markers, precision, tfSecs,
  ready, loading, error, children,
}) {
  const { isDark } = useTheme()
  const wrapRef   = useRef(null)
  const chartRef  = useRef(null)
  const seriesRef = useRef(null)
  const markerApi = useRef(null)
  const tfRef     = useRef(tfSecs)
  const last      = useRef({ candles: null, count: 0, mode: null })

  tfRef.current = tfSecs

  // ── Create / destroy ───────────────────────────────────────────────────
  useEffect(() => {
    const pal = palette(isDark)
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: pal.text,
        fontSize: 12,
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: true, // keeps the required TradingView credit visible
      },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: pal.crossLabel },
        horzLine: { color: pal.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: pal.crossLabel },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.14 } },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 14,
        minBarSpacing: 2,
        tickMarkFormatter: (time, type) => fmtAxisTick(time, tfRef.current, type <= 2),
      },
      localization: { timeFormatter: (time) => fmtCrosshairTime(time, tfRef.current) },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CANDLE_UP, downColor: CANDLE_DOWN,
      wickUpColor: CANDLE_UP, wickDownColor: CANDLE_DOWN,
      borderVisible: false,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
    })

    chartRef.current = chart
    seriesRef.current = series
    markerApi.current = createSeriesMarkers(series, [])

    return () => {
      markerApi.current = null
      seriesRef.current = null
      chartRef.current = null
      last.current = { candles: null, count: 0, mode: null }
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Theme ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const pal = palette(isDark)
    chart.applyOptions({
      layout: { textColor: pal.text },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      crosshair: {
        vertLine: { color: pal.cross, labelBackgroundColor: pal.crossLabel },
        horzLine: { color: pal.cross, labelBackgroundColor: pal.crossLabel },
      },
    })
  }, [isDark])

  // ── Price precision ────────────────────────────────────────────────────
  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision },
    })
  }, [precision])

  // ── Data: reveal `count` candles ───────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return

    // Nothing usable (error / no trade): clear the pane.
    if (!ready) {
      if (!loading && !candles.length) {
        series.setData([])
        markerApi.current?.setMarkers([])
        last.current = { candles: null, count: 0, mode: null }
      }
      return // while loading, keep showing the previous chart (blurred)
    }

    const prev = last.current
    const sequential =
      mode === 'replay' &&
      prev.mode === 'replay' &&
      prev.candles === candles &&
      count === prev.count + 1

    if (sequential) {
      series.update(toBar(candles[count - 1]))
    } else {
      series.setData(candles.slice(0, count).map(toBar))

      const ts = chart.timeScale()
      if (mode === 'overview' && view) {
        ts.setVisibleLogicalRange({ from: view.from - 0.5, to: view.to + 0.5 })
      } else {
        // Replay start / restart / scrub: frame the newest candle at the right.
        const width = wrapRef.current?.clientWidth || 700
        const bars = Math.max(12, Math.floor((width - 64) / REPLAY_BAR_SPACING))
        ts.setVisibleLogicalRange({ from: count - 1 - (bars - 4), to: count - 1 + 3 })
      }
    }

    last.current = { candles, count, mode }
  }, [ready, loading, candles, count, mode, view])

  // ── Markers (only once their candle has been revealed) ─────────────────
  useEffect(() => {
    const api = markerApi.current
    if (!api) return
    if (!ready || !candles.length || !count) { api.setMarkers([]); return }
    const lastTime = candles[Math.min(count, candles.length) - 1].time
    api.setMarkers(
      markers
        .filter(m => m.time <= lastTime)
        .sort((a, b) => a.time - b.time)
        .map(m => ({ ...m, size: 1 })),
    )
  }, [ready, candles, count, markers])

  const pal = palette(isDark)

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden" style={{ background: pal.surface }}>
      <div ref={wrapRef} className="absolute inset-0" />

      {children}

      {/* Loading: blur whatever was on screen behind a spinner */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center gap-2.5"
             style={{ backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', background: 'rgba(8,8,10,0.28)' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-purple-light)' }} />
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading market data…</span>
        </div>
      )}

      {/* Failed / no data */}
      {!loading && error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6" style={{ background: pal.surface }}>
          <div className="max-w-sm text-center">
            <div className="w-11 h-11 rounded-xl mx-auto mb-3 flex items-center justify-center"
                 style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <CircleAlert size={20} style={{ color: 'var(--warning-orange)' }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Market data unavailable</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {error}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}