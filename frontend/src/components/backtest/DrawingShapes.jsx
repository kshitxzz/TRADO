import { DASHES, FIB_LEVELS, lineToBounds, measureInfo, positionInfo, fmtDur } from '../../lib/backtest/drawings'
import { EMOJI_FONT } from '../../lib/backtest/emojiData'

const HIT = 11                      // invisible stroke width used for click targets
const fmt = (n, d) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const sgn = (n, d) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n), d)}`

/** Text with a rounded background chip. Width is estimated (no DOM measuring in the render path). */
function Chip({ x, y, text, fill = 'rgba(17,17,22,0.92)', color = '#E5E7EB', size = 11.5, anchor = 'start', stroke }) {
  const w = text.length * size * 0.6 + 12, h = size + 9
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={left} y={y - h / 2} width={w} height={h} rx={4} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />
      <text x={left + w / 2} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} fill={color} fontWeight={600}>{text}</text>
    </g>
  )
}

const Line = ({ a, b, d, hit = true, w }) => (
  <>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={d.style.color} strokeWidth={w ?? d.style.width}
          strokeDasharray={DASHES[d.style.dash]} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
    {hit && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />}
  </>
)

/**
 * @returns {{ el: JSX, handles: {x,y,idx,cursor?}[] } | null}
 * ctx: { px(pt), w, h, tfSecs, digits, barsBetween(t0,t1) }
 */
export function renderDrawing(d, ctx) {
  const { px, w, h, digits } = ctx
  const P = d.points.map(px)
  if (P.some(p => !p)) return null
  const s = d.style
  const [a, b, c] = P
  const handlesAll = P.map((p, idx) => ({ ...p, idx }))

  switch (d.type) {
    // ── lines ───────────────────────────────────────────────────────────
    case 'trendline':
      return { el: <Line a={a} b={b} d={d} />, handles: handlesAll }

    case 'ray': {
      const [, e] = lineToBounds(a, b, w, h, { right: true })
      return { el: <Line a={a} b={e} d={d} />, handles: handlesAll }
    }
    case 'extended': {
      const [s0, e] = lineToBounds(a, b, w, h, { left: true, right: true })
      return { el: <Line a={s0} b={e} d={d} />, handles: handlesAll }
    }
    case 'info': {
      const m = measureInfo(d.points[0], d.points[1], ctx.tfSecs, ctx.barsBetween(d.points[0].time, d.points[1].time))
      const angle = Math.round(Math.atan2(-(b.y - a.y), Math.abs(b.x - a.x) || 1) * 180 / Math.PI)
      return {
        el: (<>
          <Line a={a} b={b} d={d} />
          <Chip x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 18} anchor="middle"
                text={`${sgn(m.dp, digits)} (${sgn(m.pct, 2)}%)  ${m.bars} bars  ${angle}°`} />
        </>),
        handles: handlesAll,
      }
    }
    case 'hline': {
      const L = { x: 0, y: a.y }, R = { x: w, y: a.y }
      return {
        el: (<>
          <Line a={L} b={R} d={d} />
          <Chip x={w - 8} y={a.y} anchor="end" text={fmt(d.points[0].price, digits)} fill={s.color} color="#fff" />
        </>),
        handles: [{ x: a.x, y: a.y, idx: 0 }],
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
      return { el: <Line a={a} b={{ x: w, y: a.y }} d={d} />, handles: [{ x: a.x, y: a.y, idx: 0 }] }
    case 'vline':
      return { el: <Line a={{ x: a.x, y: 0 }} b={{ x: a.x, y: h }} d={d} />, handles: [{ x: a.x, y: Math.min(Math.max(a.y, 14), h - 14), idx: 0 }] }
    case 'cross':
      return {
        el: (<>
          <Line a={{ x: 0, y: a.y }} b={{ x: w, y: a.y }} d={d} />
          <Line a={{ x: a.x, y: 0 }} b={{ x: a.x, y: h }} d={d} />
        </>),
        handles: [{ x: a.x, y: a.y, idx: 0 }],
      }

    // ── channel ─────────────────────────────────────────────────────────
    case 'channel': {
      if (!c) return { el: <Line a={a} b={b} d={d} />, handles: handlesAll }
      const dx = b.x - a.x || 0.0001
      const slope = (b.y - a.y) / dx
      const off = c.y - (a.y + slope * (c.x - a.x))          // vertical gap to the parallel line
      const a2 = { x: a.x, y: a.y + off }, b2 = { x: b.x, y: b.y + off }
      const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
      return {
        el: (<>
          <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${b2.x},${b2.y} ${a2.x},${a2.y}`} fill={s.fill} fillOpacity={s.fillOpacity} style={{ pointerEvents: 'all' }} />
          <Line a={a} b={b} d={d} />
          <Line a={a2} b={b2} d={d} />
          <Line a={mid(a, a2)} b={mid(b, b2)} d={{ ...d, style: { ...s, dash: 'dashed', width: 1 } }} hit={false} />
        </>),
        handles: [{ ...a, idx: 0 }, { ...b, idx: 1 }, { x: c.x, y: c.y, idx: 2 }],
      }
    }

    // ── fibonacci ───────────────────────────────────────────────────────
    case 'fib': {
      const p0 = d.points[0], p1 = d.points[1]
      const xL = Math.min(a.x, b.x), xR = Math.max(a.x, b.x)
      const levels = FIB_LEVELS.map(l => {
        const price = p1.price - (p1.price - p0.price) * l.r
        return { ...l, price, y: px({ time: p1.time, price })?.y }
      }).filter(l => l.y != null)
      return {
        el: (<>
          {levels.slice(0, -1).map((l, i) => (
            <rect key={`b${i}`} x={xL} y={Math.min(l.y, levels[i + 1].y)} width={xR - xL} height={Math.abs(levels[i + 1].y - l.y)}
                  fill={levels[i + 1].color} fillOpacity={s.fillOpacity} style={{ pointerEvents: 'all' }} />
          ))}
          {levels.map(l => (
            <g key={l.r}>
              <line x1={xL} y1={l.y} x2={xR} y2={l.y} stroke={l.color} strokeWidth={1} style={{ pointerEvents: 'none' }} />
              <line x1={xL} y1={l.y} x2={xR} y2={l.y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />
              <text x={xL + 4} y={l.y - 4} fontSize={11} fill={l.color} style={{ pointerEvents: 'none' }}>
                {l.r} ({fmt(l.price, digits)})
              </text>
            </g>
          ))}
          <Line a={a} b={b} d={{ ...d, style: { ...s, dash: 'dashed', width: 1 } }} />
        </>),
        handles: handlesAll,
      }
    }

    // ── shapes ──────────────────────────────────────────────────────────
    case 'rect': {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y)
      return {
        el: (<>
          <rect x={x} y={y} width={rw} height={rh} fill={s.fill} fillOpacity={s.fillOpacity} stroke={s.color}
                strokeWidth={s.width} strokeDasharray={DASHES[s.dash]} style={{ pointerEvents: 'all' }} />
          {d.text && <text x={x + rw / 2} y={y + rh / 2} textAnchor="middle" dominantBaseline="central" fontSize={s.fontSize} fill={s.textColor} style={{ pointerEvents: 'none' }}>{d.text}</text>}
        </>),
        handles: [{ x: a.x, y: a.y, idx: 0 }, { x: b.x, y: b.y, idx: 1 }, { x: a.x, y: b.y, idx: 'c2' }, { x: b.x, y: a.y, idx: 'c3' }],
      }
    }
    case 'ellipse': {
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      return {
        el: <ellipse cx={cx} cy={cy} rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2} fill={s.fill} fillOpacity={s.fillOpacity}
                     stroke={s.color} strokeWidth={s.width} strokeDasharray={DASHES[s.dash]} style={{ pointerEvents: 'all' }} />,
        handles: handlesAll,
      }
    }
    case 'triangle': {
      const pts = (c ? [a, b, c] : [a, b]).map(p => `${p.x},${p.y}`).join(' ')
      return {
        el: <polygon points={pts} fill={s.fill} fillOpacity={s.fillOpacity} stroke={s.color} strokeWidth={s.width}
                     strokeDasharray={DASHES[s.dash]} strokeLinejoin="round" style={{ pointerEvents: 'all' }} />,
        handles: handlesAll,
      }
    }

    // ── long / short position ───────────────────────────────────────────
    case 'long':
    case 'short': {
      if (!c) return null
      const info = positionInfo(d)
      const x0 = a.x, x1 = b.x, yE = a.y, yT = b.y, yS = c.y
      const left = Math.min(x0, x1), width = Math.abs(x1 - x0)
      const green = s.fill, red = s.stopFill || '#F43F5E'
      const tText = `Target: ${fmt(info.reward, digits)} (${fmt(info.rewardPct, 2)}%)`
      const sText = `Stop: ${fmt(info.risk, digits)} (${fmt(info.riskPct, 2)}%)`
      const mid = left + width / 2
      return {
        el: (<>
          <rect x={left} y={Math.min(yE, yT)} width={width} height={Math.abs(yT - yE)} fill={green} fillOpacity={s.fillOpacity + 0.07} style={{ pointerEvents: 'all' }} />
          <rect x={left} y={Math.min(yE, yS)} width={width} height={Math.abs(yS - yE)} fill={red} fillOpacity={s.fillOpacity + 0.07} style={{ pointerEvents: 'all' }} />
          <line x1={left} y1={yE} x2={left + width} y2={yE} stroke="#9CA3AF" strokeWidth={1} style={{ pointerEvents: 'none' }} />
          <Chip x={mid} y={yT + (yT < yE ? 12 : -12)} anchor="middle" text={tText} fill={green} color="#fff" />
          <Chip x={mid} y={yS + (yS > yE ? -12 : 12)} anchor="middle" text={sText} fill={red} color="#fff" />
          <Chip x={mid} y={yE} anchor="middle" text={`Risk/reward ratio: ${fmt(info.rr, 2)}`} fill="rgba(31,41,55,0.95)" />
        </>),
        handles: [{ x: x0, y: yE, idx: 0 }, { x: x1, y: yT, idx: 1 }, { x: x1, y: yS, idx: 2 }],
      }
    }

    // ── measurers ───────────────────────────────────────────────────────
    case 'priceRange':
    case 'dateRange':
    case 'measure': {
      const m = measureInfo(d.points[0], d.points[1], ctx.tfSecs, ctx.barsBetween(d.points[0].time, d.points[1].time))
      const col = d.type === 'measure' ? (m.up ? '#3B82F6' : '#F43F5E') : s.color
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y)
      const cx = x + rw / 2, cy = y + rh / 2
      const label = d.type === 'priceRange'
        ? `${sgn(m.dp, digits)} (${sgn(m.pct, 2)}%)`
        : d.type === 'dateRange'
          ? `${Math.abs(m.bars)} bars, ${fmtDur(m.dt)}`
          : `${sgn(m.dp, digits)} (${sgn(m.pct, 2)}%)  ·  ${Math.abs(m.bars)} bars, ${fmtDur(m.dt)}`
      const arrow = (x1, y1, x2, y2) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={1.5} markerEnd={`url(#bt-arrow-${d.id})`} style={{ pointerEvents: 'none' }} />
      return {
        el: (<>
          <defs>
            <marker id={`bt-arrow-${d.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" fill={col} />
            </marker>
          </defs>
          {d.type !== 'priceRange' && d.type !== 'dateRange' && (
            <rect x={x} y={y} width={rw} height={rh} fill={col} fillOpacity={0.14} style={{ pointerEvents: 'all' }} />
          )}
          {d.type === 'priceRange' && <>
            <line x1={x} y1={a.y} x2={x + Math.max(rw, 60)} y2={a.y} stroke={col} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
            <line x1={x} y1={b.y} x2={x + Math.max(rw, 60)} y2={b.y} stroke={col} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
            <rect x={x} y={y} width={Math.max(rw, 60)} height={rh} fill={col} fillOpacity={0.1} style={{ pointerEvents: 'all' }} />
          </>}
          {d.type === 'dateRange' && <>
            <line x1={a.x} y1={0} x2={a.x} y2={h} stroke={col} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
            <line x1={b.x} y1={0} x2={b.x} y2={h} stroke={col} strokeDasharray="4 4" style={{ pointerEvents: 'none' }} />
            <rect x={x} y={0} width={rw} height={h} fill={col} fillOpacity={0.08} style={{ pointerEvents: 'all' }} />
          </>}
          {d.type !== 'dateRange' && arrow(d.type === 'priceRange' ? x + 30 : cx, a.y, d.type === 'priceRange' ? x + 30 : cx, b.y)}
          {d.type !== 'priceRange' && arrow(a.x, d.type === 'dateRange' ? cy : cy, b.x, d.type === 'dateRange' ? cy : cy)}
          <Chip x={cx} y={b.y >= a.y ? y + rh + 16 : y - 16} anchor="middle" text={label} fill={col} color="#fff" />
        </>),
        handles: handlesAll,
      }
    }

    // ── brush / text / emoji ────────────────────────────────────────────
    case 'brush': {
      const path = P.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      return {
        el: (<>
          <path d={path} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
          <path d={path} fill="none" stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke' }} />
        </>),
        handles: [],
      }
    }
    case 'text': {
      const text = d.text || 'Text'
      const tw = text.length * s.fontSize * 0.58 + 12
      return {
        el: (<>
          <rect x={a.x - 6} y={a.y - s.fontSize} width={tw} height={s.fontSize + 12} rx={4} fill="rgba(17,17,22,0.55)" stroke={s.color} strokeOpacity={0.5} style={{ pointerEvents: 'all' }} />
          <text x={a.x} y={a.y} fontSize={s.fontSize} fill={s.textColor} dominantBaseline="middle" fontWeight={600} style={{ pointerEvents: 'none' }}>{text}</text>
        </>),
        handles: [{ x: a.x, y: a.y, idx: 0 }],
      }
    }
    case 'emoji':
      return {
        el: <text x={a.x} y={a.y} fontSize={(s.fontSize || 13) * 2.1} fontFamily={EMOJI_FONT} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'all', cursor: 'pointer' }}>{d.emoji || '🚀'}</text>,
        handles: [{ x: a.x, y: a.y, idx: 0 }],
      }

    default:
      return null
  }
}