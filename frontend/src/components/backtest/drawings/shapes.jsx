import React from 'react';
import { bbox, dist, extendLine, fmtDuration, hexToRgba, smoothPath } from './geometry';
import { dashArray, TOOLS } from './tools';

const FONT = '"Trebuchet MS", Roboto, -apple-system, sans-serif';
const HIT = 12;

export const decimals = (A) => Math.max(0, Math.min(8, Math.round(-Math.log10(A.tickSize || 0.00001))));
export const snapTick = (A, p) => Math.round(p / A.tickSize) * A.tickSize;

/* ---------- small SVG building blocks ---------- */
export function Pill({ x, y, lines, bg, color = '#fff', fs = 12, anchor = 'middle', pad = 6, stroke }) {
  const w = Math.max(...lines.map((l) => l.length)) * fs * 0.6 + pad * 2;
  const lh = fs + 3, h = lines.length * lh + pad - 1;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x0} y={y - h / 2} width={w} height={h} rx={3} fill={bg} stroke={stroke} strokeWidth={stroke ? 1 : 0} />
      {lines.map((l, i) => (
        <text key={i} x={x0 + w / 2} y={y - h / 2 + pad / 2 + lh * (i + 0.5) + fs * 0.35} fontSize={fs} fill={color}
          textAnchor="middle" fontFamily={FONT}>{l}</text>
      ))}
    </g>
  );
}

const HitLine = ({ a, b }) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />;
const HitPoly = ({ pts, fill }) => <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="transparent" stroke="transparent" strokeWidth={HIT} style={{ pointerEvents: fill ? 'all' : 'stroke', cursor: 'pointer' }} />;

function Arrowhead({ from, to, color, size = 9 }) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const a1 = ang + Math.PI * 0.86, a2 = ang - Math.PI * 0.86;
  const p1 = { x: to.x + Math.cos(a1) * size, y: to.y + Math.sin(a1) * size };
  const p2 = { x: to.x + Math.cos(a2) * size, y: to.y + Math.sin(a2) * size };
  return <path d={`M${p1.x},${p1.y}L${to.x},${to.y}L${p2.x},${p2.y}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
}

function TextOnLine({ a, b, s, selected }) {
  const txt = s.text || '';
  if (!txt) return null;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  let deg = (ang * 180) / Math.PI; if (deg > 90 || deg < -90) deg += 180;
  const hx = s.hAlign === 'left' ? 0.08 : s.hAlign === 'right' ? 0.92 : 0.5;
  const cx = a.x + (b.x - a.x) * hx, cy = a.y + (b.y - a.y) * hx;
  const dy = s.vAlign === 'top' ? -8 - s.fontSize * 0.5 : s.vAlign === 'bottom' ? 8 + s.fontSize * 0.5 : 0;
  return (
    <text transform={`translate(${cx},${cy}) rotate(${deg}) translate(0,${dy})`} fontSize={s.fontSize} fill={s.textColor} textAnchor="middle"
      dominantBaseline="central" fontFamily={FONT} fontWeight={s.bold ? 700 : 400} fontStyle={s.italic ? 'italic' : 'normal'} style={{ pointerEvents: 'none' }}>{txt}</text>
  );
}

function BoxText({ r, s, selected }) {
  const empty = !s.text;
  if (empty && !selected) return null;
  const x = s.hAlign === 'left' ? r.x1 + 8 : s.hAlign === 'right' ? r.x2 - 8 : (r.x1 + r.x2) / 2;
  const y = s.vAlign === 'top' ? r.y1 + 14 : s.vAlign === 'bottom' ? r.y2 - 14 : (r.y1 + r.y2) / 2;
  const anchor = s.hAlign === 'left' ? 'start' : s.hAlign === 'right' ? 'end' : 'middle';
  return (
    <text x={x} y={y} fontSize={s.fontSize} textAnchor={anchor} dominantBaseline="central" fontFamily={FONT}
      fill={empty ? 'rgba(209,212,220,.55)' : s.textColor} fontWeight={s.bold ? 700 : 400}
      fontStyle={empty || s.italic ? 'italic' : 'normal'} style={{ pointerEvents: 'none' }}>{empty ? '+ Add text' : s.text}</text>
  );
}

/* ---------- position (long / short) maths ---------- */
export function positionModel(d, A) {
  const s = d.style, isLong = d.type === 'long';
  const entry = d.points[0].p, target = d.points[1].p, stop = d.points[2].p;
  const tick = A.tickSize || 0.00001, pip = A.pipSize || tick * 10;
  const riskAmt = s.riskUnit === '%' ? (s.accountSize * s.risk) / 100 : s.risk;
  const stopDist = Math.max(Math.abs(entry - stop), tick);
  const tgtDist = Math.abs(target - entry);
  const qty = Math.max(0, Math.round(riskAmt / stopDist));
  const last = A.lastPrice ?? entry;
  const pnl = (isLong ? last - entry : entry - last) * qty;
  const dp = decimals(A);
  return { isLong, entry, target, stop, stopDist, tgtDist, qty, pnl, rr: tgtDist / stopDist, dp,
    targetLabel: `Target: ${tgtDist.toFixed(dp)} (${((tgtDist / entry) * 100).toFixed(3)}%) ${(tgtDist / pip).toFixed(1)}, Amount: ${Math.round(s.accountSize + qty * tgtDist)}`,
    stopLabel: `Stop: ${stopDist.toFixed(dp)} (${((stopDist / entry) * 100).toFixed(3)}%) ${(stopDist / pip).toFixed(1)}, Amount: ${Math.round(s.accountSize - qty * stopDist)}`,
    pnlLabel: [`Open PnL: ${pnl.toFixed(2)}, Qty: ${qty}`, `Risk/reward ratio: ${(tgtDist / stopDist).toFixed(2)}`],
    ticksTarget: Math.round(tgtDist / tick), ticksStop: Math.round(stopDist / tick) };
}

export function newPosition(type, A, at, px) {
  const isLong = type === 'long';
  const w = Math.max(90, A.plot.width * 0.08), h = Math.max(45, A.plot.height * 0.09);
  const t2 = A.xToTime(px.x + w);
  const target = A.yToPrice(px.y + (isLong ? -h : h)), stop = A.yToPrice(px.y + (isLong ? h : -h));
  return [{ t: at.t, p: at.p }, { t: t2, p: target }, { t: at.t, p: stop }];
}

/* ---------- axis chips (price / time labels) ---------- */
export function PriceChip({ A, p, bg = '#2962FF', color = '#fff' }) {
  const y = A.priceToY(p); if (y < -2 || y > A.plot.height + 2) return null;
  const txt = A.formatPrice(p);
  return (<g style={{ pointerEvents: 'none' }}><rect x={A.plot.width} y={y - 9} width={A.priceAxisWidth} height={18} fill={bg} />
    <text x={A.plot.width + 6} y={y + 4} fontSize={11} fill={color} fontFamily={FONT}>{txt}</text></g>);
}
export function TimeChip({ A, t, bg = '#2962FF', color = '#fff' }) {
  const x = A.timeToX(t); const txt = A.formatTime(t); const w = txt.length * 6.3 + 14;
  const cx = Math.min(Math.max(x, w / 2), A.plot.width - w / 2);
  return (<g style={{ pointerEvents: 'none' }}><rect x={cx - w / 2} y={A.plot.height} width={w} height={20} fill={bg} />
    <text x={cx} y={A.plot.height + 14} fontSize={11} fill={color} fontFamily={FONT} textAnchor="middle">{txt}</text></g>);
}

/* ---------- main shape renderer ---------- */
export function renderShape(d, A, { selected, hovered, theme }) {
  const s = d.style;
  const P = d.points.map((p) => ({ x: A.timeToX(p.t), y: A.priceToY(p.p) }));
  const W = A.plot.width, H = A.plot.height;
  const stroke = { stroke: s.color, strokeWidth: s.width, strokeDasharray: dashArray(s.dash, s.width), strokeLinecap: 'round' };
  const out = { el: null, handles: [], bounds: null };
  const handlePts = (shape = 'circle') => P.map((p, i) => ({ k: 'p' + i, x: p.x, y: p.y, shape, cursor: 'pointer' }));
  const pr = (arr) => ({ pMin: Math.min(...arr), pMax: Math.max(...arr) });

  switch (d.type) {
    case 'trendline': case 'ray': case 'extline': case 'arrow': {
      const [a, b] = P; const [e1, e2] = extendLine(a, b, s.extend, W, H);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dp = decimals(A), dP = d.points[1].p - d.points[0].p;
      const bars = Math.round(A.timeToLogical(d.points[1].t) - A.timeToLogical(d.points[0].t));
      const showStats = s.stats !== 'hidden' && (s.alwaysStats || selected || hovered);
      out.el = (<g>
        <HitLine a={e1} b={e2} />
        <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} {...stroke} />
        {s.arrowEnd && <Arrowhead from={a} to={b} color={s.color} />}
        {s.arrowStart && <Arrowhead from={b} to={a} color={s.color} />}
        {s.middlePoint && <circle cx={mid.x} cy={mid.y} r={3.5} fill={s.color} />}
        <TextOnLine a={a} b={b} s={s} selected={selected} />
        {showStats && <Pill x={s.statsPos === 'left' ? a.x : s.statsPos === 'center' ? mid.x : b.x} y={(s.statsPos === 'left' ? a.y : s.statsPos === 'center' ? mid.y : b.y) + (dP >= 0 ? -34 : 34)}
          lines={[`${dP >= 0 ? '+' : ''}${dP.toFixed(dp)} (${((dP / d.points[0].p) * 100).toFixed(2)}%)`, `${bars} bars, ${fmtDuration(d.points[1].t - d.points[0].t)}`]} bg="rgba(42,46,57,.95)" fs={11} />}
      </g>);
      out.handles = handlePts(); Object.assign(out, pr(d.points.map((p) => p.p)), { tMin: Math.min(d.points[0].t, d.points[1].t), tMax: Math.max(d.points[0].t, d.points[1].t) });
      if (s.priceLabels) out.axisChips = d.points.map((p) => ({ p: p.p, bg: s.color }));
      break;
    }
    case 'hline': case 'hray': {
      const a = P[0]; const x1 = d.type === 'hline' ? 0 : a.x;
      out.el = (<g><HitLine a={{ x: x1, y: a.y }} b={{ x: W, y: a.y }} /><line x1={x1} y1={a.y} x2={W} y2={a.y} {...stroke} />
        {s.text && <text x={s.hAlign === 'left' ? x1 + 8 : s.hAlign === 'right' ? W - 8 : (x1 + W) / 2} y={a.y - 6} fontSize={s.fontSize} fill={s.textColor} fontFamily={FONT} textAnchor={s.hAlign === 'left' ? 'start' : s.hAlign === 'right' ? 'end' : 'middle'} style={{ pointerEvents: 'none' }}>{s.text}</text>}</g>);
      out.handles = [{ k: 'p0', x: d.type === 'hline' ? W / 2 : a.x, y: a.y, shape: 'circle', cursor: 'ns-resize', lockX: d.type === 'hline' }];
      Object.assign(out, pr([d.points[0].p]));
      out.axisChips = [{ p: d.points[0].p, bg: s.color }];
      break;
    }
    case 'vline': {
      const a = P[0];
      out.el = (<g><HitLine a={{ x: a.x, y: 0 }} b={{ x: a.x, y: H }} /><line x1={a.x} y1={0} x2={a.x} y2={H} {...stroke} /></g>);
      out.handles = [{ k: 'p0', x: a.x, y: H / 2, shape: 'circle', cursor: 'ew-resize', lockY: true }];
      Object.assign(out, { tMin: d.points[0].t, tMax: d.points[0].t });
      break;
    }
    case 'channel': {
      const [a, b, c] = P; const k = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x);
      const dy = c.y - (a.y + k * (c.x - a.x));
      const a2 = { x: a.x, y: a.y + dy }, b2 = { x: b.x, y: b.y + dy };
      const [e1, e2] = extendLine(a, b, s.extend, W, H), [f1, f2] = extendLine(a2, b2, s.extend, W, H);
      out.el = (<g>
        {s.showFill && <polygon points={`${e1.x},${e1.y} ${e2.x},${e2.y} ${f2.x},${f2.y} ${f1.x},${f1.y}`} fill={hexToRgba(s.fill, s.fillOpacity)} style={{ pointerEvents: 'all', cursor: 'pointer' }} />}
        <HitLine a={e1} b={e2} /><HitLine a={f1} b={f2} />
        <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} {...stroke} /><line x1={f1.x} y1={f1.y} x2={f2.x} y2={f2.y} {...stroke} />
        {s.middleLine && <line x1={(e1.x + f1.x) / 2} y1={(e1.y + f1.y) / 2} x2={(e2.x + f2.x) / 2} y2={(e2.y + f2.y) / 2} stroke={s.color} strokeWidth={1} strokeDasharray="4 4" />}
      </g>);
      out.handles = [{ k: 'p0', x: a.x, y: a.y, shape: 'circle', cursor: 'pointer' }, { k: 'p1', x: b.x, y: b.y, shape: 'circle', cursor: 'pointer' },
        { k: 'p2', x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2, shape: 'circle', cursor: 'ns-resize', mid: true }];
      Object.assign(out, pr(d.points.map((p) => p.p)), { tMin: Math.min(d.points[0].t, d.points[1].t), tMax: Math.max(d.points[0].t, d.points[1].t) });
      break;
    }
    case 'fib': {
      const [a, b] = P; const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
      const pA = d.points[0].p, pB = d.points[1].p; const dp = decimals(A);
      const lv = (s.levels || []).filter((l) => l.on !== false);
      // TradingView convention: level 0 sits on the 2nd point, level 1 on the 1st point
      const priceAt = (v) => pB + (pA - pB) * v;
      const rows = lv.map((l) => ({ ...l, p: priceAt(l.v), y: A.priceToY(priceAt(l.v)) }));
      out.el = (<g>
        {s.showFill && rows.slice(0, -1).map((r, i) => (<rect key={i} x={x1} y={Math.min(r.y, rows[i + 1].y)} width={x2 - x1} height={Math.abs(rows[i + 1].y - r.y)} fill={hexToRgba(rows[i + 1].color, s.fillOpacity)} style={{ pointerEvents: 'all', cursor: 'pointer' }} />))}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#787B86" strokeWidth={1} strokeDasharray="4 4" />
        <HitLine a={a} b={b} />
        {rows.map((r, i) => (<g key={i}><line x1={x1} y1={r.y} x2={x2} y2={r.y} stroke={r.color} strokeWidth={s.width > 1 ? 1.5 : 1} />
          <HitLine a={{ x: x1, y: r.y }} b={{ x: x2, y: r.y }} />
          <text x={x1 - 6} y={r.y} fontSize={11} fill={r.color} textAnchor="end" dominantBaseline="central" fontFamily={FONT} style={{ pointerEvents: 'none' }}>{r.v}{s.showPrices ? ` (${r.p.toFixed(dp)})` : ''}</text></g>))}
      </g>);
      out.handles = handlePts(); Object.assign(out, pr([pA, pB]), { tMin: Math.min(d.points[0].t, d.points[1].t), tMax: Math.max(d.points[0].t, d.points[1].t) });
      break;
    }
    case 'rect': case 'ellipse': case 'priceRange': case 'dateRange': case 'dateAndPriceRange': case 'measure': {
      const r = bbox(P);
      const isEll = d.type === 'ellipse';
      const isMeasure = d.type === 'measure' || d.type.endsWith('Range');
      const up = d.points[1].p >= d.points[0].p;
      const col = isMeasure ? (up ? '#2962FF' : '#F23645') : s.color;
      const fillC = isMeasure ? hexToRgba(col, 0.2) : hexToRgba(s.fill, s.fillOpacity);
      const box = d.type === 'priceRange' ? { x1: Math.min(P[0].x, P[1].x), x2: Math.min(P[0].x, P[1].x) + 70, y1: r.y1, y2: r.y2 } : d.type === 'dateRange' ? { x1: r.x1, x2: r.x2, y1: P[0].y - 35, y2: P[0].y + 35 } : r;
      const dpx = decimals(A), dP = d.points[1].p - d.points[0].p;
      const pip = A.pipSize || A.tickSize * 10;
      const bars = Math.round(A.timeToLogical(d.points[1].t) - A.timeToLogical(d.points[0].t));
      const dur = fmtDuration(d.points[1].t - d.points[0].t);
      const l1 = `${dP >= 0 ? '' : ''}${dP.toFixed(dpx)} (${((dP / d.points[0].p) * 100).toFixed(2)}%) ${(dP / pip).toFixed(1)}`;
      const l2 = `${bars} bars, ${dur}`;
      const lines = d.type === 'priceRange' ? [l1] : d.type === 'dateRange' ? [l2] : [l1, l2];
      const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
      const labY = d.type === 'dateRange' ? box.y1 - 16 : up ? box.y1 - 24 : box.y2 + 24;
      out.el = (<g>
        {isEll ? <ellipse cx={cx} cy={cy} rx={(r.x2 - r.x1) / 2} ry={(r.y2 - r.y1) / 2} fill={s.showFill ? fillC : 'none'} {...stroke} style={{ pointerEvents: 'all', cursor: 'pointer' }} />
          : <rect x={box.x1} y={box.y1} width={box.x2 - box.x1} height={box.y2 - box.y1} fill={s.showFill !== false ? fillC : 'none'} stroke={isMeasure ? 'none' : s.color} strokeWidth={s.width} strokeDasharray={dashArray(s.dash, s.width)} style={{ pointerEvents: 'all', cursor: 'pointer' }} />}
        {isMeasure && d.type !== 'dateRange' && <Arrowhead from={{ x: cx, y: (box.y1 + box.y2) / 2 }} to={{ x: cx, y: up ? box.y1 : box.y2 }} color={col} />}
        {isMeasure && d.type !== 'priceRange' && <Arrowhead from={{ x: (box.x1 + box.x2) / 2, y: cy }} to={{ x: P[1].x >= P[0].x ? box.x2 : box.x1, y: cy }} color={col} />}
        {isMeasure && <g><line x1={cx} y1={box.y1} x2={cx} y2={box.y2} stroke={col} strokeWidth={1} style={{ pointerEvents: 'none' }} /><line x1={box.x1} y1={cy} x2={box.x2} y2={cy} stroke={col} strokeWidth={1} style={{ pointerEvents: 'none' }} /></g>}
        {isMeasure && <Pill x={cx} y={labY} lines={lines} bg={col} fs={12} />}
        {!isMeasure && <BoxText r={r} s={s} selected={selected} />}
      </g>);
      if (!isMeasure || d.type === 'dateAndPriceRange') out.handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((k) => {
        const x = k.includes('w') ? r.x1 : k.includes('e') ? r.x2 : (r.x1 + r.x2) / 2, y = k.includes('n') ? r.y1 : k.includes('s') ? r.y2 : (r.y1 + r.y2) / 2;
        return { k, x, y, shape: 'circle', cursor: { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }[k] };
      });
      else out.handles = handlePts();
      Object.assign(out, pr(d.points.map((p) => p.p)), { tMin: Math.min(d.points[0].t, d.points[1].t), tMax: Math.max(d.points[0].t, d.points[1].t) });
      break;
    }
    case 'circle': {
      const [c, e] = P; const rad = dist(c, e);
      out.el = (<g><circle cx={c.x} cy={c.y} r={rad} fill={s.showFill ? hexToRgba(s.fill, s.fillOpacity) : 'none'} {...stroke} style={{ pointerEvents: 'all', cursor: 'pointer' }} />
        <BoxText r={{ x1: c.x - rad, x2: c.x + rad, y1: c.y - rad, y2: c.y + rad }} s={s} selected={selected} /></g>);
      out.handles = [{ k: 'e', x: c.x + rad, y: c.y, shape: 'circle', cursor: 'ew-resize' }, { k: 'w', x: c.x - rad, y: c.y, shape: 'circle', cursor: 'ew-resize' },
        { k: 'n', x: c.x, y: c.y - rad, shape: 'circle', cursor: 'ns-resize' }, { k: 's', x: c.x, y: c.y + rad, shape: 'circle', cursor: 'ns-resize' }];
      Object.assign(out, pr([A.yToPrice(c.y - rad), A.yToPrice(c.y + rad)]), { tMin: A.xToTime(c.x - rad), tMax: A.xToTime(c.x + rad) });
      break;
    }
    case 'triangle': case 'polyline': case 'path': {
      const closed = d.type === 'triangle' || (d.type === 'polyline' && s.showFill);
      const pts = P.map((p) => `${p.x},${p.y}`).join(' ');
      const hit = d.type === 'triangle' || (d.type === 'polyline' && s.showFill);
      out.el = (<g>
        {closed && P.length >= 3 && <polygon points={pts} fill={s.showFill !== false ? hexToRgba(s.fill, s.fillOpacity) : 'none'} stroke="none" style={{ pointerEvents: 'all', cursor: 'pointer' }} />}
        {P.slice(0, -1).map((p, i) => <HitLine key={i} a={p} b={P[i + 1]} />)}
        {P.length >= 2 && <polyline points={pts} fill="none" {...stroke} strokeLinejoin="round" />}
        {closed && P.length >= 3 && <line x1={P[P.length - 1].x} y1={P[P.length - 1].y} x2={P[0].x} y2={P[0].y} {...stroke} />}
        {s.arrowEnd && P.length >= 2 && <Arrowhead from={P[P.length - 2]} to={P[P.length - 1]} color={s.color} />}
        {d.type === 'triangle' && <BoxText r={bbox(P)} s={s} selected={selected} />}
      </g>);
      out.handles = handlePts(); Object.assign(out, pr(d.points.map((p) => p.p)), { tMin: Math.min(...d.points.map((p) => p.t)), tMax: Math.max(...d.points.map((p) => p.t)) });
      break;
    }
    case 'brush': case 'highlighter': {
      const hl = d.type === 'highlighter';
      const closedFill = !hl && s.showFill;
      out.el = (<g>
        <path d={smoothPath(P)} fill="none" stroke="transparent" strokeWidth={Math.max(HIT, s.width + 8)} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
        {closedFill && <path d={smoothPath(P) + 'Z'} fill={hexToRgba(s.fill, s.fillOpacity)} stroke="none" />}
        <path d={smoothPath(P)} fill="none" stroke={s.color} strokeOpacity={hl ? s.opacity ?? 0.4 : 1} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashArray(s.dash, s.width)} />
        {!hl && s.arrowEnd && P.length > 2 && <Arrowhead from={P[P.length - 3]} to={P[P.length - 1]} color={s.color} />}
      </g>);
      out.handles = [];
      Object.assign(out, pr(d.points.map((p) => p.p)), { tMin: Math.min(...d.points.map((p) => p.t)), tMax: Math.max(...d.points.map((p) => p.t)) });
      break;
    }
    case 'arrowUp': case 'arrowDown': {
      const a = P[0], up = d.type === 'arrowUp', dir = up ? 1 : -1;
      const path = up ? `M${a.x},${a.y} l-11,13 h7 v14 h8 v-14 h7 z` : `M${a.x},${a.y} l-11,-13 h7 v-14 h8 v14 h7 z`;
      out.el = (<g><path d={path} fill={s.color} style={{ pointerEvents: 'all', cursor: 'pointer' }} />
        {s.text && <text x={a.x} y={a.y + dir * 44} fontSize={s.fontSize} fill={s.textColor} textAnchor="middle" fontFamily={FONT} fontWeight={s.bold ? 700 : 400} style={{ pointerEvents: 'none' }}>{s.text}</text>}</g>);
      Object.assign(out, pr([d.points[0].p]), { tMin: d.points[0].t, tMax: d.points[0].t });
      break;
    }
    case 'text': {
      const a = P[0]; const lines = (s.text || '').split('\n'); const lh = s.fontSize * 1.3;
      const w = Math.max(40, Math.max(...lines.map((l) => l.length), 3) * s.fontSize * 0.58) + 12, h = lines.length * lh + 8;
      out.el = (<g>
        {(s.showBg || selected) && <rect x={a.x} y={a.y - h / 2} width={w} height={h} rx={3} fill={s.showBg ? s.bg : 'transparent'} stroke={s.showBorder || selected ? (selected ? '#2962FF' : s.color) : 'none'} strokeDasharray={selected && !s.showBorder ? '3 3' : undefined} style={{ pointerEvents: 'all', cursor: 'pointer' }} />}
        <rect x={a.x} y={a.y - h / 2} width={w} height={h} fill="transparent" style={{ pointerEvents: 'all', cursor: 'pointer' }} />
        {lines.map((l, i) => (<text key={i} x={a.x + 6} y={a.y - h / 2 + 4 + lh * (i + 0.5)} fontSize={s.fontSize} fill={s.textColor} dominantBaseline="central" fontFamily={FONT} fontWeight={s.bold ? 700 : 400} fontStyle={s.italic ? 'italic' : 'normal'} style={{ pointerEvents: 'none' }}>{l || ' '}</text>))}
        {!s.text && <text x={a.x + 6} y={a.y} fontSize={s.fontSize} fill="rgba(209,212,220,.5)" dominantBaseline="central" fontStyle="italic" fontFamily={FONT} style={{ pointerEvents: 'none' }}>Add text</text>}
      </g>);
      Object.assign(out, pr([d.points[0].p]), { tMin: d.points[0].t, tMax: d.points[0].t });
      break;
    }
    case 'emoji': {
      const a = P[0];
      out.el = (<g><text x={a.x} y={a.y} fontSize={s.size} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'all', cursor: 'pointer', userSelect: 'none' }}>{s.emoji}</text></g>);
      Object.assign(out, pr([d.points[0].p]), { tMin: d.points[0].t, tMax: d.points[0].t });
      break;
    }
    case 'long': case 'short': {
      const m = positionModel(d, A);
      const x1 = P[0].x, x2 = Math.max(P[1].x, x1 + 8), yE = P[0].y, yT = A.priceToY(m.target), yS = A.priceToY(m.stop);
      const mx = (x1 + x2) / 2;
      const tgtCol = s.targetColor, stpCol = s.stopColor;
      const pnlCol = m.pnl >= 0 ? tgtCol : stpCol;
      const tgtLabelY = m.isLong ? yT - 14 : yT + 14, stpLabelY = m.isLong ? yS + 14 : yS - 14;
      const showLabels = s.stats !== 'hidden' && (s.alwaysStats || selected || hovered);
      out.el = (<g>
        <rect x={x1} y={Math.min(yE, yT)} width={x2 - x1} height={Math.abs(yT - yE)} fill={hexToRgba(tgtCol, s.fillOpacity)} style={{ pointerEvents: 'all', cursor: 'pointer' }} />
        <rect x={x1} y={Math.min(yE, yS)} width={x2 - x1} height={Math.abs(yS - yE)} fill={hexToRgba(stpCol, s.fillOpacity)} style={{ pointerEvents: 'all', cursor: 'pointer' }} />
        <line x1={x1} y1={yE} x2={x2} y2={yE} stroke={s.lineColor} strokeWidth={s.width + 1} />
        {showLabels && <>
          <Pill x={mx} y={tgtLabelY} lines={[m.targetLabel]} bg={tgtCol} color={s.textColor} fs={s.fontSize - 1} />
          <Pill x={mx} y={stpLabelY} lines={[m.stopLabel]} bg={stpCol} color={s.textColor} fs={s.fontSize - 1} />
          <Pill x={mx} y={m.isLong ? yE + 22 : yE - 22} lines={s.compact ? [m.pnlLabel[0]] : m.pnlLabel} bg={pnlCol} color={s.textColor} fs={s.fontSize - 1} stroke="rgba(255,255,255,.85)" />
        </>}
      </g>);
      out.handles = [
        { k: 'target', x: mx, y: yT, shape: 'square', cursor: 'ns-resize' }, { k: 'stop', x: mx, y: yS, shape: 'square', cursor: 'ns-resize' },
        { k: 'left', x: x1, y: yE, shape: 'circle', cursor: 'ew-resize' }, { k: 'right', x: x2, y: yE, shape: 'circle', cursor: 'ew-resize' },
      ];
      Object.assign(out, pr([m.target, m.stop, m.entry]), { tMin: Math.min(d.points[0].t, d.points[1].t), tMax: Math.max(d.points[0].t, d.points[1].t) });
      if (s.priceLabels) out.axisChips = [{ p: m.target, bg: tgtCol }, { p: m.stop, bg: stpCol }, { p: m.entry, bg: '#363A45' }];
      out.alwaysChips = true;
      break;
    }
    default: break;
  }
  return out;
}

/* ---------- handle dragging → new points ---------- */
export function dragHandle(d, k, px, A, { shift } = {}) {
  const pt = { t: A.xToTime(px.x), p: A.yToPrice(px.y) };
  const pts = d.points.map((p) => ({ ...p }));
  switch (d.type) {
    case 'rect': case 'ellipse': case 'measure': case 'priceRange': case 'dateRange': case 'dateAndPriceRange': {
      if (k.startsWith('p')) { pts[+k[1]] = pt; return { points: pts }; }
      let tL = Math.min(pts[0].t, pts[1].t), tR = Math.max(pts[0].t, pts[1].t), pT = Math.max(pts[0].p, pts[1].p), pB = Math.min(pts[0].p, pts[1].p);
      if (k.includes('n')) pT = pt.p; if (k.includes('s')) pB = pt.p; if (k.includes('w')) tL = pt.t; if (k.includes('e')) tR = pt.t;
      return { points: [{ t: tL, p: pT }, { t: tR, p: pB }] };
    }
    case 'circle': {
      const c = { x: A.timeToX(d.points[0].t), y: A.priceToY(d.points[0].p) };
      const r = dist(c, px); const e = { x: c.x + r, y: c.y };
      return { points: [pts[0], { t: A.xToTime(e.x), p: A.yToPrice(e.y) }] };
    }
    case 'long': case 'short': {
      if (k === 'target') pts[1].p = pt.p; else if (k === 'stop') pts[2].p = pt.p;
      else if (k === 'right') pts[1].t = pt.t;
      else if (k === 'left') { const dt = pt.t - pts[0].t; pts[0].t = pt.t; pts[2].t = pt.t; if (pts[1].t - pt.t < (A.barInterval || 60)) pts[1].t = pt.t + (A.barInterval || 60); }
      return { points: pts };
    }
    case 'hline': case 'hray': pts[0] = { t: d.type === 'hline' ? pts[0].t : pt.t, p: pt.p }; return { points: pts };
    case 'vline': pts[0] = { t: pt.t, p: pts[0].p }; return { points: pts };
    default: pts[+k.slice(1)] = pt; return { points: pts };
  }
}

/** hit-test helper used for the eraser & hover (screen space) */
export function isCapturable(type) { return !!TOOLS[type]; }