import { useEffect, useRef, useState } from 'react';

/**
 * Adapter contract used by DrawingLayer (implement the same shape for any chart library):
 *  plot:{width,height}, priceAxisWidth, timeAxisHeight,
 *  timeToX(t) xToTime(x) priceToY(p) yToPrice(y)   // t = unix seconds (may be outside the loaded data), p = price
 *  timeToLogical(t) logicalToTime(l)               // bar-index space, fractional / outside-range allowed
 *  snapBar(t) -> {t,o,h,l,c} | null                // nearest bar (magnet + bar-aligned time)
 *  snapTime(t) -> number                           // bar-aligned time for future bars
 *  formatPrice(p) formatTime(t) tickSize pipSize lastPrice barInterval timeframeSeconds
 */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function fmtTime(t, tf) {
  const d = new Date(t * 1000), p2 = (n) => String(n).padStart(2, '0');
  const date = `${DAY[d.getUTCDay()]} ${p2(d.getUTCDate())} ${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
  if (tf >= 86400) return date;
  const h = d.getUTCHours(), ap = h >= 12 ? 'PM' : 'AM';
  return `${date}  ${p2(h % 12 === 0 ? 12 : h % 12)}:${p2(d.getUTCMinutes())} ${ap}`;
}

export function createLwcAdapter({ chart, series, container, data, timeframeSeconds, tickSize = 0.00001, pipSize, lastPrice }) {
  const ts = chart.timeScale();
  const n = data.length, first = data[0].time, last = data[n - 1].time, iv = timeframeSeconds;
  const lowerIdx = (t) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (data[m].time <= t) lo = m; else hi = m - 1; } return lo; };
  const timeToLogical = (t) => {
    if (t <= first) return (t - first) / iv;
    if (t >= last) return n - 1 + (t - last) / iv;
    const i = lowerIdx(t); const a = data[i].time, b = data[i + 1].time; return i + (t - a) / (b - a);
  };
  const logicalToTime = (l) => {
    if (l <= 0) return first + l * iv;
    if (l >= n - 1) return last + (l - (n - 1)) * iv;
    const i = Math.floor(l); return data[i].time + (l - i) * (data[i + 1].time - data[i].time);
  };
  const priceAxisWidth = chart.priceScale('right').width() || 56, timeAxisHeight = ts.height() || 26;
  const dp = Math.max(0, Math.min(8, Math.round(-Math.log10(tickSize))));
  return {
    plot: { width: Math.max(0, container.clientWidth - priceAxisWidth), height: Math.max(0, container.clientHeight - timeAxisHeight) },
    priceAxisWidth, timeAxisHeight, tickSize, pipSize: pipSize || tickSize * 10, lastPrice, barInterval: iv, timeframeSeconds,
    timeToLogical, logicalToTime,
    timeToX: (t) => ts.logicalToCoordinate(timeToLogical(t)) ?? -9999,
    xToTime: (x) => logicalToTime(ts.coordinateToLogical(x) ?? 0),
    priceToY: (p) => series.priceToCoordinate(p) ?? -9999,
    yToPrice: (y) => series.coordinateToPrice(y) ?? 0,
    snapBar: (t) => { const l = Math.round(timeToLogical(t)); if (l < 0 || l >= n) return null; const b = data[l]; return { t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }; },
    snapTime: (t) => (t > last ? last + Math.round((t - last) / iv) * iv : t),
    formatPrice: (p) => p.toFixed(dp), formatTime: (t) => fmtTime(t, timeframeSeconds),
  };
}

/** Bumps a counter whenever the visible range, size, or price-scale mapping changes → re-renders the overlay. */
export function useLwcViewKey(chart, series, container) {
  const [key, setKey] = useState(0);
  const snap = useRef('');
  useEffect(() => {
    if (!chart || !series || !container) return undefined;
    let raf = 0, alive = true;
    const tick = () => {
      if (!alive) return;
      const ts = chart.timeScale(), r = ts.getVisibleLogicalRange();
      const sig = [r?.from, r?.to, series.priceToCoordinate(1), series.priceToCoordinate(1.1), container.clientWidth, container.clientHeight, chart.priceScale('right').width()].join('|');
      if (sig !== snap.current) { snap.current = sig; setKey((k) => k + 1); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [chart, series, container]);
  return key;
}