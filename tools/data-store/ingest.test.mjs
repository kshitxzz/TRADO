// Run:  node --test tools/data-store/ingest.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runIngest, verifyStore } from './ingest.mjs'
import { configureStore, loadStoreCandles, loadStoreHourly, coverage } from '../../frontend/src/lib/backtest/candleStore.js'
import { aggregate, buildTfIndex, barsAt } from '../../frontend/src/lib/backtest/aggregate.js'

const Z = (s) => Date.parse(s) / 1000
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }
const quiet = () => {}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'trado-store-'))

/** What dukascopy-node returns (rows with ms timestamps), for gold, over [from, to). */
function dukascopyRows(fromIso, toIso, { flats = 0 } = {}) {
  const r = rng(5), out = []
  let p = 4400
  for (let t = Z(fromIso); t < Z(toIso); t += 60) {
    const dow = new Date(t * 1000).getUTCDay()
    if (dow === 6 || (dow === 5 && (t % 86400) >= 79200) || (dow === 0 && (t % 86400) < 79200)) continue
    if (r() < 0.03) continue
    const o = p, c = Math.round((o + (r() - 0.5)) * 1000) / 1000
    out.push({ timestamp: t * 1000, open: o, high: Math.round((Math.max(o, c) + r() * 0.4) * 1000) / 1000, low: Math.round((Math.min(o, c) - r() * 0.4) * 1000) / 1000, close: c, volume: 0.01 })
    p = c
  }
  return out
}
const SOURCE = dukascopyRows('2026-06-01T00:00:00Z', '2026-11-01T00:00:00Z')
const NOW = Z('2026-10-20T12:00:00Z') * 1000

const fakeFetch = (calls = [], { skipMonth } = {}) => async (instrument, month) => {
  calls.push(`${instrument}:${month}`)
  if (month === skipMonth) return []
  const lo = Z(`${month}-01T00:00:00Z`)
  // like the real API, also hand back a candle just outside the month — the tool must drop it
  return SOURCE.filter(r => r.timestamp / 1000 >= lo - 120 && r.timestamp / 1000 < lo + 32 * 86400)
}

test('ingest → verify → the browser loader reads back exactly what Dukascopy gave us', async () => {
  const out = tmp()
  const man = await runIngest({ symbols: ['XAUUSD'], from: '2026-06', to: '2026-10', outDir: out, fetchMonth: fakeFetch(), now: NOW, log: quiet })
  assert.deepEqual(verifyStore(out), [])
  const s = man.symbols.XAUUSD
  assert.deepEqual(Object.keys(s.months), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  assert.equal(s.digits, 3)

  configureStore({ baseUrl: '/market-data', fetchFn: async (url) => {
    const p = path.join(out, new URL(url, 'http://x').pathname.replace(/^\/market-data/, ''))
    return fs.existsSync(p) ? new Response(fs.readFileSync(p)) : new Response('', { status: 404 })
  } })
  const from = Z('2026-06-01T00:00:00Z'), to = Z('2026-10-31T23:59:00Z')
  const got = await loadStoreCandles('XAUUSD', from, to)
  const want = SOURCE.filter(r => r.timestamp / 1000 >= from && r.timestamp / 1000 <= to)
  assert.equal(got.length, want.length)
  want.forEach((r, i) => { assert.equal(got[i].time, r.timestamp / 1000); assert.equal(got[i].open, r.open); assert.equal(got[i].high, r.high); assert.equal(got[i].low, r.low); assert.equal(got[i].close, r.close) })

  // …and every timeframe built from it is consistent with the history seam
  const cut = Z('2026-09-16T00:00:00Z')
  const hist = await loadStoreHourly('XAUUSD', Z('2026-06-01T00:00:00Z'), cut)
  const window = await loadStoreCandles('XAUUSD', cut, to)
  for (const tf of ['1h', '4h', '1d', '1w', '1M']) {
    assert.deepEqual(barsAt(window, buildTfIndex(window, tf, { anchor: 'ny17', hist }), window.length).map(b => [b.time, b.open, b.high, b.low, b.close]),
      aggregate(got, tf, 'ny17').map(b => [b.time, b.open, b.high, b.low, b.close]), tf)
  }
  const cov = await coverage('XAUUSD')
  assert.equal(cov.first, got[0].time); assert.equal(cov.last, got[got.length - 1].time)
})

test('re-running skips finished months and refreshes only the current one', async () => {
  const out = tmp(), calls = []
  await runIngest({ symbols: ['XAUUSD'], from: '2026-08', to: '2026-10', outDir: out, fetchMonth: fakeFetch(calls), now: NOW, log: quiet })
  assert.equal(calls.length, 3)
  calls.length = 0
  await runIngest({ symbols: ['XAUUSD'], from: '2026-08', to: '2026-10', outDir: out, fetchMonth: fakeFetch(calls), now: NOW, log: quiet })
  assert.deepEqual(calls, ['xauusd:2026-10'])
})

test('a month that comes back empty inside the series aborts — no silent holes', async () => {
  const out = tmp()
  await assert.rejects(runIngest({ symbols: ['XAUUSD'], from: '2026-07', to: '2026-10', outDir: out, fetchMonth: fakeFetch([], { skipMonth: '2026-08' }), now: NOW, log: quiet }), /refusing to leave a hole/)
})

test('leading months before an instrument existed are skipped, not treated as holes', async () => {
  const out = tmp()
  const man = await runIngest({ symbols: ['XAUUSD'], from: '2026-04', to: '2026-07', outDir: out, fetchMonth: fakeFetch(), now: NOW, log: quiet })
  assert.deepEqual(Object.keys(man.symbols.XAUUSD.months), ['2026-06', '2026-07'])
})

test('a source that is mostly garbage is rejected instead of stored', async () => {
  const out = tmp()
  const bad = async () => SOURCE.filter(r => r.timestamp / 1000 >= Z('2026-07-01T00:00:00Z') && r.timestamp / 1000 < Z('2026-08-01T00:00:00Z')).map((r, i) => (i % 50 === 0 ? { ...r, close: NaN } : r))
  await assert.rejects(runIngest({ symbols: ['XAUUSD'], from: '2026-07', to: '2026-07', outDir: out, fetchMonth: bad, now: NOW, log: quiet }), /invalid\/repaired\/duplicated/)
  assert.ok(!fs.existsSync(path.join(out, 'XAUUSD', '2026-07.bin.gz')))
})

test('prices with more decimals than the symbol allows are refused, never rounded', async () => {
  const out = tmp()
  const fine = async () => SOURCE.filter(r => r.timestamp / 1000 >= Z('2026-07-01T00:00:00Z') && r.timestamp / 1000 < Z('2026-08-01T00:00:00Z')).map(r => ({ ...r, close: r.close + 0.0004, high: r.high + 0.0004 }))
  await assert.rejects(runIngest({ symbols: ['XAUUSD'], from: '2026-07', to: '2026-07', outDir: out, fetchMonth: fine, now: NOW, log: quiet }), /decimals/)
})

test('verify catches tampering, deletion and a stale manifest', async () => {
  const out = tmp()
  await runIngest({ symbols: ['XAUUSD'], from: '2026-08', to: '2026-10', outDir: out, fetchMonth: fakeFetch(), now: NOW, log: quiet })
  const f = path.join(out, 'XAUUSD', '2026-09.bin.gz')
  const orig = fs.readFileSync(f)
  const evil = Buffer.from(orig); evil[evil.length - 12] ^= 0xff
  fs.writeFileSync(f, evil)
  assert.match(verifyStore(out).join('\n'), /2026-09: checksum differs/)
  fs.rmSync(f)
  assert.match(verifyStore(out).join('\n'), /2026-09/)
  fs.writeFileSync(f, orig)
  assert.deepEqual(verifyStore(out), [])
  assert.deepEqual(verifyStore(tmp()), ['manifest.json missing or not a Trado manifest'])
})
