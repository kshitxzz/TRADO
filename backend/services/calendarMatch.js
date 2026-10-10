// ─────────────────────────────────────────────────────────────────────────
// Matching helpers shared by every cross-provider actuals source (FMP, MT5 feed):
// loose title similarity + "do the numbers reproduce Forex Factory's?" scale detection.
// ─────────────────────────────────────────────────────────────────────────
import { parseNum, near } from './calendarNumbers.js'

const TOKEN_ALIASES = [
  [/s\s*&\s*p global/g, ' '], [/non[- ]?manufacturing/g, 'services'],
  [/non[- ]?farm payrolls?/g, 'nfp'], [/consumer price index/g, 'cpi'], [/inflation rate/g, 'cpi'],
  [/producer price index/g, 'ppi'], [/\bmom\b|m\/m/g, 'mom'], [/\byoy\b|y\/y/g, 'yoy'], [/\bqoq\b|q\/q/g, 'qoq'],
  [/initial jobless claims|unemployment claims/g, 'claims'], [/&/g, ' and '],
]
// Words that differ between providers without changing which release it is (periods, revision stage, publisher).
const STOP = new Set(['the', 'of', 'and', 'rate', 'index', 'change', 'final', 'prelim', 'preliminary', 'flash', 'global',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'q1', 'q2', 'q3', 'q4'])
export function titleTokens(t) {
  let s = String(t || '').toLowerCase()
  for (const [re, to] of TOKEN_ALIASES) s = s.replace(re, to)
  return new Set(s.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)))
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

// FMP scale is not guaranteed to equal FF's (142 vs 142K). Find the scale at
// which FMP's own previous/estimate reproduce FF's forecast/previous exactly.
export const CANDIDATE_SCALES = [1, 1e3, 1e6, 1e9, 1e-3, 1e-6, 1e-9]
export function agreeingScale(ff, fmp) {
  const pairs = [[parseNum(ff.previous), fmp.previous], [parseNum(ff.forecast), fmp.estimate]]
    .filter(([p, v]) => p && typeof v === 'number' && Number.isFinite(v))
  if (!pairs.length) return null
  for (const s of CANDIDATE_SCALES) {
    // Percent strings are plain numbers on both sides; K/M/B strings are expanded by parseNum.
    const hits = pairs.filter(([p, v]) => near(p.pct ? p.raw : p.value, v * s)).length
    if (hits === pairs.length) return s            // every available figure must agree
  }
  return null
}