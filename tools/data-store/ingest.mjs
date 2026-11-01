#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Trado market-data ingest — Dukascopy 1-minute BID candles → the Trado data store.
//
//   node ingest.mjs --symbols XAUUSD,EURUSD --from 2025-01 --to 2026-10 --out ../../frontend/public/market-data
//   node ingest.mjs --check --out ../../frontend/public/market-data        (verify everything on disk)
//
// Options:  --force  re-download months that are already on disk
//           --cache  folder for dukascopy-node's download cache (default: your OS temp folder — never inside the repo)
//
// Safe to re-run: finished months are skipped (the current, still-growing month is always refreshed).
// Every month is validated, written, then READ BACK and compared before it is added to the manifest.
// The manifest is saved after EVERY month, so an interrupted run leaves a valid, usable store behind.
// Month files found on disk without a manifest entry are verified and adopted instead of re-downloaded.
// A hole in the middle of a symbol's history aborts the run — a backtest must never silently skip a month.
// (The current month being empty is not a hole: Dukascopy publishes with a delay, so the first days of a month can have no data yet.)
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { encodeMonth, decodeMonth, monthStart, monthsBetween, monthKey } from '../../frontend/src/lib/backtest/storeFormat.js'
import { cleanCandles } from '../../frontend/src/lib/backtest/aggregate.js'

// Trado symbol → Dukascopy instrument id, and the number of price decimals Dukascopy quotes.
export const SYMBOLS = {
  EURUSD: ['eurusd', 5], GBPUSD: ['gbpusd', 5], USDCHF: ['usdchf', 5], USDCAD: ['usdcad', 5], AUDUSD: ['audusd', 5], NZDUSD: ['nzdusd', 5],
  USDJPY: ['usdjpy', 3],
  EURGBP: ['eurgbp', 5], EURAUD: ['euraud', 5], GBPAUD: ['gbpaud', 5],
  EURJPY: ['eurjpy', 3], GBPJPY: ['gbpjpy', 3], AUDJPY: ['audjpy', 3],
  XAUUSD: ['xauusd', 3], XAGUSD: ['xagusd', 3],
  WTIUSD: ['lightcmdusd', 3], BRENTUSD: ['brentcmdusd', 3], NATGAS: ['gascmdusd', 3],
}

const MAX_BAD_RATIO = 0.001            // more than 0.1 % invalid / repaired rows in a month = something is wrong with the source
const SPIKE = 0.05                     // a >5 % one-minute move is reported (never removed — real events exist)

/** Outside the repo on purpose: a download cache must never be able to end up in git. */
export const defaultCacheDir = () => path.join(os.tmpdir(), 'trado-dukascopy-cache')

const sha = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 10)
const nextMonthKey = (m) => monthsBetween(monthStart(m), monthStart(m) + 40 * 86400)[1]

/** The real download — needs Chromium once, because Dukascopy protects its free feed with an AWS WAF challenge. */
export async function dukascopyMonth(instrument, month, { cacheDir = defaultCacheDir() } = {}) {
  const { getHistoricalRates } = await import('dukascopy-node')
  return getHistoricalRates({
    instrument, dates: { from: new Date(monthStart(month) * 1000), to: new Date(monthStart(nextMonthKey(month)) * 1000) },
    timeframe: 'm1', priceType: 'bid', format: 'json', volumes: true,
    ignoreFlats: true,                                    // Dukascopy pads quiet minutes with flat zero-volume candles; real MT5 charts have none
    useCache: true, cacheFolderPath: cacheDir, batchSize: 5, pauseBetweenBatchesMs: 1000,
    retryCount: 5, pauseBetweenRetriesMs: 2000, failAfterRetryCount: true,
  })
}

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }

/** Quality notes for one month — warnings are for a human to eyeball; they never alter data. */
function inspect(candles) {
  const notes = []
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1], b = candles[i]
    if (Math.abs(b.open / a.close - 1) > SPIKE || Math.abs(b.close / b.open - 1) > SPIKE) notes.push(`${new Date(b.time * 1000).toISOString()} moves more than ${SPIKE * 100}% in a minute`)
    const dow = new Date(a.time * 1000).getUTCDay()
    if (b.time - a.time > 6 * 3600 && dow >= 1 && dow <= 4) notes.push(`${new Date(a.time * 1000).toISOString()} → ${new Date(b.time * 1000).toISOString()}: ${((b.time - a.time) / 3600).toFixed(1)}h gap on a weekday`)
  }
  return notes
}

/**
 * @param fetchMonth (instrument, month) => rows [{ timestamp(ms), open, high, low, close, volume }] — injectable for tests
 */
export async function runIngest({ symbols, from, to, outDir, force = false, fetchMonth = dukascopyMonth, now = Date.now(), log = console.log }) {
  fs.mkdirSync(outDir, { recursive: true })
  const manPath = path.join(outDir, 'manifest.json')
  const man = readJson(manPath, null) || { version: 1, source: 'Dukascopy', priceType: 'bid', symbols: {} }
  const currentMonth = monthKey(now / 1000)

  const save = () => { man.generated = new Date(now).toISOString(); fs.writeFileSync(manPath, JSON.stringify(man)) }
  const refreshBounds = (entry) => {
    const keys = Object.keys(entry.months).sort()
    if (!keys.length) return
    entry.first = entry.months[keys[0]].f; entry.last = entry.months[keys[keys.length - 1]].l
  }

  for (const sym of symbols) {
    if (!SYMBOLS[sym]) throw new Error(`Unknown symbol ${sym}. Known: ${Object.keys(SYMBOLS).join(', ')}`)
    const [instrument, digits] = SYMBOLS[sym]
    const entry = man.symbols[sym] || { digits, months: {} }
    if (entry.digits !== digits) { if (Object.keys(entry.months).length) throw new Error(`${sym}: digits changed (${entry.digits} → ${digits}); delete its folder and re-ingest`); entry.digits = digits }
    const months = monthsBetween(monthStart(from), monthStart(to)).filter(m => m <= currentMonth)
    let started = Object.keys(entry.months).length > 0

    for (const m of months) {
      const file = path.join(outDir, sym, `${m}.bin.gz`)
      if (!force && entry.months[m] && fs.existsSync(file) && m !== currentMonth) { log(`${sym} ${m}  already stored — skipped`); started = true; continue }

      // a finished month that is on disk but missing from the manifest (an interrupted older run): verify it and adopt it
      if (!force && !entry.months[m] && m !== currentMonth && fs.existsSync(file)) {
        try {
          const gz = fs.readFileSync(file)
          const d = decodeMonth(gunzipSync(gz))
          if (d.monthStart === monthStart(m) && d.digits === digits && d.candles.length) {
            entry.months[m] = { n: d.candles.length, h: sha(gz), f: d.candles[0].time, l: d.candles[d.candles.length - 1].time }
            refreshBounds(entry); man.symbols[sym] = entry; save()
            started = true
            log(`${sym} ${m}  ${String(d.candles.length).padStart(6)} candles  found on disk, verified and adopted`)
            continue
          }
        } catch { /* unreadable → download it again below */ }
      }

      const rows = await fetchMonth(instrument, m)
      const lo = monthStart(m), hi = monthStart(nextMonthKey(m))
      const raw = rows.map(r => ({ time: Math.floor(r.timestamp / 1000), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume })).filter(c => c.time >= lo && c.time < hi)
      const { candles, report } = cleanCandles(raw)

      if (!candles.length) {
        if (started && m === currentMonth) { log(`${sym} ${m}  no candles yet this month (Dukascopy publishes with a delay) — skipped for now, run again later`); continue }
        if (started) throw new Error(`${sym} ${m}: Dukascopy returned no candles inside a series that already started — refusing to leave a hole. Re-run later or check the instrument.`)
        log(`${sym} ${m}  no data yet (before this instrument's history begins) — skipped`); continue
      }
      started = true
      const bad = (report.invalid + report.repaired + report.duplicates) / Math.max(1, report.input)
      if (bad > MAX_BAD_RATIO) throw new Error(`${sym} ${m}: ${(bad * 100).toFixed(2)}% of source rows were invalid/repaired/duplicated (${JSON.stringify(report)}) — not storing it.`)

      const gz = gzipSync(encodeMonth({ digits, month: m, candles }), { level: 9 })
      // read it back exactly as the browser will, and compare, before it is trusted
      const back = decodeMonth(gunzipSync(gz)).candles
      if (back.length !== candles.length || back.some((c, i) => c.time !== candles[i].time || c.open !== candles[i].open || c.high !== candles[i].high || c.low !== candles[i].low || c.close !== candles[i].close)) {
        throw new Error(`${sym} ${m}: read-back verification failed — nothing was written.`)
      }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, gz)
      entry.months[m] = { n: candles.length, h: sha(gz), f: candles[0].time, l: candles[candles.length - 1].time }
      refreshBounds(entry); man.symbols[sym] = entry; save()                 // progress is never lost to a later failure
      const notes = inspect(candles)
      log(`${sym} ${m}  ${String(candles.length).padStart(6)} candles  ${(gz.length / 1024).toFixed(0)} KB${report.repaired || report.duplicates || report.invalid ? `  (source fixes: ${report.invalid} invalid, ${report.repaired} repaired, ${report.duplicates} duplicate)` : ''}`)
      notes.slice(0, 5).forEach(n => log(`   ⚠ ${n}`))
      if (notes.length > 5) log(`   ⚠ …and ${notes.length - 5} more notes`)
    }

    const keys = Object.keys(entry.months).sort()
    if (!keys.length) { log(`${sym}: nothing stored`); continue }
    const expected = monthsBetween(monthStart(keys[0]), monthStart(keys[keys.length - 1]))
    const missing = expected.filter(k => !entry.months[k])
    if (missing.length) throw new Error(`${sym}: hole in history at ${missing.join(', ')} — re-run to fill it.`)
    refreshBounds(entry); man.symbols[sym] = entry; save()
    log(`${sym}: ${keys.length} months stored, ${keys[0]} → ${keys[keys.length - 1]}`)
  }

  save()
  const problems = verifyStore(outDir)
  if (problems.length) throw new Error(`Verification failed:\n - ${problems.join('\n - ')}`)
  log(`\nDone. ${Object.keys(man.symbols).length} symbol(s) in ${path.resolve(outDir)} — verified.`)
  return man
}

/** Re-read every file on disk and check it against the manifest. Returns a list of problems (empty = good). */
export function verifyStore(outDir) {
  const problems = []
  const man = readJson(path.join(outDir, 'manifest.json'), null)
  if (!man || man.version !== 1) return ['manifest.json missing or not a Trado manifest']
  for (const [sym, s] of Object.entries(man.symbols)) {
    const keys = Object.keys(s.months).sort()
    const expected = keys.length ? monthsBetween(monthStart(keys[0]), monthStart(keys[keys.length - 1])) : []
    expected.filter(k => !s.months[k]).forEach(k => problems.push(`${sym}: hole at ${k}`))
    let prevLast = 0
    for (const k of keys) {
      const e = s.months[k], file = path.join(outDir, sym, `${k}.bin.gz`)
      try {
        const gz = fs.readFileSync(file)
        if (sha(gz) !== e.h) throw new Error('checksum differs from manifest')
        const m = decodeMonth(gunzipSync(gz))
        if (m.monthStart !== monthStart(k)) throw new Error('wrong month inside file')
        if (m.candles.length !== e.n) throw new Error(`has ${m.candles.length} candles, manifest says ${e.n}`)
        if (m.candles[0].time !== e.f || m.candles[m.candles.length - 1].time !== e.l) throw new Error('first/last candle differ from manifest')
        if (m.candles[0].time <= prevLast) throw new Error('overlaps the previous month')
        prevLast = e.l
      } catch (err) { problems.push(`${sym} ${k}: ${err.message}`) }
    }
    if (keys.length && (s.first !== s.months[keys[0]].f || s.last !== s.months[keys[keys.length - 1]].l)) problems.push(`${sym}: first/last in manifest are stale`)
  }
  return problems
}

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { force: false, check: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--force') a.force = true
    else if (k === '--check') a.check = true
    else if (['--symbols', '--from', '--to', '--out', '--cache'].includes(k)) a[k.slice(2)] = argv[++i]
    else throw new Error(`Unknown option ${k}`)
  }
  return a
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Never call process.exit() straight away: dukascopy-node's headless browser may still be closing, and on Windows that
  // trips a libuv assertion ("UV_HANDLE_CLOSING"). Set the exit code, let handles close, and only force-exit as a last resort.
  const finish = (code) => { process.exitCode = code; setTimeout(() => process.exit(code), 4000).unref() }
  try {
    const a = parseArgs(process.argv.slice(2))
    if (!a.out) throw new Error('Missing --out <folder>')
    if (a.check) {
      const p = verifyStore(a.out)
      if (p.length) { console.error('PROBLEMS:\n - ' + p.join('\n - ')); finish(1) }
      else { console.log('Store verified: every file matches the manifest.'); finish(0) }
    } else {
      if (!a.symbols || !a.from) throw new Error('Usage: node ingest.mjs --symbols XAUUSD,EURUSD --from 2025-01 [--to 2026-10] --out <folder>')
      const cacheDir = a.cache || defaultCacheDir()
      await runIngest({
        symbols: a.symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
        from: a.from, to: a.to || monthKey(Date.now() / 1000), outDir: a.out, force: a.force,
        fetchMonth: (inst, m) => dukascopyMonth(inst, m, { cacheDir }),
      })
      finish(0)
    }
  } catch (e) { console.error(`\n✗ ${e.message}`); finish(1) }
}
