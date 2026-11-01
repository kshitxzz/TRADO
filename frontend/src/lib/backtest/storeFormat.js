// ─────────────────────────────────────────────────────────────────────────
// Trado market-data store — one file per symbol per UTC month of 1-minute BID candles.
// Shared by the ingest tool (writes) and the browser (reads), so the format has one definition.
//
//   header, 16 bytes, little-endian
//     0  magic  "TRD1"
//     4  version u8 (=1)
//     5  digits u8   price decimals; prices are stored as integers × 10^digits (exact, no float drift)
//     6  reserved u16
//     8  monthStart u32   unix seconds, 00:00 UTC on the 1st
//     12 count u32
//   then `count` records of 24 bytes
//     offset u32 (seconds after monthStart) · open i32 · high i32 · low i32 · close i32 · volume f32
//
// The files are gzip-compressed on disk / on the CDN (see ingest tool); this module only handles the raw bytes.
// ─────────────────────────────────────────────────────────────────────────

export const HEADER_BYTES = 16
export const RECORD_BYTES = 24
const VERSION = 1

export const monthKey = (t) => { const d = new Date(t * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

/** 'YYYY-MM' → unix seconds at the start of that UTC month. */
export function monthStart(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m || +m[2] < 1 || +m[2] > 12) throw new Error(`Bad month "${key}"`)
  return Date.UTC(+m[1], +m[2] - 1, 1) / 1000
}

/** Month keys from the one containing `fromSec` to the one containing `toSec`, inclusive. */
export function monthsBetween(fromSec, toSec) {
  const out = []
  const a = new Date(fromSec * 1000), b = new Date(toSec * 1000)
  let y = a.getUTCFullYear(), m = a.getUTCMonth()
  const ey = b.getUTCFullYear(), em = b.getUTCMonth()
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    if (++m === 12) { m = 0; y++ }
  }
  return out
}

/** @returns {Uint8Array} raw (uncompressed) month file. Throws rather than silently rounding or reordering anything. */
export function encodeMonth({ digits, month, candles }) {
  if (!Number.isInteger(digits) || digits < 0 || digits > 8) throw new Error(`Bad digits ${digits}`)
  const start = monthStart(month)
  const end = monthStart(monthsBetween(start, start + 40 * 86400)[1])
  const scale = 10 ** digits
  const buf = new ArrayBuffer(HEADER_BYTES + candles.length * RECORD_BYTES)
  const dv = new DataView(buf)
  dv.setUint8(0, 0x54); dv.setUint8(1, 0x52); dv.setUint8(2, 0x44); dv.setUint8(3, 0x31)   // "TRD1"
  dv.setUint8(4, VERSION); dv.setUint8(5, digits)
  dv.setUint32(8, start, true); dv.setUint32(12, candles.length, true)

  let prev = -1
  const px = (v, what, c) => {
    const s = v * scale, r = Math.round(s)
    if (Math.abs(s - r) > 1e-6) throw new Error(`${what} ${v} at ${new Date(c.time * 1000).toISOString()} has more than ${digits} decimals — raise "digits" for this symbol instead of rounding`)
    if (Math.abs(r) > 2147483647) throw new Error(`${what} ${v} does not fit in 32 bits at ${digits} digits`)
    return r
  }
  candles.forEach((c, i) => {
    if (c.time < start || c.time >= end) throw new Error(`Candle ${new Date(c.time * 1000).toISOString()} is outside ${month}`)
    if (c.time <= prev) throw new Error(`Candles must be strictly ascending (at ${new Date(c.time * 1000).toISOString()})`)
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) throw new Error(`Inconsistent candle at ${new Date(c.time * 1000).toISOString()}`)
    prev = c.time
    const o = HEADER_BYTES + i * RECORD_BYTES
    dv.setUint32(o, c.time - start, true)
    dv.setInt32(o + 4, px(c.open, 'open', c), true); dv.setInt32(o + 8, px(c.high, 'high', c), true)
    dv.setInt32(o + 12, px(c.low, 'low', c), true); dv.setInt32(o + 16, px(c.close, 'close', c), true)
    dv.setFloat32(o + 20, Number.isFinite(c.volume) ? c.volume : 0, true)
  })
  return new Uint8Array(buf)
}

/** @returns {{ digits:number, monthStart:number, candles:Array }} — throws on anything that is not a well-formed month file. */
export function decodeMonth(bytes) {
  if (!bytes || bytes.byteLength < HEADER_BYTES) throw new Error('Market-data file is truncated.')
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint8(0) !== 0x54 || dv.getUint8(1) !== 0x52 || dv.getUint8(2) !== 0x44 || dv.getUint8(3) !== 0x31) throw new Error('Not a Trado market-data file.')
  if (dv.getUint8(4) !== VERSION) throw new Error(`Unsupported market-data file version ${dv.getUint8(4)}.`)
  const digits = dv.getUint8(5), start = dv.getUint32(8, true), count = dv.getUint32(12, true)
  if (bytes.byteLength !== HEADER_BYTES + count * RECORD_BYTES) throw new Error('Market-data file is truncated or corrupt.')
  const scale = 10 ** digits
  const candles = new Array(count)
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * RECORD_BYTES
    candles[i] = {
      time: start + dv.getUint32(o, true),
      open: dv.getInt32(o + 4, true) / scale, high: dv.getInt32(o + 8, true) / scale,
      low: dv.getInt32(o + 12, true) / scale, close: dv.getInt32(o + 16, true) / scale,
      volume: dv.getFloat32(o + 20, true),
    }
  }
  return { digits, monthStart: start, candles }
}