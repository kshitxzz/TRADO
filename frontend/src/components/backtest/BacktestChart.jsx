import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode, LineStyle,
} from 'lightweight-charts'
import { Loader2 } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import { fmtAxisTick, fmtCrosshairTime } from '../../lib/replayUtils'
import { barsAt, partialBar, tfSecs as tfSecsOf } from '../../lib/backtest/data'
import { createRunner, defOf } from '../../lib/backtest/indicators'
import { makeProjector } from '../../lib/backtest/projector'

export const CANDLE_UP = '#26B570'
export const CANDLE_DOWN = '#D4263A'

function palette(isDark) {
  return isDark
    ? { text: '#9CA3AF', grid: 'rgba(255,255,255,0.045)', cross: 'rgba(255,255,255,0.45)', crossLabel: '#211D26', surface: '#0A0A0D' }
    : { text: '#6B7280', grid: 'rgba(0,0,0,0.07)', cross: 'rgba(0,0,0,0.4)', crossLabel: '#374151', surface: '#F7F6FB' }
}

const toBar = (b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })

/**
 * The backtest chart. Imperative like the Trade Replay chart: one replay tick is
 * one `series.update()`. It renders `children({ projector, version, size, getBars })`
 * on top so the drawing overlay can follow every pan / zoom / price-axis drag.
 *
 *   view   { base, idx, count }  revealed base candles + the timeframe index
 *   tf     chart timeframe key
 */
const BacktestChart = forwardRef(function BacktestChart(
  { view, tf, digits = 2, indicators = [], settings, loading, error, extraPrices, children },
  ref,
) {
  const { isDark } = useTheme()
  const { timeFormat } = useTimeFormat()
  const wrapRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const barsRef = useRef([])
  const tfRef = useRef(tfSecsOf(tf))
  const prev = useRef({ base: null, idx: null, count: 0, tf: null, len: 0 })
  const indRef = useRef(new Map())            // id → { runner, series: {…}, sig }
  const projRef = useRef(null)
  const extraRef = useRef([])
  extraRef.current = extraPrices || []
  const extraKey = (extraPrices || []).join('|')
  const [version, setVersion] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)

  tfRef.current = tfSecsOf(tf)

  // ── create / destroy ───────────────────────────────────────────────────
  useEffect(() => {
    const pal = palette(isDark)
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: pal.text, fontSize: 12,
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: true,
        panes: { separatorColor: 'rgba(255,255,255,0.08)' },
      },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: pal.crossLabel },
        horzLine: { color: pal.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: pal.crossLabel },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 }, minimumWidth: 74 },
      timeScale: {
        borderVisible: false, timeVisible: true, secondsVisible: false,
        rightOffset: 8, barSpacing: 9, minBarSpacing: 0.5,
        tickMarkFormatter: (t, type) => fmtAxisTick(t, tfRef.current, type <= 2),
      },
      localization: { timeFormatter: (t) => fmtCrosshairTime(t, tfRef.current) },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: CANDLE_UP, downColor: CANDLE_DOWN, wickUpColor: CANDLE_UP, wickDownColor: CANDLE_DOWN,
      borderVisible: false, priceLineStyle: LineStyle.Dotted, priceLineWidth: 1,
      // keep open trade levels (entry / SL / TP / pending) inside the visible price range
      autoscaleInfoProvider: (original) => {
        const r = original()
        const extra = extraRef.current
        if (!r || !extra.length) return r
        let { minValue, maxValue } = r.priceRange
        for (const p of extra) { if (p < minValue) minValue = p; if (p > maxValue) maxValue = p }
        return { ...r, priceRange: { minValue, maxValue } }
      },
    })
    chartRef.current = chart
    seriesRef.current = series
    projRef.current = makeProjector({ chart, series, getBars: () => barsRef.current, getTfSecs: () => tfRef.current })
    setReady(true)

    return () => {
      indRef.current.clear()
      projRef.current = null; seriesRef.current = null; chartRef.current = null
      prev.current = { base: null, idx: null, count: 0, tf: null, len: 0 }
      setReady(false)
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── theme / clock format / precision / settings ────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const pal = palette(isDark)
    const showGrid = settings?.grid !== false
    chart.applyOptions({
      layout: { textColor: pal.text },
      grid: { vertLines: { color: showGrid ? pal.grid : 'transparent' }, horzLines: { color: showGrid ? pal.grid : 'transparent' } },
      crosshair: {
        vertLine: { color: pal.cross, labelBackgroundColor: pal.crossLabel },
        horzLine: { color: pal.cross, labelBackgroundColor: pal.crossLabel },
      },
    })
  }, [isDark, settings?.grid, ready])

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: { tickMarkFormatter: (t, type) => fmtAxisTick(t, tfRef.current, type <= 2, timeFormat) },
      localization: { timeFormatter: (t) => fmtCrosshairTime(t, tfRef.current, timeFormat) },
    })
  }, [timeFormat, tf, ready])

  useEffect(() => {
    seriesRef.current?.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } })
  }, [digits, ready])

  useEffect(() => {
    seriesRef.current?.applyOptions({ priceLineVisible: settings?.priceLine !== false, lastValueVisible: settings?.priceLine !== false })
  }, [settings?.priceLine, ready])

  // ── indicators: rebuilt whenever the list changes (panes are assigned in order) ──
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !ready) return
    const map = indRef.current
    for (const entry of map.values()) Object.values(entry.series).forEach(sr => { try { chart.removeSeries(sr) } catch { /* already gone */ } })
    map.clear()

    let pane = 0
    for (const ind of indicators) {
      const def = defOf(ind.type)
      if (!def) continue
      const sub = def.pane === 'sub'
      const paneIdx = sub ? ++pane : 0
      const visible = ind.visible !== false
      const series = {}

      def.outputs.forEach((o) => {
        const color = o.color || ind.color
        const common = { priceLineVisible: false, lastValueVisible: sub, crosshairMarkerVisible: false, visible }
        if (o.kind === 'hist') {
          series[o.key] = chart.addSeries(HistogramSeries, { ...common, color, base: 0, priceFormat: def.type === 'volume' ? { type: 'volume' } : undefined }, paneIdx)
        } else if (o.kind === 'dots') {
          series[o.key] = chart.addSeries(LineSeries, { ...common, color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2 }, paneIdx)
        } else {
          series[o.key] = chart.addSeries(LineSeries, { ...common, color, lineWidth: o.width || 1.5, lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid }, paneIdx)
        }
      })

      if (sub) {
        const first = series[def.outputs[0].key]
        if (def.range) first.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: def.range[0], maxValue: def.range[1] } }) })
        for (const l of def.levels || []) first.createPriceLine({ price: l.value, color: l.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
      }

      const runner = createRunner(ind)
      map.set(ind.id, { runner, series })
      const out = runner.full(barsRef.current)
      for (const k of Object.keys(series)) series[k].setData(out[k] || [])
    }

    // price pane takes the room; oscillator panes stay compact
    try {
      const panes = chart.panes()
      panes.forEach((pn, i) => pn.setStretchFactor(i === 0 ? Math.max(3, (panes.length - 1) * 1.5) : 1))
    } catch { /* older API */ }
  }, [indicators, ready])

  useEffect(() => {
    if (ready) chartRef.current?.priceScale('right').applyOptions({ autoScale: true })
  }, [extraKey, ready])

  // ── data: reveal `count` base candles ──────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current
    if (!chart || !series || !ready) return
    const { base, idx, count } = view || {}
    if (!base || !idx || !count) { series.setData([]); barsRef.current = []; prev.current = { base: null, idx: null, count: 0, tf: null, len: 0 }; return }

    const p = prev.current
    const sameData = p.base === base && p.idx === idx
    const bars = barsRef.current

    if (sameData && count === p.count) return

    if (sameData && count === p.count + 1 && bars.length) {
      // one replay tick
      const bar = partialBar(base, idx, idx.bucketOf[count - 1], count - 1)
      if (bars[bars.length - 1].time === bar.time) bars[bars.length - 1] = bar; else bars.push(bar)
      series.update(toBar(bar))
      for (const e of indRef.current.values()) {
        const out = e.runner.tick(bars)
        for (const k of Object.keys(e.series)) for (const pt of out[k] || []) e.series[k].update(pt)
      }
    } else {
      const prevRange = chart.timeScale().getVisibleLogicalRange()
      const prevLen = p.len
      const next = barsAt(base, idx, count)
      barsRef.current = next
      series.setData(next.map(toBar))
      chart.priceScale('right').applyOptions({ autoScale: true })
      for (const e of indRef.current.values()) {
        const out = e.runner.full(next)
        for (const k of Object.keys(e.series)) e.series[k].setData(out[k] || [])
      }
      const n = next.length
      if (sameData || (p.tf === tf && p.base === base)) {
        // a jump on the same timeframe: keep the user's framing, follow the newest bar
        if (prevRange && prevLen) chart.timeScale().setVisibleLogicalRange({ from: prevRange.from + (n - prevLen), to: prevRange.to + (n - prevLen) })
      } else {
        // first load / timeframe switch: ~110 bars with breathing room on the right
        chart.timeScale().setVisibleLogicalRange({ from: n - 110, to: n + 14 })
      }
    }
    prev.current = { base, idx, count, tf, len: barsRef.current.length }
  }, [view, tf, ready])

  // ── viewport signature → re-render the overlay when anything moves ─────
  useEffect(() => {
    if (!ready) return
    let raf = 0, last = ''
    const loop = () => {
      const chart = chartRef.current, series = seriesRef.current
      if (chart && series) {
        const r = chart.timeScale().getVisibleLogicalRange()
        const ref = barsRef.current[barsRef.current.length - 1]?.close ?? 1
        const y0 = series.priceToCoordinate(ref), y1 = series.priceToCoordinate(ref * 1.01)
        const el = wrapRef.current
        const w = el?.clientWidth || 0, h = el?.clientHeight || 0
        const sig = `${r?.from?.toFixed(3)}|${r?.to?.toFixed(3)}|${y0?.toFixed?.(2)}|${y1?.toFixed?.(2)}|${w}|${h}|${barsRef.current.length}|${ref}`
        if (sig !== last) { last = sig; setVersion(v => v + 1); setSize(s => (s.w === w && s.h === h ? s : { w, h })) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [ready])

  // ── imperative API for the page ────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    projector: () => projRef.current,
    bars: () => barsRef.current,
    pane: () => {
      const chart = chartRef.current
      const ps = chart?.paneSize(0)
      return { w: ps?.width ?? 0, h: ps?.height ?? 0 }
    },
    fit() {
      const n = barsRef.current.length
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true })
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: n - 110, to: n + 14 })
    },
    toLatest() { chartRef.current?.timeScale().scrollToRealTime() },
    /** Zoom to a market-coordinate rectangle. */
    zoomTo({ t0, t1, p0, p1 }) {
      const proj = projRef.current, chart = chartRef.current, series = seriesRef.current
      if (!proj || !chart) return
      const l0 = proj.timeToLogical(Math.min(t0, t1)), l1 = proj.timeToLogical(Math.max(t0, t1))
      if (l0 == null || l1 == null || l1 - l0 < 2) return
      chart.timeScale().setVisibleLogicalRange({ from: l0, to: l1 })
      const lo = Math.min(p0, p1), hi = Math.max(p0, p1)
      if (hi > lo) {
        series.priceScale().applyOptions({ autoScale: false })
        series.priceScale().setVisibleRange({ from: lo, to: hi })
      }
    },
    /** Chart canvas with the overlay SVG composited on top. */
    async screenshot(svgEl) {
      const chart = chartRef.current
      if (!chart) return null
      const base = chart.takeScreenshot()
      if (!svgEl) return base
      try {
        const rect = svgEl.getBoundingClientRect()
        const clone = svgEl.cloneNode(true)
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        clone.setAttribute('width', rect.width); clone.setAttribute('height', rect.height)
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
        const img = new Image()
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
        base.getContext('2d').drawImage(img, 0, 0, rect.width * (base.width / (wrapRef.current.clientWidth || rect.width)), rect.height * (base.height / (wrapRef.current.clientHeight || rect.height)))
        URL.revokeObjectURL(url)
      } catch { /* overlay is a nicety — the plain chart still saves */ }
      return base
    },
  }), [])

  const pal = palette(isDark)
  const api = useMemo(() => ({ projector: projRef.current, version, size, getBars: () => barsRef.current }), [version, size, ready])

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: pal.surface }}>
      <div ref={wrapRef} className="absolute inset-0" />
      {ready && children?.(api)}
      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center gap-2.5"
             style={{ backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', background: 'rgba(8,8,10,0.45)' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-purple-light)' }} />
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{typeof loading === 'string' ? loading : 'Loading market data…'}</span>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6" style={{ background: pal.surface }}>
          <p className="max-w-sm text-center text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      )}
    </div>
  )
})

export default BacktestChart