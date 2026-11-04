// Pure screen-space geometry helpers used by the drawing engine.
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Returns the two end points of a line a→b, optionally extended, clipped far beyond the viewport. */
export function extendLine(a, b, extend, w, h) {
  if (extend === 'none' || (a.x === b.x && a.y === b.y)) return [a, b];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const K = (Math.max(w, h) * 4 + 4000) / len;
  const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p1 = extend === 'left' || extend === 'both' ? at(-K) : a;
  const p2 = extend === 'right' || extend === 'both' ? at(K) : b;
  return [p1, p2];
}

export const bbox = (pts) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

export const inRect = (p, r, pad = 0) =>
  p.x >= r.x1 - pad && p.x <= r.x2 + pad && p.y >= r.y1 - pad && p.y <= r.y2 + pad;

export function distToRectEdge(p, r) {
  const d = [
    distToSegment(p, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }),
    distToSegment(p, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }),
    distToSegment(p, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }),
    distToSegment(p, { x: r.x1, y: r.y2 }, { x: r.x1, y: r.y1 }),
  ];
  return Math.min(...d);
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Catmull-Rom → cubic bezier smooth path through points (used by Brush / Highlighter). */
export function smoothPath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}l0.01,0`;
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Ramer–Douglas–Peucker simplification (keeps brush strokes light). */
export function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps && idx > -1) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function fmtDuration(sec) {
  const s = Math.abs(Math.round(sec));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && !d) parts.push(`${m}m`);
  const out = parts.join(' ') || '0m';
  return (sec < 0 ? '-' : '') + out;
}

export function hexToRgba(hex, a = 1) {
  if (!hex) return `rgba(0,0,0,${a})`;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}