import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TOOLS, makeDrawing, defaultPosition, movePoints, movePositionPoint, visibleOnTf } from '../../lib/backtest/drawings'
import { renderDrawing } from './DrawingShapes'
import { fmtUsd } from '../../lib/backtest/stats'

const SL_COLOR = '#F43F5E', TP_COLOR = '#3B82F6', BUY = '#22C55E', SELL = '#F43F5E'
const fmtP = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })

/** Where a chip sits: left / center / right in the pane. Shared so extra buttons can line up beside it. */
function chipBox(text, closable, align, paneW) {
  const w = text.length * 6.9 + 18 + (closable ? 24 : 0)
  const x = align === 'left' ? 10 : align === 'center' ? (paneW - w) / 2 : paneW - 10 - w
  return { x, w, right: x + w }
}

/** A clickable / draggable tag sitting on a trade line. */
function TradeChip({ paneW, align = 'right', y, text, color, onClose, onDragStart, cursor = 'ns-resize', textColor = '#fff', title }) {
  const { x, w, right } = chipBox(text, !!onClose, align, paneW)
  const h = 22
  return (
    <g>
      <g style={{ pointerEvents: 'all', cursor }} onPointerDown={onDragStart}>
        <title>{title}</title>
        <rect x={x} y={y - h / 2} width={w} height={h} rx={4} fill={color} />
        <text x={x + 9} y={y} dominantBaseline="central" fontSize={11.5} fontWeight={700} fill={textColor}>{text}</text>
      </g>
      {onClose && (
        <g style={{ pointerEvents: 'all', cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); onClose() }}>
          <rect x={right - 22} y={y - h / 2 + 3} width={18} height={h - 6} rx={3} fill="rgba(0,0,0,0.28)" />
          <path d={`M${right - 16},${y - 3.2} l6.4,6.4 M${right - 9.6},${y - 3.2} l-6.4,6.4`} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

/** A small read-only price tag at the right edge (previous day close, high / low, bid / ask). */
function LevelTag({ paneW, y, text, color }) {
  const w = text.length * 6.6 + 14
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={paneW - w - 4} y={y - 9} width={w} height={18} rx={3} fill={color} />
      <text x={paneW - w / 2 - 4} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} fill="#fff">{text}</text>
    </g>
  )
}

const MiniBtn = ({ x, y, label, color, onClick, title }) => (
  <g style={{ pointerEvents: 'all', cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); onClick() }}>
    <title>{title}</title>
    <rect x={x} y={y - 9} width={label.length * 6.6 + 12} height={18} rx={4} fill="rgba(17,17,22,0.9)" stroke={color} strokeWidth={1} />
    <text x={x + (label.length * 6.6 + 12) / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} fill={color}>{label}</text>
  </g>
)
const btnW = (label) => label.length * 6.6 + 12

export default function DrawingOverlay({
  api, getPane, tfSecs, tfKey, digits,
  drawings, onDrawingsChange, selectedId, onSelect,
  tool, onToolChange, stayInDrawing, magnet, lockAll, hideAll, emoji,
  onZoom, trading, ticket, onTicketChange, svgRef, forwardWheelTo,
  cs, levels, tzFmt, spec, lockedTime, onPlus, onCrosshair, pnlText,
}) {
  const proj = api.projector
  const pane = getPane()
  const w = pane.w, h = pane.h, paneX = pane.x || 0
  const tr = cs.trading

  const [draft, setDraftState] = useState(null)
  const draftRef = useRef(null)
  const setDraft = (d) => { draftRef.current = d; setDraftState(d) }
  const [hover, setHover] = useState(null)
  const [zoomBox, setZoomBox] = useState(null)
  const [tradeDrag, setTradeDrag] = useState(null)          // { id, key, price }
  const [editing, setEditing] = useState(null)              // drawing id being text-edited
  const dragRef = useRef(null)
  const [plusPt, setPlusPt] = useState(null)
  const overPlus = useRef(false)
  const latest = useRef(drawings)
  const drawingsRef = useRef(drawings)
  drawingsRef.current = drawings

  const drawingTool = tool && tool !== 'cursor'
  const bars = api.getBars()

  const ctx = useMemo(() => ({
    px: (pt) => proj?.toPx(pt) ?? null,
    w, h, tfSecs, digits,
    barsBetween: (a, b) => proj?.barCountBetween(a, b) ?? 0,
    alertColor: cs.alerts.color,
    onRemove: (id) => onDrawingsChange(drawingsRef.current.filter(x => x.id !== id), true),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [proj, api.version, w, h, tfSecs, digits, cs.alerts.color])

  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // the "+" follows the crosshair (throttled to one update per frame)
  useEffect(() => {
    if (!onCrosshair) return
    let raf = 0, pending = null
    const off = onCrosshair((info) => {
      pending = info
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!pending?.point) { if (!overPlus.current) setPlusPt(null) } else setPlusPt({ x: pending.point.x, y: pending.point.y })
      })
    })
    return () => { off(); if (raf) cancelAnimationFrame(raf) }
  }, [onCrosshair])

  // ── Escape cancels a half-drawn shape ──────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setDraft(null); setZoomBox(null); setEditing(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setDraft(null); setZoomBox(null) }, [tool])

  // ── Create ─────────────────────────────────────────────────────────────
  const finalize = useCallback((type, points, extra = {}) => {
    const d = makeDrawing(type, points, extra)
    onDrawingsChange([...drawingsRef.current, d], true)
    onSelect(d.id)
    setDraft(null)
    if (type === 'text') setEditing(d.id)
    if (!stayInDrawing) onToolChange('cursor')
  }, [onDrawingsChange, onSelect, onToolChange, stayInDrawing])

  const onCapDown = (e) => {
    if (e.button !== 0 || !proj) return
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = local(e)

    if (tool === 'zoom') { setZoomBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); return }

    const m = proj.toMarket(p, { magnet })
    if (!m) return
    const spec = TOOLS[tool]
    if (!spec) return

    if (spec.points === 'free') { setDraft({ type: tool, points: [m], free: true }); return }
    if (spec.kind === 'position') { finalize(tool, defaultPosition(tool, m, bars, tfSecs)); return }
    if (spec.kind === 'emoji') { finalize('emoji', [m], { emoji }); return }
    if (spec.kind === 'text') { finalize('text', [m], { text: '' }); return }
    if (spec.points === 1) { finalize(tool, [m]); return }

    const d = draftRef.current
    if (!d) { setDraft({ type: tool, points: [m, m], downPx: p, moved: false }); return }
    const pts = [...d.points.slice(0, -1), m]
    if (pts.length === spec.points) finalize(tool, pts)
    else setDraft({ ...d, points: [...pts, m], downPx: p, moved: false })
  }

  const onCapMove = (e) => {
    if (!proj) return
    const p = local(e)
    setHover(p)
    if (zoomBox) { setZoomBox(z => ({ ...z, x1: p.x, y1: p.y })); return }
    const d = draftRef.current
    if (!d) return
    const m = proj.toMarket(p, { magnet })
    if (!m) return
    if (d.free) {
      const last = d.points[d.points.length - 1]
      const lp = proj.toPx(last)
      if (!lp || Math.hypot(lp.x - p.x, lp.y - p.y) > 3) setDraft({ ...d, points: [...d.points, m] })
      return
    }
    const moved = d.moved || Math.hypot(d.downPx.x - p.x, d.downPx.y - p.y) > 5
    setDraft({ ...d, points: [...d.points.slice(0, -1), m], moved })
  }

  const onCapUp = (e) => {
    if (!proj) return
    if (zoomBox) {
      const a = proj.toMarket({ x: zoomBox.x0, y: zoomBox.y0 }), b = proj.toMarket({ x: zoomBox.x1, y: zoomBox.y1 })
      setZoomBox(null)
      if (a && b && Math.abs(zoomBox.x1 - zoomBox.x0) > 12 && Math.abs(zoomBox.y1 - zoomBox.y0) > 12) onZoom({ t0: a.time, t1: b.time, p0: a.price, p1: b.price })
      onToolChange('cursor')
      return
    }
    const d = draftRef.current
    if (!d) return
    if (d.free) { if (d.points.length > 1) finalize('brush', d.points); else setDraft(null); return }
    // press-drag-release finishes the point that was being dragged
    if (d.moved && d.points.length === 2) {
      const spec = TOOLS[d.type]
      const m = proj.toMarket(local(e), { magnet })
      const pts = [d.points[0], m || d.points[1]]
      if (spec.points === 2) finalize(d.type, pts)
      else setDraft({ ...d, points: [...pts, m || d.points[1]], moved: false })
    }
  }

  // forward wheel (zoom) to the chart even while a tool is capturing pointer events
  const onCapWheel = (e) => forwardWheelTo?.(e)

  // ── Select / drag ──────────────────────────────────────────────────────
  const beginDrag = (e, d, kind, idx) => {
    e.stopPropagation()
    onSelect(d.id)
    if (lockAll || d.locked || e.button !== 0 || !proj) return
    e.preventDefault()
    const m0 = proj.toMarket(local(e))
    if (!m0) return
    dragRef.current = { id: d.id, kind, idx, m0, orig: d.points.map(p => ({ ...p })), changed: false, type: d.type }
    latest.current = drawingsRef.current
    window.addEventListener('pointermove', onWinMove)
    window.addEventListener('pointerup', onWinUp)
  }

  const onWinMove = (e) => {
    const g = dragRef.current
    if (!g || !proj) return
    const m = proj.toMarket(local(e), { magnet: magnet && g.kind === 'handle' })
    if (!m) return
    let pts
    if (g.kind === 'move' && g.type === 'alert') {
      pts = g.orig.map(p => ({ time: p.time, price: p.price + (m.price - g.m0.price) }))
    } else if (g.kind === 'move') {
      pts = movePoints(g.orig, m.time - g.m0.time, m.price - g.m0.price)
    } else {
      const { type, idx, orig } = g
      pts = orig.map(p => ({ ...p }))
      if (type === 'long' || type === 'short') pts = movePositionPoint(orig, idx, m)
      else if (type === 'rect' && idx === 'c2') { pts[0].time = m.time; pts[1].price = m.price }
      else if (type === 'rect' && idx === 'c3') { pts[1].time = m.time; pts[0].price = m.price }
      else if (type === 'hline') pts[0] = { time: orig[0].time, price: m.price }
      else if (type === 'vline') pts[0] = { time: m.time, price: orig[0].price }
      else pts[idx] = m
    }
    g.changed = true
    latest.current = drawingsRef.current.map(d => (d.id === g.id ? { ...d, points: pts } : d))
    onDrawingsChange(latest.current, false)
  }

  const onWinUp = () => {
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
    const g = dragRef.current
    dragRef.current = null
    if (g?.changed) onDrawingsChange(latest.current, true)
  }
  useEffect(() => () => { window.removeEventListener('pointermove', onWinMove); window.removeEventListener('pointerup', onWinUp) }, [])  // eslint-disable-line

  // ── Trade-line drag (SL / TP / pending price) ──────────────────────────
  const beginTradeDrag = (e, id, key, source) => {
    e.stopPropagation(); e.preventDefault()
    if (!proj) return
    const move = (ev) => {
      const price = proj.yToPrice(local(ev).y)
      if (price != null) setTradeDrag({ id, key, price: Number(fmtP(price, digits)) })
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      const price = proj.yToPrice(local(ev).y)
      setTradeDrag(null)
      if (price == null) return
      const v = Number(fmtP(price, digits))
      if (source === 'ticket') onTicketChange({ [key]: v })
      else if (source === 'order') trading.onModifyOrder(id, { [key]: v })
      else trading.onModifyPosition(id, { [key]: v })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const yOf = (price) => proj?.priceToY(price)

  // ── Render pieces ──────────────────────────────────────────────────────
  const rendered = useMemo(() => {
    if (hideAll || !proj) return []
    return drawings
      .filter(d => d.visible !== false && visibleOnTf(d, tfKey) && (d.type !== 'alert' || (cs.alerts.lines && (!cs.alerts.onlyActive || d.active !== false))))
      .map(d => ({ d, r: renderDrawing(d, ctx) }))
      .filter(x => x.r)
  }, [drawings, ctx, hideAll, tfKey, proj])

  const draftRender = useMemo(() => {
    if (!draft || draft.free) return null
    const d = makeDrawing(draft.type, draft.points, { id: 'draft' })
    // 3-point tools: until the 3rd point exists, show what we have
    return renderDrawing(d, ctx)
  }, [draft, ctx])

  const brushDraft = draft?.free ? renderDrawing(makeDrawing('brush', draft.points, { id: 'draft' }), ctx) : null
  const selected = rendered.find(x => x.d.id === selectedId)
  const interactive = !drawingTool && !lockAll

  // trade lines -----------------------------------------------------------
  const align = tr.alignment
  const showTrades = tr.positionsAndOrders
  const entryX = (t) => (tr.extendedLines ? 0 : Math.max(0, Math.min(w, proj?.barX(t - 1) ?? 0)))

  const positionLines = !showTrades ? null : (trading?.positions || []).map((pos) => {
    const yE = yOf(pos.entry); if (yE == null) return null
    const col = pos.side === 'buy' ? BUY : SELL
    const x0 = entryX(pos.openedAt)
    const dragSl = tradeDrag?.id === pos.id && tradeDrag.key === 'sl' ? tradeDrag.price : pos.sl
    const dragTp = tradeDrag?.id === pos.id && tradeDrag.key === 'tp' ? tradeDrag.price : pos.tp
    const ySl = dragSl != null ? yOf(dragSl) : null, yTp = dragTp != null ? yOf(dragTp) : null
    const pnl = trading.pnlOf(pos)
    const showPnl = tr.pnl.on && tr.pnl.positionsOn
    const label = `${pos.side === 'buy' ? 'Buy' : 'Sell'} ${pos.lots}${showPnl ? `   ${pnlText(tr.pnl.positions, pnl, pos, trading.markPrice(pos))}` : ''}`
    const box = chipBox(label, true, align, w)
    const bracket = (price) => (tr.pnl.on && tr.pnl.bracketsOn ? `   ${pnlText(tr.pnl.brackets, trading.projectPnl(pos, price), pos, price)}` : '')
    const reverseLabel = 'Reverse'
    return (
      <g key={pos.id} className="bt-trade">
        <line x1={x0} y1={yE} x2={w} y2={yE} stroke={col} strokeWidth={1} strokeDasharray="5 4" opacity={0.85} style={{ pointerEvents: 'none' }} />
        {ySl != null && <>
          <line x1={x0} y1={ySl} x2={w} y2={ySl} stroke={SL_COLOR} strokeWidth={1} strokeDasharray="3 4" style={{ pointerEvents: 'none' }} />
          <line x1={x0} y1={ySl} x2={w} y2={ySl} stroke="transparent" strokeWidth={10} style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }} onPointerDown={(e) => beginTradeDrag(e, pos.id, 'sl', 'pos')} />
          <TradeChip paneW={w} align={align} y={ySl} color={SL_COLOR} text={`SL ${fmtP(dragSl, digits)}${bracket(dragSl)}`}
                     onDragStart={(e) => beginTradeDrag(e, pos.id, 'sl', 'pos')} onClose={() => trading.onModifyPosition(pos.id, { sl: null })} title="Drag to move the stop loss" />
        </>}
        {yTp != null && <>
          <line x1={x0} y1={yTp} x2={w} y2={yTp} stroke={TP_COLOR} strokeWidth={1} strokeDasharray="3 4" style={{ pointerEvents: 'none' }} />
          <line x1={x0} y1={yTp} x2={w} y2={yTp} stroke="transparent" strokeWidth={10} style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }} onPointerDown={(e) => beginTradeDrag(e, pos.id, 'tp', 'pos')} />
          <TradeChip paneW={w} align={align} y={yTp} color={TP_COLOR} text={`TP ${fmtP(dragTp, digits)}${bracket(dragTp)}`}
                     onDragStart={(e) => beginTradeDrag(e, pos.id, 'tp', 'pos')} onClose={() => trading.onModifyPosition(pos.id, { tp: null })} title="Drag to move the take profit" />
        </>}
        <TradeChip paneW={w} align={align} y={yE} color={col} text={label} cursor="default" onClose={() => trading.onClosePosition(pos.id)} title="Close this position" />
        {(() => {
          let cursorX = box.x
          const out = []
          if (tr.reverseButton) { cursorX -= btnW(reverseLabel) + 6; out.push(<MiniBtn key="rev" x={cursorX} y={yE} label={reverseLabel} color="#F59E0B" title="Close this position and open the opposite one" onClick={() => trading.onReverse(pos.id)} />) }
          if (pos.sl == null) { cursorX -= btnW('+SL') + 6; out.push(<MiniBtn key="sl" x={cursorX} y={yE} label="+SL" color={SL_COLOR} onClick={() => trading.onQuickLevel(pos.id, 'sl')} />) }
          if (pos.tp == null) { cursorX -= btnW('+TP') + 6; out.push(<MiniBtn key="tp" x={cursorX} y={yE} label="+TP" color={TP_COLOR} onClick={() => trading.onQuickLevel(pos.id, 'tp')} />) }
          return out
        })()}
      </g>
    )
  })

  const orderLines = !showTrades ? null : (trading?.orders || []).map((o) => {
    const price = tradeDrag?.id === o.id && tradeDrag.key === 'price' ? tradeDrag.price : o.price
    const y = yOf(price); if (y == null) return null
    const col = o.side === 'buy' ? BUY : SELL
    const x0 = entryX(o.createdAt)
    return (
      <g key={o.id} className="bt-trade">
        <line x1={x0} y1={y} x2={w} y2={y} stroke={col} strokeWidth={1} strokeDasharray="2 5" style={{ pointerEvents: 'none' }} />
        <line x1={x0} y1={y} x2={w} y2={y} stroke="transparent" strokeWidth={10} style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }} onPointerDown={(e) => beginTradeDrag(e, o.id, 'price', 'order')} />
        <TradeChip paneW={w} align={align} y={y} color={col} text={`${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.type} ${o.lots}  @ ${fmtP(price, digits)}`}
                   onDragStart={(e) => beginTradeDrag(e, o.id, 'price', 'order')} onClose={() => trading.onCancelOrder(o.id)} title="Drag to move · ✕ to cancel" />
        {o.sl != null && yOf(o.sl) != null && <line x1={x0} y1={yOf(o.sl)} x2={w} y2={yOf(o.sl)} stroke={SL_COLOR} strokeWidth={1} strokeDasharray="2 6" opacity={0.6} style={{ pointerEvents: 'none' }} />}
        {o.tp != null && yOf(o.tp) != null && <line x1={x0} y1={yOf(o.tp)} x2={w} y2={yOf(o.tp)} stroke={TP_COLOR} strokeWidth={1} strokeDasharray="2 6" opacity={0.6} style={{ pointerEvents: 'none' }} />}
      </g>
    )
  })

  const ticketLines = ticket && tr.projectOrder && (() => {
    const entry = ticket.entry
    const yE = yOf(entry); if (yE == null) return null
    const lines = ['sl', 'tp'].map((key) => {
      const price = tradeDrag?.id === 'ticket' && tradeDrag.key === key ? tradeDrag.price : ticket[key]
      if (price == null || !Number.isFinite(price)) return null
      const y = yOf(price); if (y == null) return null
      const col = key === 'sl' ? SL_COLOR : TP_COLOR
      const pnl = trading.projectTicketPnl(ticket, price)
      return (
        <g key={key}>
          <line x1={0} y1={y} x2={w} y2={y} stroke={col} strokeWidth={1.2} strokeDasharray="6 4" style={{ pointerEvents: 'none' }} />
          <line x1={0} y1={y} x2={w} y2={y} stroke="transparent" strokeWidth={10} style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }} onPointerDown={(e) => beginTradeDrag(e, 'ticket', key, 'ticket')} />
          <TradeChip paneW={w} align={align} y={y} color={col} text={`${key.toUpperCase()} ${fmtP(price, digits)}   ${fmtUsd(pnl, { sign: true })}`}
                     onDragStart={(e) => beginTradeDrag(e, 'ticket', key, 'ticket')} title="Drag to adjust" />
        </g>
      )
    })
    return (
      <g>
        <line x1={0} y1={yE} x2={w} y2={yE} stroke={ticket.side === 'buy' ? BUY : SELL} strokeWidth={1} strokeDasharray="1 4" style={{ pointerEvents: 'none' }} />
        <TradeChip paneW={w} align={align} y={yE} color={ticket.side === 'buy' ? BUY : SELL} cursor="default" text={`${ticket.side === 'buy' ? 'Buy' : 'Sell'} ${ticket.lots || '—'} @ ${fmtP(entry, digits)}`} />
        {lines}
      </g>
    )
  })()

  // chart lines from the Scales settings ------------------------------------
  const SCS = cs.scales
  const hlLines = (() => {
    if (!proj || !levels) return null
    const out = []
    const line = (key, price, color, style, text, mode) => {
      const y = price == null ? null : yOf(price)
      if (y == null || y < -2 || y > h + 2) return
      out.push(
        <g key={key} style={{ pointerEvents: 'none' }}>
          <line x1={0} y1={y} x2={w} y2={y} stroke={color} strokeWidth={1} strokeDasharray={style === 'dashed' ? '6 4' : style === 'dotted' ? '2 3' : undefined} opacity={0.9} />
          {mode === 'line-label' && <LevelTag paneW={w} y={y} text={text} color={color} />}
        </g>,
      )
    }
    if (SCS.prevDayClose !== 'hidden' && levels.pdc != null) line('pdc', levels.pdc, SCS.prevDayColor, SCS.prevDayStyle, `PDC ${fmtP(levels.pdc, digits)}`, SCS.prevDayClose)
    if (SCS.highLow !== 'hidden') {
      const t0 = proj.xToTime(0), t1 = proj.xToTime(w)
      const vis = t0 == null || t1 == null ? [] : api.getBars().filter(b => b.time >= t0 - tfSecs && b.time <= t1)
      if (vis.length) {
        const hi = Math.max(...vis.map(b => b.high)), lo = Math.min(...vis.map(b => b.low))
        line('hi', hi, SCS.highColor, 'dashed', `H ${fmtP(hi, digits)}`, SCS.highLow)
        line('lo', lo, SCS.lowColor, 'dashed', `L ${fmtP(lo, digits)}`, SCS.highLow)
      }
    }
    if (SCS.bidAsk !== 'hidden' && levels.bid != null) {
      line('bid', levels.bid, SCS.bidColor, 'solid', `Bid ${fmtP(levels.bid, digits)}`, SCS.bidAsk)
      line('ask', levels.ask, SCS.askColor, 'solid', `Ask ${fmtP(levels.ask, digits)}`, SCS.bidAsk)
    }
    return out
  })()

  const countdown = (() => {
    if (!SCS.countdown || !proj || levels?.lastClose == null || levels.countdownSecs == null) return null
    const y = yOf(levels.lastClose); if (y == null || y < 0 || y > h) return null
    const s = Math.max(0, Math.floor(levels.countdownSecs))
    const text = s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    return <LevelTag paneW={w} y={y + 15} text={text} color="rgba(55,60,72,0.95)" />
  })()

  // day separators + the locked vertical cursor line ---------------------------
  const separators = (() => {
    if (!cs.events.daySeparators || !proj || tfSecs >= 86400) return null
    const bars = api.getBars()
    const out = []
    let lastKey = null
    for (let i = 0; i < bars.length; i++) {
      const k = tzFmt.dayKey(bars[i].time)
      if (lastKey != null && k !== lastKey) {
        const x = proj.timeToX(bars[i].time)
        if (x != null && x >= 0 && x <= w) out.push(<line key={bars[i].time} x1={x} y1={0} x2={x} y2={h} stroke={cs.events.separatorColor || 'rgba(255,255,255,0.14)'} strokeWidth={1} strokeDasharray="2 4" style={{ pointerEvents: 'none' }} />)
      }
      lastKey = k
    }
    return out
  })()
  const lockedX = lockedTime != null && proj ? proj.timeToX(lockedTime) : null

  // the "+" that follows the cursor on the price scale -------------------------
  const plus = SCS.plusButton && plusPt && !drawingTool && proj && plusPt.y >= 0 && plusPt.y <= h ? (() => {
    const price = proj.yToPrice(plusPt.y)
    if (price == null) return null
    return (
      <g style={{ pointerEvents: 'all', cursor: 'pointer' }} onPointerEnter={() => { overPlus.current = true }} onPointerLeave={() => { overPlus.current = false; setPlusPt(null) }}
         onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPlus(e.clientX, e.clientY, price) }}>
        <title>Add alert or order at {fmtP(price, digits)}</title>
        <rect x={w - 30} y={plusPt.y - 11} width={22} height={22} rx={5} fill="rgba(23,21,29,0.95)" stroke="rgba(255,255,255,0.25)" />
        <path d={`M${w - 19},${plusPt.y - 5} v10 M${w - 24},${plusPt.y} h10`} stroke="#E5E7EB" strokeWidth={1.8} strokeLinecap="round" />
      </g>
    )
  })() : null

  // crosshair while a drawing tool is active ------------------------------
  const crosshair = drawingTool && hover && !zoomBox && (() => {
    const m = proj?.toMarket(hover, { magnet })
    const y = m ? yOf(m.price) : hover.y
    const x = m ? proj.timeToX(m.time) : hover.x
    if (x == null || y == null) return null
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={0} y1={y} x2={w} y2={y} stroke="rgba(255,255,255,0.4)" strokeDasharray="3 4" />
        <line x1={x} y1={0} x2={x} y2={h} stroke="rgba(255,255,255,0.4)" strokeDasharray="3 4" />
        {m && <>
          <rect x={w - 66} y={y - 10} width={64} height={20} rx={3} fill="#211D26" />
          <text x={w - 34} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#E5E7EB">{fmtP(m.price, digits)}</text>
        </>}
      </g>
    )
  })()

  const editingDrawing = editing && drawings.find(d => d.id === editing)
  const editPx = editingDrawing && proj?.toPx(editingDrawing.points[0])

  if (!w || !h) return null

  return (
    <svg ref={svgRef} className="bt-overlay absolute top-0 z-10" width={w} height={h}
         style={{ left: paneX, pointerEvents: 'none', overflow: 'hidden', cursor: drawingTool ? 'crosshair' : undefined }}>
      {/* drawings */}
      {rendered.map(({ d, r }) => (
        <g key={d.id} data-draw-id={d.id} style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: d.locked ? 'default' : 'move' }}
           opacity={selectedId === d.id ? 1 : 0.96}
           onPointerDown={(e) => beginDrag(e, d, 'move')}
           onDoubleClick={() => d.type === 'text' && setEditing(d.id)}>
          {r.el}
        </g>
      ))}

      {/* in-progress drawing */}
      {draftRender && <g style={{ pointerEvents: 'none' }} opacity={0.9}>{draftRender.el}</g>}
      {brushDraft && <g style={{ pointerEvents: 'none' }}>{brushDraft.el}</g>}

      {/* handles for the selected drawing */}
      {selected && interactive && !selected.d.locked && selected.r.handles.map((hd) => (
        <circle key={String(hd.idx)} cx={hd.x} cy={hd.y} r={5.5} fill="#fff" stroke={selected.d.style.color} strokeWidth={2}
                style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={(e) => beginDrag(e, selected.d, 'handle', hd.idx)} />
      ))}

      {/* trading */}
      {separators}
      {hlLines}
      {lockedX != null && <g style={{ pointerEvents: 'none' }}><line x1={lockedX} y1={0} x2={lockedX} y2={h} stroke="#8B5CF6" strokeWidth={1} strokeDasharray="4 3" /></g>}
      {positionLines}
      {orderLines}
      {ticketLines}
      {countdown}
      {plus}

      {crosshair}

      {zoomBox && (
        <rect x={Math.min(zoomBox.x0, zoomBox.x1)} y={Math.min(zoomBox.y0, zoomBox.y1)}
              width={Math.abs(zoomBox.x1 - zoomBox.x0)} height={Math.abs(zoomBox.y1 - zoomBox.y0)}
              fill="rgba(139,92,246,0.14)" stroke="#A78BFA" strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />
      )}

      {/* inline text editor */}
      {editingDrawing && editPx && (
        <foreignObject x={editPx.x - 6} y={editPx.y - 16} width={220} height={32}>
          <input autoFocus defaultValue={editingDrawing.text || ''} placeholder="Type text…"
                 style={{ pointerEvents: 'auto', width: '100%', height: 30, background: '#131217', color: '#fff', border: '1px solid #8B5CF6', borderRadius: 6, padding: '0 8px', fontSize: 13, outline: 'none' }}
                 onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = editingDrawing.text || ''; e.currentTarget.blur() } e.stopPropagation() }}
                 onBlur={(e) => {
                   const text = e.currentTarget.value.trim()
                   const next = text
                     ? drawingsRef.current.map(d => (d.id === editing ? { ...d, text } : d))
                     : drawingsRef.current.filter(d => d.id !== editing)
                   setEditing(null)
                   onDrawingsChange(next, true)
                 }} />
        </foreignObject>
      )}

      {/* capture layer while a tool is active */}
      {drawingTool && (
        <rect x={0} y={0} width={w} height={h} fill="transparent" style={{ pointerEvents: 'all', touchAction: 'none' }}
              onPointerDown={onCapDown} onPointerMove={onCapMove} onPointerUp={onCapUp} onWheel={onCapWheel}
              onPointerLeave={() => setHover(null)} />
      )}
    </svg>
  )
}