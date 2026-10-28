// ─────────────────────────────────────────────────────────────────────────
// Backtesting — colour helpers for the settings dialog (pure).
// ─────────────────────────────────────────────────────────────────────────

const clamp = (n, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, n))
const hex2 = (n) => Math.round(clamp(n)).toString(16).padStart(2, '0')

/** "#rgb" | "#rrggbb" | "rgb()" | "rgba()" → { r, g, b, a } (a in 0..1) or null. */
export function parseColor(str) {
  if (!str || typeof str !== 'string') return null
  const s = str.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) { const [r, g, b] = m[1].split('').map(c => parseInt(c + c, 16)); return { r, g, b, a: 1 } }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 }
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(s)
  if (m) { const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return { r: +m[1], g: +m[2], b: +m[3], a: clamp(a, 0, 1) } }
  return null
}

export const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

/** hex + alpha → css colour (plain hex when fully opaque). */
export function toCss(hex, a = 1) {
  const c = parseColor(hex)
  if (!c) return hex
  return a >= 0.999 ? toHex(c) : `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(a * 100) / 100})`
}

export const colorHex = (str) => { const c = parseColor(str); return c ? toHex(c) : '#000000' }
export const colorAlpha = (str) => parseColor(str)?.a ?? 1

const mix = (c, to, t) => ({ r: c.r + (to.r - c.r) * t, g: c.g + (to.g - c.g) * t, b: c.b + (to.b - c.b) * t })

/** The picker's palette: grays, saturated hues, then lighter → darker variants of those hues. */
export function buildPalette() {
  const grays = ['#FFFFFF', '#E0E3EB', '#B2B5BE', '#9598A1', '#787B86', '#5D606B', '#434651', '#2A2E39', '#131722', '#000000']
  const hues = ['#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#089981', '#00BCD4', '#2962FF', '#673AB7', '#9C27B0', '#E91E63']
  const W = { r: 255, g: 255, b: 255 }, K = { r: 0, g: 0, b: 0 }
  const steps = [['w', 0.8], ['w', 0.6], ['w', 0.4], ['w', 0.2], ['k', 0.2], ['k', 0.4], ['k', 0.6]]
  const rows = steps.map(([k, t]) => hues.map(h => toHex(mix(parseColor(h), k === 'w' ? W : K, t))))
  return { grays, hues, rows }
}

/** Checkerboard shown behind translucent swatches. */
export const CHECKER = 'repeating-conic-gradient(#8a8d96 0% 25%, #5d606b 0% 50%) 50% / 8px 8px'