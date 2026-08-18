// ─── MT5 Report Parser ─────────────────────────────────────────────────────
// Parses:
//   1. MT5 "Report History" HTML export (Terminal → History tab → right-click
//      → Report → HTML, or the web/mobile terminal's "Export" button)
//   2. CSV exports — either one-row-per-closed-trade ("round trip") files,
//      or one-row-per-deal files (raw MT5 deal history)
//
// Both paths converge on the same normalized trade shape used everywhere
// else in the app (see broker.js `sync-trades`), so imported trades look
// identical to MetaAPI-synced trades.
import * as cheerio from 'cheerio'

// ─── Shared helpers (also used by broker.js) ───────────────────────────────
export function getSession(dateStr) {
  const h = new Date(dateStr).getUTCHours()
  if (h >= 0  && h < 8)  return 'Asian'
  if (h >= 8  && h < 13) return 'London'
  if (h >= 13 && h < 21) return 'New York'
  return 'Asian'
}

export function fmtDuration(t1, t2) {
  const m = Math.round((new Date(t2) - new Date(t1)) / 60000)
  if (!Number.isFinite(m) || m < 0) return null
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// Fixed-offset timezones commonly used by MT5 brokers. Values are the
// dropdown the frontend shows — the backend only ever needs the minute
// offset, so the two stay in sync by sharing this list.
export const TIMEZONE_OPTIONS = [
  { value: 0,    label: 'UTC (Coordinated Universal Time)' },
  { value: 120,  label: 'UTC+2 — EET (most brokers, e.g. Exness, IC Markets)' },
  { value: 180,  label: 'UTC+3 — MSK / MT5 default server time' },
  { value: 60,   label: 'UTC+1 — CET' },
  { value: -240, label: 'UTC-4 — EDT (New York, summer)' },
  { value: -300, label: 'UTC-5 — EST (New York, winter)' },
  { value: 330,  label: 'UTC+5:30 — IST (India)' },
  { value: 480,  label: 'UTC+8 — SGT / CST (Asia)' },
]

function parseNumber(raw) {
  if (raw == null) return 0
  const cleaned = String(raw).replace(/[,\s]/g, '').replace(/[^\d.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

// MT5 timestamps look like "2026.07.15 09:32:11" or "2026-07-15 09:32:11".
// They're in the trading server's local time — never UTC — so we subtract
// the user-selected offset to land on the true UTC instant.
function parseMt5Time(raw, tzOffsetMinutes) {
  if (!raw) return null
  const cleaned = String(raw).trim().replace(/\./g, '-')
  const isoish = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T')
  const naive = new Date(`${isoish}Z`) // treat the literal digits as if UTC…
  if (isNaN(naive.getTime())) return null
  // …then shift by the offset to get the *real* UTC instant.
  return new Date(naive.getTime() - tzOffsetMinutes * 60000)
}

function normalizeSide(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s.startsWith('sell') || s === 's') return 'SELL'
  return 'BUY' // default — 'buy', 'b', 'in/buy', etc.
}

function externalIdFor(positionId, symbol, openTime, closeTime, volume) {
  if (positionId) return `mt5_${positionId}`
  // No stable ticket available (loose CSV) — derive a repeatable fingerprint
  // so re-importing the same file doesn't create duplicate trades.
  const key = `${symbol}|${openTime || ''}|${closeTime || ''}|${volume}`
  let hash = 0
  for (let i = 0; i < key.length; i++) { hash = (hash * 31 + key.charCodeAt(i)) | 0 }
  return `csv_${Math.abs(hash)}`
}

function buildTrade({ symbol, side, volume, openPrice, closePrice, openTime, closeTime,
                       commission, swap, profit, comment, positionId, source }) {
  const opened = openTime  ? openTime.toISOString()  : null
  const closed = closeTime ? closeTime.toISOString() : null
  const netProfit = profit + (commission || 0) + (swap || 0)
  const isClosed = !!(closePrice && closed)

  return {
    symbol:      String(symbol || '').toUpperCase().trim(),
    side,
    size:        parseFloat((volume || 0).toFixed(2)),
    entry_price: openPrice  != null ? parseFloat(Number(openPrice).toFixed(5))  : null,
    exit_price:  closePrice != null ? parseFloat(Number(closePrice).toFixed(5)) : null,
    pnl:         parseFloat(netProfit.toFixed(2)),
    status:      isClosed ? 'closed' : 'open',
    session:     opened ? getSession(opened) : null,
    duration:    (opened && closed) ? fmtDuration(opened, closed) : null,
    opened_at:   opened || closed,
    closed_at:   isClosed ? closed : null,
    notes:       comment || null,
    source,
    external_id: externalIdFor(positionId, symbol, opened, closed, volume),
  }
}

// ─── HTML parsing ───────────────────────────────────────────────────────────
function cellText($, td) { return $(td).text().replace(/\u00a0/g, ' ').trim() }

function findHeaderIndex($, $table) {
  // The header row is the first row whose cells are mostly bold, or whose
  // text matches one of the known column-name sets.
  let best = null
  $table.find('tr').each((i, tr) => {
    if (best) return
    const cells = $(tr).find('td,th').toArray().map(td => cellText($, td))
    const joined = cells.join('|').toLowerCase()
    if ((joined.includes('time') && joined.includes('symbol') && joined.includes('profit')) ||
        (joined.includes('deal') && joined.includes('direction'))) {
      best = { row: tr, cells }
    }
  })
  return best
}

function parsePositionsTable($, $table, tzOffsetMinutes, warnings) {
  const header = findHeaderIndex($, $table)
  if (!header) return null
  const cells = header.cells.map(c => c.toLowerCase())
  const timeIdxs = cells.reduce((acc, c, i) => (c === 'time' ? [...acc, i] : acc), [])
  if (timeIdxs.length < 2) return null // this is the Deals table, not Positions

  const symbolIdx = cells.indexOf('symbol')
  const typeIdx    = cells.indexOf('type')
  const volumeIdx  = cells.indexOf('volume')
  const posIdx     = cells.findIndex(c => c === 'position')
  const [openTimeIdx, closeTimeIdx] = timeIdxs
  // Prices always sit immediately after their neighbouring column — open
  // price right after Volume, close price right after the second Time —
  // so derive them positionally instead of assuming a fixed column count
  // (brokers vary on whether S/L, T/P, Position are present).
  const openPriceIdx  = volumeIdx + 1
  const commissionIdx = cells.indexOf('commission')
  const swapIdx        = cells.indexOf('swap')
  const profitIdx       = cells.lastIndexOf('profit')

  if (symbolIdx === -1 || volumeIdx === -1 || profitIdx === -1) return null

  const rows = []
  let rowEls = $(header.row).nextAll('tr').toArray()
  for (const tr of rowEls) {
    const tds = $(tr).find('td').toArray()
    if (tds.length < profitIdx + 1) continue
    const text = i => (tds[i] ? cellText($, tds[i]) : '')
    const symbol = text(symbolIdx)
    if (!symbol || symbol.toLowerCase() === 'symbol') continue

    const openTime  = parseMt5Time(text(openTimeIdx), tzOffsetMinutes)
    const closeTime = parseMt5Time(text(closeTimeIdx), tzOffsetMinutes)
    const openPrice  = parseNumber(text(openPriceIdx))
    const closePrice = parseNumber(text(closeTimeIdx + 1))

    if (!openTime && !closeTime) continue

    rows.push(buildTrade({
      symbol, side: normalizeSide(text(typeIdx)), volume: parseNumber(text(volumeIdx)),
      openPrice, closePrice, openTime, closeTime,
      commission: commissionIdx > -1 ? parseNumber(text(commissionIdx)) : 0,
      swap:       swapIdx > -1 ? parseNumber(text(swapIdx)) : 0,
      profit:     parseNumber(text(profitIdx)),
      comment:    null,
      positionId: posIdx > -1 ? text(posIdx) : null,
      source: 'html_import',
    }))
  }
  return rows.length ? rows : null
}

function parseDealsTableFallback($, $table, tzOffsetMinutes, warnings) {
  const header = findHeaderIndex($, $table)
  if (!header) return null
  const cells = header.cells.map(c => c.toLowerCase())
  if (!cells.includes('deal') && !cells.includes('direction')) return null

  const timeIdx       = cells.indexOf('time')
  const symbolIdx      = cells.indexOf('symbol')
  const typeIdx         = cells.indexOf('type')
  const directionIdx     = cells.indexOf('direction')
  const volumeIdx          = cells.indexOf('volume')
  const priceIdx            = cells.indexOf('price')
  const commissionIdx        = cells.indexOf('commission')
  const swapIdx                = cells.indexOf('swap')
  const profitIdx                = cells.indexOf('profit')
  const commentIdx                 = cells.lastIndexOf('comment')
  if (symbolIdx === -1 || directionIdx === -1) return null

  const deals = []
  for (const tr of $(header.row).nextAll('tr').toArray()) {
    const tds = $(tr).find('td').toArray()
    if (!tds.length) continue
    const text = i => (tds[i] ? cellText($, tds[i]) : '')
    const symbol = text(symbolIdx)
    const direction = text(directionIdx).toLowerCase()
    if (!symbol || !direction || !['in', 'out', 'in/out'].includes(direction)) continue
    const type = text(typeIdx).toLowerCase()
    if (type.includes('balance') || type.includes('credit') || type.includes('correction')) continue

    deals.push({
      time: parseMt5Time(text(timeIdx), tzOffsetMinutes),
      symbol, direction, side: normalizeSide(type),
      volume: parseNumber(text(volumeIdx)), price: parseNumber(text(priceIdx)),
      commission: commissionIdx > -1 ? parseNumber(text(commissionIdx)) : 0,
      swap: swapIdx > -1 ? parseNumber(text(swapIdx)) : 0,
      profit: profitIdx > -1 ? parseNumber(text(profitIdx)) : 0,
      comment: commentIdx > -1 ? text(commentIdx) : null,
    })
  }
  if (!deals.length) return null

  warnings.push('This report has no "Positions" table, so trades were reconstructed by pairing entry/exit deals (FIFO per symbol). Re-export with the Positions table included for perfect accuracy.')

  // FIFO pairing per symbol — 'in' deals open a queue, 'out' deals close
  // the oldest matching entry. This isn't perfect for hedging accounts but
  // is the best we can do without a shared position ID.
  const queues = {}
  const rows = []
  deals.sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0))
  for (const d of deals) {
    queues[d.symbol] = queues[d.symbol] || []
    if (d.direction === 'in') {
      queues[d.symbol].push(d)
    } else {
      const entry = queues[d.symbol].shift()
      if (!entry) continue
      rows.push(buildTrade({
        symbol: d.symbol, side: entry.side, volume: d.volume,
        openPrice: entry.price, closePrice: d.price,
        openTime: entry.time, closeTime: d.time,
        commission: entry.commission + d.commission, swap: entry.swap + d.swap,
        profit: d.profit, comment: d.comment,
        positionId: null, source: 'html_import',
      }))
    }
  }
  return rows.length ? rows : null
}

function extractAccountInfo($) {
  const info = {}
  $('td, th').each((_, el) => {
    const label = $(el).text().trim().toLowerCase()
    if (['account:', 'name:', 'company:', 'currency:', 'broker:'].includes(label)) {
      const val = $(el).next('td').text().trim()
      if (label === 'account:')  info.accountNumber = val
      if (label === 'name:')     info.accountName    = val
      if (label === 'company:' || label === 'broker:') info.broker = val
      if (label === 'currency:') info.currency       = val
    }
  })
  return info
}

export function parseMt5Html(htmlString, tzOffsetMinutes) {
  const $ = cheerio.load(htmlString)
  const warnings = []
  let trades = []

  const tables = $('table').toArray()
  for (const t of tables) {
    const positionRows = parsePositionsTable($, $(t), tzOffsetMinutes, warnings)
    if (positionRows) { trades = trades.concat(positionRows) }
  }
  if (!trades.length) {
    for (const t of tables) {
      const dealRows = parseDealsTableFallback($, $(t), tzOffsetMinutes, warnings)
      if (dealRows) { trades = trades.concat(dealRows) }
    }
  }

  if (!trades.length) {
    warnings.push('Could not find a recognizable Positions or Deals table in this file. Make sure it is an unmodified MT5 "Report History" HTML export.')
  }

  return { trades, accountInfo: extractAccountInfo($), warnings }
}

// ─── CSV parsing ────────────────────────────────────────────────────────────
function detectDelimiter(headerLine) {
  const counts = { ',': (headerLine.match(/,/g) || []).length,
                    ';': (headerLine.match(/;/g) || []).length,
                    '\t': (headerLine.match(/\t/g) || []).length }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function splitCsvLine(line, delim) {
  // Minimal quoted-field CSV splitter — handles "1,234.56" style quoting.
  const out = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuotes = !inQuotes; continue }
    if (c === delim && !inQuotes) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

const COLUMN_SYNONYMS = {
  id:         ['ticket', 'order', 'deal', 'position', 'position id', 'id'],
  openTime:   ['open time', 'time open', 'time', 'open date', 'date'],
  closeTime:  ['close time', 'time close', 'exit time', 'close date'],
  side:       ['type', 'side', 'direction'],
  volume:     ['volume', 'lots', 'size', 'qty', 'quantity'],
  symbol:     ['symbol', 'instrument', 'pair'],
  openPrice:  ['open price', 'price open', 'entry price', 'entry', 'price'],
  closePrice: ['close price', 'price close', 'exit price', 'exit'],
  commission: ['commission', 'comm'],
  swap:       ['swap'],
  profit:     ['profit', 'pnl', 'p&l', 'net profit', 'p/l'],
  comment:    ['comment', 'notes', 'note'],
}

function mapHeader(headers) {
  const map = {}
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const [field, names] of Object.entries(COLUMN_SYNONYMS)) {
    for (const name of names) {
      const idx = lower.indexOf(name)
      if (idx > -1 && map[field] === undefined) { map[field] = idx; break }
    }
  }
  return map
}

export function parseMt5Csv(csvString, tzOffsetMinutes) {
  const warnings = []
  const lines = csvString.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return { trades: [], accountInfo: {}, warnings: ['File appears to be empty.'] }

  const delim = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delim)
  const col = mapHeader(headers)

  if (col.symbol === undefined || col.volume === undefined) {
    return { trades: [], accountInfo: {}, warnings: ['Could not find Symbol/Volume columns — check the file is a standard MT5 trade history export.'] }
  }

  const dataRows = lines.slice(1).map(l => splitCsvLine(l, delim))
  const hasCloseColumns = col.closePrice !== undefined && col.closeTime !== undefined

  let trades = []
  if (hasCloseColumns) {
    // One row = one round-trip trade already.
    for (const r of dataRows) {
      const symbol = r[col.symbol]
      if (!symbol) continue
      const openTime  = col.openTime  !== undefined ? parseMt5Time(r[col.openTime], tzOffsetMinutes)  : null
      const closeTime = parseMt5Time(r[col.closeTime], tzOffsetMinutes)
      trades.push(buildTrade({
        symbol, side: normalizeSide(r[col.side]), volume: parseNumber(r[col.volume]),
        openPrice: col.openPrice !== undefined ? parseNumber(r[col.openPrice]) : null,
        closePrice: parseNumber(r[col.closePrice]),
        openTime, closeTime,
        commission: col.commission !== undefined ? parseNumber(r[col.commission]) : 0,
        swap:       col.swap !== undefined ? parseNumber(r[col.swap]) : 0,
        profit:     col.profit !== undefined ? parseNumber(r[col.profit]) : 0,
        comment:    col.comment !== undefined ? r[col.comment] : null,
        positionId: col.id !== undefined ? r[col.id] : null,
        source: 'csv_import',
      }))
    }
  } else {
    // One row = one deal (entry or exit) — pair via id if present, else FIFO.
    warnings.push('This CSV has one row per deal (no separate close price/time columns) — trades were reconstructed by pairing entries and exits.')
    const bySide = {}
    const rows = dataRows.map(r => ({
      id:     col.id !== undefined ? r[col.id] : null,
      time:   col.openTime !== undefined ? parseMt5Time(r[col.openTime], tzOffsetMinutes) : null,
      symbol: r[col.symbol], side: normalizeSide(r[col.side]),
      volume: parseNumber(r[col.volume]),
      price:  col.openPrice !== undefined ? parseNumber(r[col.openPrice]) : 0,
      commission: col.commission !== undefined ? parseNumber(r[col.commission]) : 0,
      swap:       col.swap !== undefined ? parseNumber(r[col.swap]) : 0,
      profit:     col.profit !== undefined ? parseNumber(r[col.profit]) : 0,
      comment:    col.comment !== undefined ? r[col.comment] : null,
    })).filter(r => r.symbol)
    rows.sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0))
    for (const d of rows) {
      bySide[d.symbol] = bySide[d.symbol] || []
      const queue = bySide[d.symbol]
      const opposite = queue.find(q => q.side !== d.side)
      if (!opposite) { queue.push(d); continue }
      queue.splice(queue.indexOf(opposite), 1)
      trades.push(buildTrade({
        symbol: d.symbol, side: opposite.side, volume: d.volume,
        openPrice: opposite.price, closePrice: d.price,
        openTime: opposite.time, closeTime: d.time,
        commission: opposite.commission + d.commission, swap: opposite.swap + d.swap,
        profit: d.profit, comment: d.comment || opposite.comment,
        positionId: d.id, source: 'csv_import',
      }))
    }
  }

  return { trades, accountInfo: {}, warnings }
}

export function parseImportFile(buffer, filename, format, tzOffsetMinutes) {
  const text = buffer.toString('utf8')
  const isHtml = format === 'html' || /\.html?$/i.test(filename) || /^\s*<!doctype html|^\s*<html/i.test(text)
  return isHtml ? parseMt5Html(text, tzOffsetMinutes) : parseMt5Csv(text, tzOffsetMinutes)
}