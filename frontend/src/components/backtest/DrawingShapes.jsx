import { DASHES, FIB_LEVELS, lineToBounds, measureInfo, positionInfo, fmtDur, smoothPath, styleOf } from '../../lib/backtest/drawings'
import { colorHex, colorAlpha } from '../../lib/backtest/colors'
import { EMOJI_FONT } from '../../lib/backtest/emojiData'

const HIT = 12                      // invisible stroke width used for click targets
const FONT = '"Trebuchet MS", Roboto, -apple-system, "Segoe UI", sans-serif'
const fmt = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const sgn = (n, d) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n), d)}`
const usd = (n) => `${n < 0 ? '-' : n > 0 ? '+' : ''}$${fmt(Math.abs(n), 2)}`
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** fill colour + opacity as SVG attributes (the colour may itself carry alpha). */
const fillOf = (s, on = true) => (on === false ? { fill: 'none' } : { fill: colorHex(s.fill), fillOpacity: (s.fillOpacity ?? 0.2) * colorAlpha(s.fill) })
const strokeOf = (s, w) => ({ stroke: s.color, strokeWidth: w ?? s.width, strokeDasharray: DASHES[s.dash], strokeLinecap: s.dash === 'dotted' ? 'round' : 'butt', strokeLinejoin: 'round' })

/** Rounded label with a solid background — the pills TradingView puts on stats, targets and measures. Width is estimated (no DOM measuring while rendering). */
export function Pill({ x, y, lines, fill, color = '#fff', size = 12, anchor = 'middle', stroke, weight = 400 }) {
  const arr = Array.isArray(lines) ? lines : [lines]
  const w = Math.max(...arr.map(l => l.length)) * size * 0.58 + 14
  const lh = size + 3, h = arr.length * lh + 7
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={left} y={y - h / 2} width={w} height={h} rx={4} fill={fill} stroke={stroke} strokeWidth={stroke ? 1.2 : 0} />
      {arr.map((l, i) => (
        <text key={i} x={left + w / 2} y={y - h / 2 + 3.5 + lh * (i + 0.5)} textAnchor="middle" dominantBaseline="central" fontSize={size} fill={color} fontFamily={FONT} fontWeight={weight}>{l}</text>
      ))}
    </g>
  )
}

const Line = ({ a, b, s, hit = true, w, dash }) => (
  <>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={s.color} strokeWidth={w ?? s.width}
          strokeDasharray={dash === undefined ? DASHES[s.dash] : dash} strokeLinecap={s.dash === 'dotted' ? 'round' : 'butt'} style={{ pointerEvents: 'none' }} />
    {hit && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />}
  </>
)

function Arrowhead({ from, to, color, size = 10, width = 2 }) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x)
  const p = (da) => ({ x: to.x + Math.cos(ang + da) * size, y: to.y + Math.sin(ang + da) * size })
  const p1 = p(Math.PI * 0.84), p2 = p(-Math.PI * 0.84)
  return <path d={`M${p1.x},${p1.y} L${to.x},${to.y} L${p2.x},${p2.y}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
}

/** Text that follows a line (rotated, kept upright), aligned by the drawing's vertical / horizontal alignment. */
function LineText({ a, b, text, s }) {
  if (!text) return null
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (deg > 90 || deg < -90) deg += 180
  const k = s.hAlign === 'left' ? 0.1 : s.hAlign === 'right' ? 0.9 : 0.5
  const cx = a.x + (b.x - a.x) * k, cy = a.y + (b.y - a.y) * k
  const dy = s.vAlign === 'top' ? -(8 + s.fontSize * 0.5) : s.vAlign === 'bottom' ? 8 + s.fontSize * 0.5 : 0
  return (
    <text transform={`translate(${cx},${cy}) rotate(${deg}) translate(0,${dy})`} textAnchor="middle" dominantBaseline="central" fontSize={s.fontSize} fill={s.textColor}
          fontFamily={FONT} fontWeight={s.bold ? 700 : 400} fontStyle={s.italic ? 'italic' : 'normal'} style={{ pointerEvents: 'none' }}>{text}</text>
  )
}

/** Text inside a box — shows a faint "+ Add text" while the shape is selected and empty, exactly like TradingView. */
function BoxText({ r, text, s, selected }) {
  if (!text && !selected) return null
  const x = s.hAlign === 'left' ? r.x1 + 8 : s.hAlign === 'right' ? r.x2 - 8 : (r.x1 + r.x2) / 2
  const y = s.vAlign === 'top' ? r.y1 + 14 : s.vAlign === 'bottom' ? r.y2 - 14 : (r.y1 + r.y2) / 2
  return (
    <text x={x} y={y} textAnchor={s.hAlign === 'left' ? 'start' : s.hAlign === 'right' ? 'end' : 'middle'} dominantBaseline="central" fontSize={s.fontSize} fontFamily={FONT}
          fill={text ? s.textColor : 'rgba(156,163,175,0.8)'} fontWeight={s.bold ? 700 : 400} fontStyle={text && !s.italic ? 'normal' : 'italic'} style={{ pointerEvents: 'none' }}>
      {text || '+ Add text'}
    </text>
  )
}

const bboxOf = (P) => {
  const xs = P.map(p => p.x), ys = P.map(p => p.y)
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}
const COMPASS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
const boxHandles = (r) => Object.keys(COMPASS).map(k => ({
  idx: k, cursor: COMPASS[k],
  x: k.includes('w') ? r.x1 : k.includes('e') ? r.x2 : (r.x1 + r.x2) / 2,
  y: k.includes('n') ? r.y1 : k.includes('s') ? r.y2 : (r.y1 + r.y2) / 2,
}))
const range = (pts, extra = []) => {
  const prices = [...pts.map(p => p.price), ...extra], times = pts.map(p => p.time)
  return { pMin: Math.min(...prices), pMax: Math.max(...prices), tMin: Math.min(...times), tMax: Math.max(...times) }
}

/**
 * @returns {{ el: JSX, handles: {x,y,idx,shape?,cursor?}[], range?: {pMin,pMax,tMin,tMax}, chips?: {price,color}[] } | null}
 * ctx: { px(pt), w, h, tfSecs, digits, barsBetween(t0,t1), spec, lastPrice, selected, hovered, yToPrice(y), xToTime(x), onRemove, alertColor }
 */
export function renderDrawing(d, ctx) {
  const { px, w, h, digits, selected, hovered } = ctx
  const P = d.points.map(px)
  if (P.some(p => !p)) return null
  const s = styleOf(d)
  const [a, b, c] = P
  const vertexHandles = P.map((p, idx) => ({ ...p, idx }))
  const dpts = d.points

  switch (d.type) {
    // ── lines ───────────────────────────────────────────────────────────
    case 'trendline': case 'ray': case 'extended': case 'arrow': case 'info': {
      const ext = s.extend ?? (d.type === 'ray' ? 'right' : d.type === 'extended' ? 'both' : 'none')
      const [e1, e2] = ext === 'none' ? [a, b] : lineToBounds(a, b, w, h, { left: ext === 'left' || ext === 'both', right: ext === 'right' || ext === 'both' })
      const m = measureInfo(dpts[0], dpts[1], ctx.tfSecs, ctx.barsBetween(dpts[0].time, dpts[1].time))
      const showStats = (s.stats && s.stats !== 'hidden') && (s.alwaysStats || selected || hovered)
      const angle = Math.round(Math.atan2(-(b.y - a.y), Math.abs(b.x - a.x) || 1) * 180 / Math.PI)
      const at = s.statsPos === 'left' ? a : s.statsPos === 'center' ? mid(a, b) : b
      const statLines = s.stats === 'compact' || d.type === 'info'
        ? [`${sgn(m.dp, digits)} (${sgn(m.pct, 2)}%)  ${Math.abs(m.bars)} bars  ${angle}°`]
        : [`${sgn(m.dp, digits)} (${sgn(m.pct, 2)}%)`, `${m.bars} bars, ${fmtDur(m.dt)}`]
      return {
        el: (<>
          <Line a={e1} b={e2} s={s} />
          {(s.arrowEnd || d.type === 'arrow') && s.arrowEnd !== false && <Arrowhead from={a} to={b} color={s.color} size={9 + s.width * 1.5} width={s.width} />}
          {s.arrowStart && <Arrowhead from={b} to={a} color={s.color} size={9 + s.width * 1.5} width={s.width} />}
          {s.middlePoint && <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={3.5} fill={s.color} style={{ pointerEvents: 'none' }} />}
          <LineText a={a} b={b} text={d.text} s={s} />
          {showStats && <Pill x={at.x} y={at.y + (m.dp >= 0 ? -30 : 30)} lines={statLines} fill="rgba(42,46,57,0.96)" size={11} />}
        </>),
        handles: vertexHandles, range: range(dpts),
        chips: s.priceLabels ? dpts.map(p => ({ price: p.price, color: s.color })) : undefined,
      }
    }
    case 'hline': {
      const L = { x: 0, y: a.y }, R = { x: w, y: a.y }
      const k = s.hAlign === 'left' ? 'start' : s.hAlign === 'right' ? 'end' : 'middle'
      return {
        el: (<>
          <Line a={L} b={R} s={s} />
          {d.text && <text x={s.hAlign === 'left' ? 10 : s.hAlign === 'right' ? w - 10 : w / 2} y={a.y - 6} textAnchor={k} fontSize={s.fontSize} fill={s.textColor} fontFamily={FONT} fontWeight={s.bold ? 700 : 400} style={{ pointerEvents: 'none' }}>{d.text}</text>}
        </>),
        handles: [{ x: Math.min(Math.max(a.x, 14), w - 14), y: a.y, idx: 0, cursor: 'ns-resize' }],
        range: range(dpts), chips: s.priceLabel !== false ? [{ price: dpts[0].price, color: s.color }] : undefined,
      }
    }
    case 'alert': {
      const col = d.active === false ? '#6B7280' : (ctx.alertColor || '#E11D48')
      const text = `${d.active === false ? 'Triggered' : 'Alert'} ${fmt(d.points[0].price, digits)}`
      const cw = text.length * 6.7 + 56
      return {
        el: (<>
          <line x1={0} y1={a.y} x2={w} y2={a.y} stroke={col} strokeWidth={1.4} strokeDasharray="8 5" style={{ pointerEvents: 'none' }} />
          <line x1={0} y1={a.y} x2={w} y2={a.y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }} />
          <g>
            <rect x={8} y={a.y - 11} width={cw} height={22} rx={5} fill={col} style={{ pointerEvents: 'all', cursor: 'ns-resize' }} />
            <path d={`M20,${a.y + 4} h8 l-1,-1.5 v-3.5 a3,3 0 0 0 -6,0 v3.5 z M22.6,${a.y + 5.2} h2.8`} fill="#fff" stroke="#fff" strokeWidth={0.8} style={{ pointerEvents: 'none' }} />
            <text x={36} y={a.y} dominantBaseline="central" fontSize={11.5} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>{text}</text>
            <g style={{ pointerEvents: 'all', cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); ctx.onRemove(d.id) }}>
              <rect x={8 + cw - 22} y={a.y - 8} width={18} height={16} rx={3} fill="rgba(0,0,0,0.28)" />
              <path d={`M${8 + cw - 16},${a.y - 3} l6,6 M${8 + cw - 10},${a.y - 3} l-6,6`} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
            </g>
          </g>
        </>),
        handles: [],
      }
    }
    case 'hray':
      return {
        el: <Line a={a} b={{ x: w, y: a.y }} s={s} />,
        handles: [{ x: a.x, y: a.y, idx: 0 }], range: range(dpts), chips: s.priceLabel !== false ? [{ price: dpts[0].price, color: s.color }] : undefined,
      }
    case 'vline':
      return {
        el: <Line a={{ x: a.x, y: 0 }} b={{ x: a.x, y: h }} s={s} />,
        handles: [{ x: a.x, y: Math.min(Math.max(a.y, 14), h - 14), idx: 0, cursor: 'ew-resize' }], range: { tMin: dpts[0].time, tMax: dpts[0].time },
      }
    case 'cross':
      return {
        el: (<><Line a={{ x: 0, y: a.y }} b={{ x: w, y: a.y }} s={s} /><Line a={{ x: a.x, y: 0 }} b={{ x: a.x, y: h }} s={s} /></>),
        handles: [{ x: a.x, y: a.y, idx: 0 }], range: range(dpts), chips: [{ price: dpts[0].price, color: s.color }],
      }

    // ── channel ─────────────────────────────────────────────────────────
    case 'channel': {
      if (!c) return { el: <Line a={a} b={b} s={s} />, handles: vertexHandles, range: range(dpts) }
      const slope = (b.y - a.y) / (b.x - a.x || 0.0001)
      const off = c.y - (a.y + slope * (c.x - a.x))          // vertical gap to the parallel line
      const a2 = { x: a.x, y: a.y + off }, b2 = { x: b.x, y: b.y + off }
      const ext = s.extend || 'none'
      const clip = (p, q) => (ext === 'none' ? [p, q] : lineToBounds(p, q, w, h, { left: ext === 'left' || ext === 'both', right: ext === 'right' || ext === 'both' }))
      const [e1, e2] = clip(a, b), [f1, f2] = clip(a2, b2)
      return {
        el: (<>
          {s.showFill !== false && <polygon points={`${e1.x},${e1.y} ${e2.x},${e2.y} ${f2.x},${f2.y} ${f1.x},${f1.y}`} {...fillOf(s)} style={{ pointerEvents: 'all' }} />}
          <Line a={e1} b={e2} s={s} /><Line a={f1} b={f2} s={s} />
          {s.middleLine !== false && <Line a={mid(e1, f1)} b={mid(e2, f2)} s={s} dash="4 4" w={1} hit={false} />}
        </>),
        handles: [{ ...a, idx: 0 }, { ...b, idx: 1 }, { ...mid(a2, b2), idx: 2, cursor: 'ns-resize' }],
        range: range(dpts),
      }
    }

    // ── fibonacci ───────────────────────────────────────────────────────
    case 'fib': {
      const p0 = d.points[0], p1 = d.points[1]
      const xL = Math.min(a.x, b.x), xR = Math.max(a.x, b.x)
      const levels = (s.levels || FIB_LEVELS).filter(l => l.on !== false).map(l => {
        const price = p1.price - (p1.price - p0.price) * l.r         // 0 sits on the 2nd point, 1 on the 1st — as in TradingView
        return { ...l, price, y: px({ time: p1.time, price })?.y }
      }).filter(l => l.y != null)
      return {
        el: (<>
          {s.showFill !== false && levels.slice(0, -1).map((l, i) => (
            <rect key={`b${i}`} x={xL} y={Math.min(l.y, levels[i + 1].y)} width={xR - xL} height={Math.abs(levels[i + 1].y - l.y)}
                  fill={colorHex(levels[i + 1].color)} fillOpacity={s.fillOpacity} style={{ pointerEvents: 'all' }} />
          ))}
          <Line a={a} b={b} s={s} dash="4 4" w={1} />
          {levels.map(l => (
            <g key={l.r}>
              <line x1={xL} y1={l.y} x2={xR} y2={l.y} stroke={l.color} strokeWidth={s.width} style={{ pointerEvents: 'none' }} />
              <line x1={xL} y1={l.y} x2={xR} y2={l.y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />
              <text x={xL - 6} y={l.y} textAnchor="end" dominantBaseline="central" fontSize={11} fill={l.color} fontFamily={FONT} style={{ pointerEvents: 'none' }}>
                {l.r}{s.showPrices !== false ? ` (${fmt(l.price, digits)})` : ''}
              </text>
            </g>
          ))}
        </>),
        handles: vertexHandles, range: range(dpts),
      }
    }

    // ── boxes ───────────────────────────────────────────────────────────
    case 'rect': case 'ellipse': {
      const r = bboxOf([a, b])
      return {
        el: (<>
          {d.type === 'rect'
            ? <rect x={r.x1} y={r.y1} width={r.x2 - r.x1} height={r.y2 - r.y1} {...fillOf(s)} {...strokeOf(s)} strokeLinejoin="miter" style={{ pointerEvents: 'all' }} />
            : <ellipse cx={(r.x1 + r.x2) / 2} cy={(r.y1 + r.y2) / 2} rx={(r.x2 - r.x1) / 2} ry={(r.y2 - r.y1) / 2} {...fillOf(s)} {...strokeOf(s)} style={{ pointerEvents: 'all' }} />}
          <BoxText r={r} text={d.text} s={s} selected={selected} />
        </>),
        handles: boxHandles(r), range: range(dpts),
      }
    }
    case 'circle': {
      const rad = dist(a, b)
      const r = { x1: a.x - rad, y1: a.y - rad, x2: a.x + rad, y2: a.y + rad }
      return {
        el: (<>
          <circle cx={a.x} cy={a.y} r={rad} {...fillOf(s)} {...strokeOf(s)} style={{ pointerEvents: 'all' }} />
          <BoxText r={r} text={d.text} s={s} selected={selected} />
        </>),
        handles: [{ x: a.x + rad, y: a.y, idx: 'e', cursor: 'ew-resize' }, { x: a.x - rad, y: a.y, idx: 'w', cursor: 'ew-resize' }, { x: a.x, y: a.y - rad, idx: 'n', cursor: 'ns-resize' }, { x: a.x, y: a.y + rad, idx: 's', cursor: 'ns-resize' }],
        range: { pMin: ctx.yToPrice?.(r.y2) ?? dpts[0].price, pMax: ctx.yToPrice?.(r.y1) ?? dpts[0].price, tMin: ctx.xToTime?.(r.x1) ?? dpts[0].time, tMax: ctx.xToTime?.(r.x2) ?? dpts[0].time },
      }
    }
    case 'triangle': {
      const pts = (c ? [a, b, c] : [a, b]).map(p => `${p.x},${p.y}`).join(' ')
      return {
        el: (<>
          <polygon points={pts} {...fillOf(s)} {...strokeOf(s)} style={{ pointerEvents: 'all' }} />
          {c && <BoxText r={bboxOf(P)} text={d.text} s={s} selected={selected} />}
        </>),
        handles: vertexHandles, range: range(dpts),
      }
    }
    case 'path': case 'polyline': {
      const poly = P.map(p => `${p.x},${p.y}`).join(' ')
      const closed = d.type === 'polyline' && s.showFill !== false && P.length >= 3
      return {
        el: (<>
          {closed && <polygon points={poly} {...fillOf(s)} stroke="none" style={{ pointerEvents: 'all' }} />}
          {P.slice(0, -1).map((p, i) => <line key={i} x1={p.x} y1={p.y} x2={P[i + 1].x} y2={P[i + 1].y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />)}
          {closed && <line x1={P[P.length - 1].x} y1={P[P.length - 1].y} x2={a.x} y2={a.y} {...strokeOf(s)} style={{ pointerEvents: 'none' }} />}
          {P.length > 1 && <polyline points={poly} fill="none" {...strokeOf(s)} style={{ pointerEvents: 'none' }} />}
          {s.arrowEnd && P.length > 1 && <Arrowhead from={P[P.length - 2]} to={P[P.length - 1]} color={s.color} size={9 + s.width * 1.5} width={s.width} />}
        </>),
        handles: vertexHandles, range: range(dpts),
      }
    }

    // ── long / short position ───────────────────────────────────────────
    case 'long': case 'short': {
      if (!c) return null
      const info = positionInfo(d, ctx.spec, ctx.lastPrice)
      const x0 = a.x, x1 = Math.max(b.x, a.x + 6), yE = a.y, yT = b.y, yS = c.y
      const mx = (x0 + x1) / 2
      const green = s.fill, red = s.stopFill || RED_FALLBACK
      const money = ctx.spec && info.lots > 0
      const tText = `Target: ${fmt(info.reward, digits)} (${fmt(info.rewardPct, 2)}%)${info.rewardPips != null ? ` ${fmt(info.rewardPips, 1)}` : ''}${money ? `, ${usd(info.rewardUsd)}` : ''}`
      const sText = `Stop: ${fmt(info.risk, digits)} (${fmt(info.riskPct, 2)}%)${info.riskPips != null ? ` ${fmt(info.riskPips, 1)}` : ''}${money ? `, ${usd(-info.riskUsdAtStop)}` : ''}`
      const pnlLines = [`Open PnL: ${money && info.hasLast ? usd(info.open) : '—'}${money ? `, Lots: ${info.lots}` : ''}`, `Risk/reward ratio: ${fmt(info.rr, 2)}`]
      const pnlCol = info.open >= 0 ? green : red
      const show = s.showLabels !== false || selected || hovered
      const long = info.long
      return {
        el: (<>
          <rect x={x0} y={Math.min(yE, yT)} width={x1 - x0} height={Math.abs(yT - yE)} fill={colorHex(green)} fillOpacity={s.fillOpacity} style={{ pointerEvents: 'all' }} />
          <rect x={x0} y={Math.min(yE, yS)} width={x1 - x0} height={Math.abs(yS - yE)} fill={colorHex(red)} fillOpacity={s.fillOpacity} style={{ pointerEvents: 'all' }} />
          <line x1={x0} y1={yE} x2={x1} y2={yE} stroke={s.color} strokeWidth={s.width + 1} style={{ pointerEvents: 'none' }} />
          {show && <>
            <Pill x={mx} y={yT + (long ? -15 : 15)} lines={tText} fill={colorHex(green)} color={s.textColor} size={11.5} />
            <Pill x={mx} y={yS + (long ? 15 : -15)} lines={sText} fill={colorHex(red)} color={s.textColor} size={11.5} />
            <Pill x={mx} y={yE + (long ? 24 : -24)} lines={s.compact ? pnlLines.slice(0, 1) : pnlLines} fill={colorHex(pnlCol)} color={s.textColor} size={11.5} stroke="rgba(255,255,255,0.9)" />
          </>}
        </>),
        handles: [
          { x: mx, y: yT, idx: 'target', shape: 'square', cursor: 'ns-resize' }, { x: mx, y: yS, idx: 'stop', shape: 'square', cursor: 'ns-resize' },
          { x: x0, y: yE, idx: 'left', cursor: 'ew-resize' }, { x: x1, y: yE, idx: 'right', cursor: 'ew-resize' },
        ],
        range: range([dpts[0], dpts[1]], [info.target, info.stop]),
        chips: s.priceLabels !== false ? [{ price: info.target, color: colorHex(green) }, { price: info.stop, color: colorHex(red) }, { price: info.entry, color: '#363A45' }] : undefined,
      }
    }

    // ── measurers ───────────────────────────────────────────────────────
    case 'priceRange': case 'dateRange': case 'measure': {
      const m = measureInfo(dpts[0], dpts[1], ctx.tfSecs, ctx.barsBetween(dpts[0].time, dpts[1].time))
      const col = m.up ? '#2962FF' : '#F23645'
      const r = bboxOf([a, b])
      const pip = ctx.spec?.pipSize
      const pr = `${sgn(m.dp, digits)} (${sgn(m.pct, 2)}%)${pip ? ` ${sgn(m.dp / pip, 1)}` : ''}`
      const tm = `${m.bars} bars, ${m.dt < 0 ? '-' : ''}${fmtDur(m.dt)}`
      const box = d.type === 'priceRange' ? { x1: r.x1, x2: r.x1 + Math.max(r.x2 - r.x1, 70), y1: r.y1, y2: r.y2 }
        : d.type === 'dateRange' ? { x1: r.x1, x2: r.x2, y1: a.y - 34, y2: a.y + 34 } : r
      const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2
      const lines = d.type === 'priceRange' ? [pr] : d.type === 'dateRange' ? [tm] : [pr, tm]
      const labY = d.type === 'dateRange' ? box.y1 - 18 : m.up ? box.y1 - 26 : box.y2 + 26
      return {
        el: (<>
          <rect x={box.x1} y={box.y1} width={box.x2 - box.x1} height={box.y2 - box.y1} fill={col} fillOpacity={s.fillOpacity} style={{ pointerEvents: 'all' }} />
          {d.type !== 'dateRange' && <><line x1={cx} y1={box.y1} x2={cx} y2={box.y2} stroke={col} strokeWidth={1} style={{ pointerEvents: 'none' }} /><Arrowhead from={{ x: cx, y: cy }} to={{ x: cx, y: m.up ? box.y1 : box.y2 }} color={col} size={8} width={1.5} /></>}
          {d.type !== 'priceRange' && <><line x1={box.x1} y1={cy} x2={box.x2} y2={cy} stroke={col} strokeWidth={1} style={{ pointerEvents: 'none' }} /><Arrowhead from={{ x: cx, y: cy }} to={{ x: b.x >= a.x ? box.x2 : box.x1, y: cy }} color={col} size={8} width={1.5} /></>}
          <Pill x={cx} y={labY} lines={lines} fill={col} size={12} />
        </>),
        handles: d.type === 'measure' ? boxHandles(r) : vertexHandles, range: range(dpts),
      }
    }

    // ── brushes ─────────────────────────────────────────────────────────
    case 'brush': case 'highlighter': {
      const hl = d.type === 'highlighter'
      const path = smoothPath(P)
      return {
        el: (<>
          <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(HIT, s.width + 8)} style={{ pointerEvents: 'stroke' }} />
          {!hl && s.showFill && <path d={`${path} Z`} {...fillOf(s)} stroke="none" style={{ pointerEvents: 'none' }} />}
          <path d={path} fill="none" stroke={s.color} strokeOpacity={hl ? (s.opacity ?? 0.4) : 1} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={DASHES[s.dash]} style={{ pointerEvents: 'none' }} />
          {!hl && s.arrowEnd && P.length > 2 && <Arrowhead from={P[P.length - 3]} to={P[P.length - 1]} color={s.color} width={s.width} />}
        </>),
        handles: [], range: range(dpts),
      }
    }

    // ── markers / text / emoji ──────────────────────────────────────────
    case 'arrowUp': case 'arrowDown': {
      const up = d.type === 'arrowUp'
      const path = up ? `M${a.x},${a.y} l-11,13 h7 v14 h8 v-14 h7 z` : `M${a.x},${a.y} l-11,-13 h7 v-14 h8 v14 h7 z`
      return {
        el: (<>
          <path d={path} fill={s.color} style={{ pointerEvents: 'all' }} />
          {d.text && <text x={a.x} y={a.y + (up ? 44 : -44)} textAnchor="middle" dominantBaseline="central" fontSize={s.fontSize} fill={s.textColor || s.color} fontFamily={FONT} fontWeight={s.bold ? 700 : 400} style={{ pointerEvents: 'none' }}>{d.text}</text>}
        </>),
        handles: [], range: range(dpts),
      }
    }
    case 'text': {
      const lines = (d.text || 'Text').split('\n'), lh = s.fontSize * 1.35
      const tw = Math.max(...lines.map(l => l.length)) * s.fontSize * 0.58 + 16, th = lines.length * lh + 8
      return {
        el: (<>
          <rect x={a.x} y={a.y - th / 2} width={tw} height={th} rx={4} fill={s.showBg ? s.bg : 'transparent'}
                stroke={s.showBorder ? s.color : selected ? '#2962FF' : 'none'} strokeDasharray={selected && !s.showBorder ? '3 3' : undefined} style={{ pointerEvents: 'all' }} />
          {lines.map((l, i) => (
            <text key={i} x={a.x + 8} y={a.y - th / 2 + 4 + lh * (i + 0.5)} dominantBaseline="central" fontSize={s.fontSize} fill={d.text ? s.textColor : 'rgba(156,163,175,0.7)'}
                  fontFamily={FONT} fontWeight={s.bold ? 700 : 400} fontStyle={s.italic ? 'italic' : 'normal'} style={{ pointerEvents: 'none' }}>{l || ' '}</text>
          ))}
        </>),
        handles: [], range: range(dpts),
      }
    }
    case 'emoji':
      return {
        el: <text x={a.x} y={a.y} fontSize={(s.fontSize || 13) * 2.1} fontFamily={EMOJI_FONT} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'all', cursor: 'pointer', userSelect: 'none' }}>{d.emoji || '🚀'}</text>,
        handles: [], range: range(dpts),
      }

    default:
      return null
  }
}

const RED_FALLBACK = '#F23645'