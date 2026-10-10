// ─────────────────────────────────────────────────────────────────────────
// Number helpers shared by the economic-calendar services. They live in their
// own file so calendar.js and officialActuals.js can both use them without
// importing each other.
// ─────────────────────────────────────────────────────────────────────────
export const SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }

// "-100.8B" → { value: -1.008e11, raw: -100.8, suffix: 'B', pct: false, decimals: 1 }
export function parseNum(s) {
  if (s == null) return null
  const str = String(s).trim()
  if (!str || str.includes('|')) return null              // auction "yield|bid-to-cover" pairs
  const m = str.match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])?\s*(%)?$/i)
  if (!m) return null
  const scale = m[2] ? SCALE[m[2].toUpperCase()] : 1
  return { value: parseFloat(m[1]) * scale, raw: parseFloat(m[1]), suffix: m[2] ? m[2].toUpperCase() : '', pct: !!m[3], decimals: (m[1].split('.')[1] || '').length }
}

// Render `num` in the same style as an existing sample string ("200K", "5.4%", "55.1").
export function formatLike(sample, num) {
  const p = parseNum(sample)
  if (!p || !Number.isFinite(num)) return null
  const v = p.suffix ? num / SCALE[p.suffix] : num
  return `${v.toFixed(Math.min(2, p.decimals))}${p.suffix}${p.pct ? '%' : ''}`
}

export const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))

// Round half away from zero, tolerant of binary-float noise (2.4500000000000002 → 2.5, 2.65 → 2.7).
export function roundHalfAway(x, dec) {
  const f = 10 ** dec
  const r = Math.round(Math.abs(x) * f + 1e-9) / f
  return x < 0 ? -r : r
}