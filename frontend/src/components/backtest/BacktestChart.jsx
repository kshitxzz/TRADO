import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode, LineStyle, PriceScaleMode,
} from 'lightweight-charts'
import { Loader2, Minus, Plus, ChevronLeft, ChevronRight, RotateCcw, Maximize2, X } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { barsAt, partialBar, tfSecs as tfSecsOf } from '../../lib/backtest/data'
import { createRunner, defOf } from '../../lib/backtest/indicators'
import { makeProjector } from '../../lib/backtest/projector'
import { themeColors, quoteLabel } from '../../lib/backtest/chartSettings'

export const CANDLE_UP = '#26B570'
export const CANDLE_DOWN = '#D4263A'

const LS = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted }
const CLEAR = 'rgba(0,0,0,0)'
const LABEL_MODES = {
  'name-value-line': { name: true, value: true, line: true }, 'name-value': { name: true, value: true, line: false },
  'value-line': { name: false, value: true, line: true }, value: { name: false, value: true, line: false },
  line: { name: false, value: false, line: true }, hidden: { name: false, value: false, line: false },
}

// ── candle colouring ─────────────────────────────────────────────────────
const candleOptions = (sy) => ({
  upColor: sy.body.on ? sy.body.up : CLEAR, downColor: sy.body.on ? sy.body.down : CLEAR,
  borderVisible: sy.borders.on, borderUpColor: sy.borders.up, borderDownColor: sy.borders.down,
  wickVisible: sy.wick.on, wickUpColor: sy.wick.up, wickDownColor: sy.wick.down,
})
/** Chart point for a bar; with "colour bars based on previous close" each point carries its own colours. */
function pointOf(b, prevClose, sy) {
  const p = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }
  if (sy.colorByPrevClose) {
    const up = b.close >= (prevClose ?? b.open)
    p.color = sy.body.on ? (up ? sy.body.up : sy.body.down) : CLEAR
    p.borderColor = up ? sy.borders.up : sy.borders.down
    p.wickColor = up ? sy.wick.up : sy.wick.down
  }
  return p
}
const pointsOf = (bars, sy) => bars.map((b, i) => pointOf(b, i ? bars[i - 1].close : null, sy))

/** Last defined value of each output — feeds the indicator legend. */
function trackLast(entry, out) {
  for (const k of Object.keys(out)) {
    for (let i = out[k].length - 1; i >= 0; i--) if (out[k][i].value != null) { entry.last[k] = out[k][i].value; break }
  }
}

const IconBtn = ({ title, onClick, children, active }) => (
  <button type="button" title={title} onClick={onClick} onPointerDown={(e) => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center rounded-md text-[11px] font-semibold transition-colors hover:bg-white/15"
          style={{ color: active ? '#fff' : 'rgba(229,231,235,0.85)', background: active ? 'rgba(139,92,246,0.85)' : 'rgba(23,21,29,0.88)', border: '1px solid rgba(255,255,255,0.1)' }}>
    {children}
  </button>
)

/**
 * The backtest chart. Imperative like the Trade Replay chart: one replay tick is one `series.update()`.
 * It renders `children({ projector, version, size, getBars })` on top so the drawing overlay follows every
 * pan / zoom / price-axis drag.
 *
 *   view   { base, idx, count }  revealed base candles + the timeframe index
 *   cs     the full chart-settings object (see lib/backtest/chartSettings)
 */
const BacktestChart = forwardRef(function BacktestChart(
  {
    view, tf, tfName = '', digits = 2, indicators = [], cs, tzFmt, symbol = '', description = '', scaleMode, onScaleMode,
    marks = [], loading, error, extraPrices, onClosePane, children,
  },
  ref,
) {
  const { isDark } = useTheme()
  const wrapRef = useRef(null)
  const rootRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const markersApi = useRef(null)
  const barsRef = useRef([])
  const tfRef = useRef(tfSecsOf(tf))
  const csRef = useRef(cs)
  const fmtRef = useRef(tzFmt)
  const marksRef = useRef(marks)
  const prev = useRef({ base: null, idx: null, count: 0, tf: null, len: 0 })
  const indRef = useRef(new Map())            // id → { runner, series, pane, last }
  const projRef = useRef(null)
  const crossCbs = useRef(new Set())
  const extraRef = useRef([])
  const [version, setVersion] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [maxPane, setMaxPane] = useState(null)

  tfRef.current = tfSecsOf(tf)
  csRef.current = cs
  fmtRef.current = tzFmt
  marksRef.current = marks
  extraRef.current = extraPrices || []
  const extraKey = (extraPrices || []).join('|')
  const th = themeColors(isDark)
  const sc = cs.scales, cv = cs.canvas, sy = cs.symbol
  const left = sc.placement === 'left'
  const scaleId = left ? 'left' : 'right'

  // ── create / destroy ───────────────────────────────────────────────────
  useEffect(() => {
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' }, textColor: th.scaleText, fontSize: 12,
        fontFamily: getComputedStyle(document.body).fontFamily, attributionLogo: true, panes: { separatorColor: 'rgba(255,255,255,0.08)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { minimumWidth: 74 }, leftPriceScale: { minimumWidth: 74 },
      timeScale: { timeVisible: true, secondsVisible: false, barSpacing: 9, minBarSpacing: 0.5 },
    })
    const series = chart.addSeries(CandlestickSeries, {
      priceLineWidth: 1,
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
    chart.subscribeCrosshairMove((param) => {
      if (!crossCbs.current.size) return
      const pt = param.point || null
      const info = { time: param.time ?? null, point: pt, price: pt ? series.coordinateToPrice(pt.y) : null }
      crossCbs.current.forEach(cb => cb(info))
    })
    chartRef.current = chart
    seriesRef.current = series
    markersApi.current = createSeriesMarkers(series, [])
    projRef.current = makeProjector({ chart, series, getBars: () => barsRef.current, getTfSecs: () => tfRef.current })
    setReady(true)

    return () => {
      indRef.current.clear(); crossCbs.current.clear()
      projRef.current = null; seriesRef.current = null; chartRef.current = null; markersApi.current = null
      prev.current = { base: null, idx: null, count: 0, tf: null, len: 0 }
      setReady(false)
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── every visual setting ───────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current
    if (!chart || !series || !ready) return
    const lineCol = cv.scaleLines.color || th.scaleLine
    const ch = cv.crosshair.color || th.crosshair, chStyle = LS[cv.crosshair.style] ?? LineStyle.Dashed
    const scale = {
      visible: true, borderVisible: true, borderColor: lineCol, minimumWidth: 74,
      scaleMargins: { top: cv.margins.top / 100, bottom: cv.margins.bottom / 100 },
      autoScale: scaleMode?.auto !== false,
      mode: scaleMode?.pct ? PriceScaleMode.Percentage : scaleMode?.log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    }
    chart.applyOptions({
      layout: { textColor: cv.scaleText.color || th.scaleText, fontSize: cv.scaleText.size },
      grid: {
        vertLines: { visible: cv.vGrid.on, color: cv.vGrid.color || th.grid }, horzLines: { visible: cv.hGrid.on, color: cv.hGrid.color || th.grid },
      },
      crosshair: {
        vertLine: { color: ch, style: chStyle, width: 1, labelBackgroundColor: th.crossLabel },
        horzLine: { color: ch, style: chStyle, width: 1, labelBackgroundColor: th.crossLabel },
      },
      leftPriceScale: left ? scale : { visible: false },
      rightPriceScale: left ? { visible: false } : scale,
      timeScale: {
        borderVisible: true, borderColor: lineCol, rightOffset: cv.margins.right,
        tickMarkFormatter: (t, type) => fmtRef.current.axisTick(t, type),
      },
      localization: { timeFormatter: (t) => fmtRef.current.crosshair(t, tfRef.current) },
    })
    const lab = LABEL_MODES[sc.symbolLabel] || LABEL_MODES['name-value-line']
    series.applyOptions({
      ...candleOptions(sy), priceScaleId: scaleId,
      title: lab.name ? symbol : '', lastValueVisible: lab.value, priceLineVisible: lab.line,
      priceLineColor: sc.symbolLineColor || '', priceLineStyle: LS[sc.symbolLineStyle] ?? LineStyle.Solid,
      priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits },
    })
    // re-colour existing candles when the per-bar colouring mode changes
    if (barsRef.current.length) series.setData(pointsOf(barsRef.current, sy))
  }, [cs, scaleMode, isDark, ready, digits, symbol, tzFmt, left, scaleId, th.scaleText, th.scaleLine, th.crosshair, th.grid, th.crossLabel, cv, sc, sy])

  // ── indicators: rebuilt whenever the list or its placement changes ──────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !ready) return
    const map = indRef.current
    for (const entry of map.values()) Object.values(entry.series).forEach(sr => { try { chart.removeSeries(sr) } catch { /* already gone */ } })
    map.clear()
    const showValues = sc.indicatorValues === 'value'

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
        const common = { priceLineVisible: false, lastValueVisible: showValues, crosshairMarkerVisible: false, visible, priceScaleId: scaleId }
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
      const entry = { runner, series, pane: paneIdx, last: {} }
      map.set(ind.id, entry)
      const out = runner.full(barsRef.current)
      trackLast(entry, out)
      for (const k of Object.keys(series)) series[k].setData(out[k] || [])
    }
  }, [indicators, ready, scaleId, sc.indicatorValues])

  // price pane takes the room; oscillator panes stay compact (or one pane is maximised)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !ready) return
    try {
      const panes = chart.panes()
      panes.forEach((pn, i) => {
        if (maxPane != null && maxPane < panes.length) pn.setStretchFactor(i === maxPane ? 100 : 0.01)
        else pn.setStretchFactor(i === 0 ? Math.max(3, (panes.length - 1) * 1.5) : 1)
      })
    } catch { /* older API */ }
  }, [indicators, maxPane, ready, scaleId])

  useEffect(() => {
    if (ready) chartRef.current?.priceScale(scaleId).applyOptions({ autoScale: scaleMode?.auto !== false })
  }, [extraKey, ready, scaleId, scaleMode?.auto])

  // ── execution marks ────────────────────────────────────────────────────
  useEffect(() => {
    const api = markersApi.current
    if (!api || !ready) return
    const t = cs.trading
    if (!t.executionMarks || !t.positionsAndOrders) { api.setMarkers([]); return }
    const bars = barsRef.current
    const barFor = (time) => {                         // the bar containing `time` (marks use the candle's CLOSE time)
      let lo = 0, hi = bars.length - 1, ans = null
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].time <= time - 1) { ans = bars[mid]; lo = mid + 1 } else hi = mid - 1 }
      return ans
    }
    const out = []
    for (const m of marksRef.current) {
      const bar = barFor(m.time)
      if (!bar) continue
      const buyLike = (m.kind === 'entry') === (m.side === 'buy')      // entry buy / exit sell → arrow up
      const color = m.kind === 'entry' ? (m.side === 'buy' ? '#22C55E' : '#F43F5E') : (m.pnl >= 0 ? '#22C55E' : '#F43F5E')
      out.push({ time: bar.time, position: buyLike ? 'belowBar' : 'aboveBar', shape: buyLike ? 'arrowUp' : 'arrowDown', color, text: t.executionLabels ? m.text : '' })
    }
    out.sort((a, b) => a.time - b.time)
    api.setMarkers(out)
  }, [marks, cs.trading, tf, ready, view?.count, view?.base])

  // ── data: reveal `count` base candles ──────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current
    if (!chart || !series || !ready) return
    const { base, idx, count } = view || {}
    if (!base || !idx || !count) { series.setData([]); barsRef.current = []; prev.current = { base: null, idx: null, count: 0, tf: null, len: 0 }; return }

    const p = prev.current
    const sameData = p.base === base && p.idx === idx
    const bars = barsRef.current
    const sset = csRef.current.symbol

    if (sameData && count === p.count) return

    if (sameData && count === p.count + 1 && bars.length) {
      // one replay tick
      const bar = partialBar(base, idx, idx.bucketOf[count - 1], count - 1)
      if (bars[bars.length - 1].time === bar.time) bars[bars.length - 1] = bar; else bars.push(bar)
      series.update(pointOf(bar, bars.length > 1 ? bars[bars.length - 2].close : null, sset))
      for (const e of indRef.current.values()) {
        const out = e.runner.tick(bars)
        trackLast(e, out)
        for (const k of Object.keys(e.series)) for (const pt of out[k] || []) e.series[k].update(pt)
      }
    } else {
      const ts = chart.timeScale()
      const prevRange = ts.getVisibleLogicalRange()
      const prevLen = p.len
      const tfChanged = !(sameData || (p.tf === tf && p.base === base))
      // remember what time sits at the left edge, so a timeframe change can keep it
      const leftTime = tfChanged && prevRange && projRef.current ? projRef.current.logicalToTime(prevRange.from) : null

      const next = barsAt(base, idx, count)
      barsRef.current = next
      series.setData(pointsOf(next, sset))
      chart.priceScale(scaleId).applyOptions({ autoScale: true })
      for (const e of indRef.current.values()) {
        const out = e.runner.full(next)
        trackLast(e, out)
        for (const k of Object.keys(e.series)) e.series[k].setData(out[k] || [])
      }
      const n = next.length
      if (!tfChanged) {
        // a jump on the same timeframe: keep the user's framing, follow the newest bar
        if (prevRange && prevLen) ts.setVisibleLogicalRange({ from: prevRange.from + (n - prevLen), to: prevRange.to + (n - prevLen) })
      } else if (csRef.current.scales.saveLeftEdge && leftTime != null && projRef.current) {
        const from = projRef.current.timeToLogical(leftTime)
        const width = prevRange ? prevRange.to - prevRange.from : 124
        if (from != null) ts.setVisibleLogicalRange({ from, to: from + width })
      } else {
        // first load / timeframe switch: ~110 bars with breathing room on the right
        ts.setVisibleLogicalRange({ from: n - 110, to: n + 14 })
      }
    }
    prev.current = { base, idx, count, tf, len: barsRef.current.length }
  }, [view, tf, ready, scaleId])

  // ── lock price to bar ratio ────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current
    if (!chart || !series || !ready) return
    if (!(sc.lockRatio && sc.ratio > 0)) return
    const ts = chart.timeScale()
    const apply = () => {
      const r = ts.getVisibleLogicalRange(), last = barsRef.current[barsRef.current.length - 1]
      if (!r || !last) return
      const range = sc.ratio * (r.to - r.from), mid = last.close
      series.priceScale().applyOptions({ autoScale: false })
      series.priceScale().setVisibleRange({ from: mid - range / 2, to: mid + range / 2 })
    }
    apply()
    ts.subscribeVisibleLogicalRangeChange(apply)
    return () => {
      try { ts.unsubscribeVisibleLogicalRangeChange(apply) } catch { /* chart already removed */ }
      try { series.priceScale().applyOptions({ autoScale: scaleMode?.auto !== false }) } catch { /* ignore */ }
    }
  }, [sc.lockRatio, sc.ratio, ready])  // eslint-disable-line react-hooks/exhaustive-deps

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
      const ps = chartRef.current?.paneSize(0)
      const pl = left ? chartRef.current?.priceScale('left').width() || 0 : 0
      return { w: ps?.width ?? 0, h: ps?.height ?? 0, x: pl }
    },
    fit() {
      const n = barsRef.current.length
      setMaxPane(null)
      chartRef.current?.priceScale(scaleId).applyOptions({ autoScale: true })
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: n - 110, to: n + 14 })
    },
    toLatest() { chartRef.current?.timeScale().scrollToRealTime() },
    /** factor < 1 zooms in (fewer bars), > 1 zooms out; the newest edge stays put. */
    zoom(factor) {
      const ts = chartRef.current?.timeScale(), r = ts?.getVisibleLogicalRange()
      if (r) ts.setVisibleLogicalRange({ from: r.to - (r.to - r.from) * factor, to: r.to })
    },
    scroll(frac) {
      const ts = chartRef.current?.timeScale(), r = ts?.getVisibleLogicalRange()
      if (r) { const d = (r.to - r.from) * frac; ts.setVisibleLogicalRange({ from: r.from + d, to: r.to + d }) }
    },
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
    /** Subscribe to crosshair moves → { time, point, price }. Returns an unsubscribe function. */
    onCrosshair(cb) { crossCbs.current.add(cb); return () => crossCbs.current.delete(cb) },
    /** Latest value of every output of every indicator, by indicator id. */
    indicatorValues() { const o = {}; for (const [id, e] of indRef.current) o[id] = e.last; return o },
    /** Price range per visible bar — what "lock price to bar ratio" holds constant. */
    currentRatio() {
      const chart = chartRef.current, series = seriesRef.current
      const r = chart?.timeScale().getVisibleLogicalRange(), h = chart?.paneSize(0)?.height
      if (!r || !h) return 0
      const top = series.coordinateToPrice(0), bottom = series.coordinateToPrice(h)
      return top == null || bottom == null ? 0 : Number((Math.abs(top - bottom) / (r.to - r.from)).toPrecision(6))
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
        const ox = (rect.left - wrapRef.current.getBoundingClientRect().left) * (base.width / (wrapRef.current.clientWidth || rect.width))
        base.getContext('2d').drawImage(img, ox, 0, rect.width * (base.width / (wrapRef.current.clientWidth || rect.width)), rect.height * (base.height / (wrapRef.current.clientHeight || rect.height)))
        URL.revokeObjectURL(url)
      } catch { /* overlay is a nicety — the plain chart still saves */ }
      return base
    },
  }), [scaleId, left])

  const api = useMemo(() => ({ projector: projRef.current, version, size, getBars: () => barsRef.current }), [version, size, ready])

  // ── chrome: background, watermark, buttons ─────────────────────────────
  const bg = cv.bgType === 'gradient' ? `linear-gradient(180deg, ${cv.bg || th.bg}, ${cv.bg2 || th.bg2})` : (cv.bg || th.bg)
  const wm = cv.watermark.mode
  const wmText = wm === 'hidden' ? null : wm === 'ticker' ? symbol : `${symbol}, ${tfName}`
  const showBtn = (mode) => mode === 'always' || (mode === 'hover' && hovered)
  const panes = ready && showBtn(cv.paneButtons) ? (() => {
    try {
      const root = rootRef.current?.getBoundingClientRect()
      return chartRef.current.panes().slice(1).map((pn, i) => {
        const r = pn.getHTMLElement().getBoundingClientRect()
        const ids = [...indRef.current.entries()].filter(([, e]) => e.pane === i + 1).map(([id]) => id)
        return { index: i + 1, top: r.top - root.top, height: r.height, ids }
      })
    } catch { return [] }
  })() : []

  return (
    <div ref={rootRef} className="relative w-full h-full overflow-hidden" style={{ background: bg }}
         onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      {wmText && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none" style={{ color: cv.watermark.color || th.watermark }}>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: 1 }}>{wmText}</span>
          {wm === 'ticker-interval-desc' && description && <span style={{ fontSize: 22, marginTop: 4 }}>{description}</span>}
        </div>
      )}
      <div ref={wrapRef} className="absolute inset-0" />
      {ready && children?.(api)}

      {ready && showBtn(sc.currencyUnit) && (
        <span className="absolute top-1 z-20 text-[10.5px] font-semibold pointer-events-none px-1.5 py-0.5 rounded"
              style={{ [left ? 'left' : 'right']: 6, background: 'rgba(23,21,29,0.7)', color: 'var(--text-secondary)' }}>{quoteLabel(symbol)}</span>
      )}

      {ready && showBtn(cv.navButtons) && (
        <div className="absolute z-20 flex items-center gap-1" style={{ left: '50%', bottom: 38, transform: 'translateX(-50%)' }}>
          <IconBtn title="Zoom out" onClick={() => ref.current?.zoom(1.25)}><Minus size={14} /></IconBtn>
          <IconBtn title="Zoom in" onClick={() => ref.current?.zoom(0.8)}><Plus size={14} /></IconBtn>
          <IconBtn title="Scroll left" onClick={() => ref.current?.scroll(-0.25)}><ChevronLeft size={14} /></IconBtn>
          <IconBtn title="Scroll right" onClick={() => ref.current?.scroll(0.25)}><ChevronRight size={14} /></IconBtn>
          <IconBtn title="Reset chart view (Alt+R)" onClick={() => ref.current?.fit()}><RotateCcw size={13} /></IconBtn>
        </div>
      )}

      {ready && showBtn(sc.scaleModes) && (
        <div className="absolute z-20 flex items-center gap-0.5" style={{ [left ? 'left' : 'right']: 4, bottom: 4 }}>
          <IconBtn title="Auto (fits data to screen)" active={scaleMode?.auto !== false} onClick={() => onScaleMode({ ...scaleMode, auto: !(scaleMode?.auto !== false) })}>A</IconBtn>
          <IconBtn title="Logarithmic scale" active={!!scaleMode?.log} onClick={() => onScaleMode({ ...scaleMode, log: !scaleMode?.log, pct: false })}>L</IconBtn>
          <IconBtn title="Percentage scale" active={!!scaleMode?.pct} onClick={() => onScaleMode({ ...scaleMode, pct: !scaleMode?.pct, log: false })}>%</IconBtn>
        </div>
      )}

      {panes.map(p => (
        <div key={p.index} className="absolute z-20 flex items-center gap-1" style={{ right: left ? undefined : 84, left: left ? 84 : undefined, top: p.top + 4 }}>
          <IconBtn title={maxPane === p.index ? 'Restore pane' : 'Maximize pane'} active={maxPane === p.index} onClick={() => setMaxPane(m => (m === p.index ? null : p.index))}><Maximize2 size={12} /></IconBtn>
          <IconBtn title="Remove this indicator" onClick={() => { setMaxPane(null); onClosePane?.(p.ids) }}><X size={13} /></IconBtn>
        </div>
      ))}

      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center gap-2.5"
             style={{ backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', background: 'rgba(8,8,10,0.45)' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent-purple-light)' }} />
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{typeof loading === 'string' ? loading : 'Loading market data…'}</span>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6" style={{ background: th.bg }}>
          <p className="max-w-sm text-center text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      )}
    </div>
  )
})

export default BacktestChart