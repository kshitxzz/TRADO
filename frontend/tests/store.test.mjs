// Run (repo root):  node --test frontend/tests/aggregate.test.mjs frontend/tests/store.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { encodeMonth, decodeMonth, monthKey, monthStart, monthsBetween } from '../src/lib/backtest/storeFormat.js'
import { configureStore, coverage, loadStoreCandles, loadStoreHourly, StoreError } from '../src/lib/backtest/candleStore.js'
import { aggregate, buildTfIndex, barsAt, foldToHourly } from '../src/lib/backtest/aggregate.js'

const Z = (s) => Date.parse(s) / 1000
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

/** ~5 weekdays/week of 1m gold-like candles with 3 decimals, between two instants. */
function makeGold(fromIso, toIso, seed = 3) {
  const r = rng(seed), out = []
  let p = 4500
  for (let t = Z(fromIso); t < Z(toIso); t += 60) {
    const dow = new Date(t * 1000).getUTCDay()
    if (dow === 6 || (dow === 5 && (t % 86400) >= 79200) || (dow === 0 && (t % 86400) < 79200)) continue
    if (r() < 0.04) continue
    const o = p, c = Math.round((o + (r() - 0.5) * 1.2) * 1000) / 1000
    out.push({ time: t, open: o, high: Math.round((Math.max(o, c) + r() * 0.5) * 1000) / 1000, low: Math.round((Math.min(o, c) - r() * 0.5) * 1000) / 1000, close: c, volume: Math.round(r() * 80) / 8 })
    p = c
  }
  return out
}

/** Build a fake CDN for the candles, the way tools/data-store would publish it. */
function publish(symbol, candles, { digits = 3, skip = [], corrupt = [] } = {}) {
  const files = new Map(), months = {}
  const by = new Map()
  for (const c of candles) { const k = monthKey(c.time); (by.get(k) || by.set(k, []).get(k)).push(c) }
  for (const [k, list] of by) {
    if (skip.includes(k)) continue
    let gz = gzipSync(encodeMonth({ digits, month: k, candles: list }))
    const h = createHash('sha1').update(gz).digest('hex').slice(0, 10)
    months[k] = { n: list.length, h }
    if (corrupt.includes(k)) gz = Buffer.concat([gz.subarray(0, gz.length - 40), Buffer.alloc(40, 7)])
    files.set(`/${symbol}/${k}.bin.gz`, gz)
  }
  const keys = Object.keys(months).sort()
  const manifest = { version: 1, generated: 'test', source: 'Dukascopy', priceType: 'bid', symbols: { [symbol]: { digits, first: candles[0].time, last: candles[candles.length - 1].time, months } } }
  files.set('/manifest.json', Buffer.from(JSON.stringify(manifest)))
  let requests = 0
  const fetchFn = async (url) => {
    requests++
    const path = new URL(url, 'http://cdn.test').pathname.replace(/^\/market-data/, '')
    const body = files.get(path)
    return body ? new Response(body, { status: 200 }) : new Response('nope', { status: 404 })
  }
  return { fetchFn, manifest, keys, requests: () => requests }
}

// ── format ───────────────────────────────────────────────────────────────
test('month files round-trip exactly (prices are integers × 10^digits, nothing drifts)', () => {
  const gold = makeGold('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')
  const back = decodeMonth(encodeMonth({ digits: 3, month: '2026-01', candles: gold }))
  assert.equal(back.candles.length, gold.length)
  gold.forEach((c, i) => {
    const d = back.candles[i]
    assert.equal(d.time, c.time); assert.equal(d.open, c.open); assert.equal(d.high, c.high); assert.equal(d.low, c.low); assert.equal(d.close, c.close)
    assert.ok(Math.abs(d.volume - c.volume) < 1e-3)
  })
})

test('encoder refuses to round, reorder, or accept out-of-month / inconsistent candles', () => {
  const ok = { time: Z('2026-01-05T10:00:00Z'), open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 1 }
  assert.throws(() => encodeMonth({ digits: 3, month: '2026-01', candles: [{ ...ok, close: 1.12345 }] }), /more than 3 decimals/)
  assert.throws(() => encodeMonth({ digits: 3, month: '2026-01', candles: [ok, { ...ok, time: ok.time - 60 }] }), /ascending/)
  assert.throws(() => encodeMonth({ digits: 3, month: '2026-02', candles: [ok] }), /outside/)
  assert.throws(() => encodeMonth({ digits: 3, month: '2026-01', candles: [{ ...ok, high: 1.0 }] }), /Inconsistent/)
})

test('decoder rejects truncated, foreign and wrong-version files', () => {
  const bytes = encodeMonth({ digits: 3, month: '2026-01', candles: makeGold('2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z') })
  assert.throws(() => decodeMonth(bytes.subarray(0, bytes.length - 5)), /truncated|corrupt/)
  assert.throws(() => decodeMonth(new Uint8Array(40)), /Not a Trado/)
  const v2 = bytes.slice(); v2[4] = 9
  assert.throws(() => decodeMonth(v2), /version/)
})

test('month helpers', () => {
  assert.equal(monthKey(Z('2026-03-31T23:59:59Z')), '2026-03')
  assert.equal(monthStart('2026-02'), Z('2026-02-01T00:00:00Z'))
  assert.deepEqual(monthsBetween(Z('2025-11-20T00:00:00Z'), Z('2026-02-01T00:00:00Z')), ['2025-11', '2025-12', '2026-01', '2026-02'])
})

// ── loader ───────────────────────────────────────────────────────────────
const all = makeGold('2025-11-01T00:00:00Z', '2026-03-01T00:00:00Z')

test('loader returns exactly the stored candles for a range, across month boundaries', async () => {
  const cdn = publish('XAUUSD', all)
  configureStore({ baseUrl: '/market-data', fetchFn: cdn.fetchFn })
  const from = Z('2025-12-20T00:00:00Z'), to = Z('2026-01-10T12:00:00Z')
  const got = await loadStoreCandles('XAUUSD', from, to)
  assert.deepEqual(got, all.filter(c => c.time >= from && c.time <= to).map(c => ({ ...c, volume: got[got.findIndex(g => g.time === c.time)].volume })))
  const cov = await coverage('XAUUSD')
  assert.equal(cov.first, all[0].time); assert.equal(cov.last, all[all.length - 1].time); assert.equal(cov.source, 'Dukascopy')
})

test('hourly history + 1m window reproduce the full-data bars for every higher timeframe (no seam, no drift)', async () => {
  const cdn = publish('XAUUSD', all)
  configureStore({ baseUrl: '/market-data', fetchFn: cdn.fetchFn })
  const cut = Z('2026-01-14T00:00:00Z')                                    // window starts mid-week, mid-month
  const hist = await loadStoreHourly('XAUUSD', Z('2025-11-01T00:00:00Z'), cut)
  const window = await loadStoreCandles('XAUUSD', cut, Z('2026-02-10T00:00:00Z'))
  const full = all.filter(c => c.time <= Z('2026-02-10T00:00:00Z'))
  for (const tf of ['1h', '4h', '1d', '1w', '1M']) {
    const got = barsAt(window, buildTfIndex(window, tf, { anchor: 'ny17', hist }), window.length)
    const want = aggregate(full.filter(c => c.time >= Z('2025-11-01T00:00:00Z')), tf, 'ny17')
    assert.equal(got.length, want.length, tf)
    got.forEach((b, i) => {
      assert.equal(b.time, want[i].time, `${tf} time`); assert.equal(b.open, want[i].open, `${tf} open`)
      assert.equal(b.high, want[i].high, `${tf} high`); assert.equal(b.low, want[i].low, `${tf} low`); assert.equal(b.close, want[i].close, `${tf} close`)
    })
  }
  assert.deepEqual(hist, foldToHourly(all.filter(c => c.time < cut)).filter(b => b.time + 3600 <= cut).map(b => ({ ...b, volume: hist[hist.findIndex(h => h.time === b.time)].volume })))
})

test('a missing month is an error, never silently skipped', async () => {
  const cdn = publish('XAUUSD', all, { skip: ['2025-12'] })
  configureStore({ baseUrl: '/market-data', fetchFn: cdn.fetchFn })
  await assert.rejects(loadStoreCandles('XAUUSD', Z('2025-11-20T00:00:00Z'), Z('2026-01-20T00:00:00Z')), (e) => e instanceof StoreError && e.code === 'STORE_HOLE' && /2025-12/.test(e.message))
})

test('a corrupted file fails its integrity check and is not used', async () => {
  const cdn = publish('XAUUSD', all, { corrupt: ['2026-01'] })
  configureStore({ baseUrl: '/market-data', fetchFn: cdn.fetchFn })
  await assert.rejects(loadStoreCandles('XAUUSD', Z('2026-01-05T00:00:00Z'), Z('2026-01-06T00:00:00Z')), (e) => e instanceof StoreError)
})

test('unknown symbol, range outside coverage, and a store that is not deployed all say so plainly', async () => {
  const cdn = publish('XAUUSD', all)
  configureStore({ baseUrl: '/market-data', fetchFn: cdn.fetchFn })
  await assert.rejects(loadStoreCandles('EURUSD', Z('2026-01-05T00:00:00Z'), Z('2026-01-06T00:00:00Z')), (e) => e.code === 'NO_DATA')
  await assert.rejects(loadStoreCandles('XAUUSD', Z('2024-01-05T00:00:00Z'), Z('2024-01-06T00:00:00Z')), (e) => e.code === 'NO_DATA')
  assert.equal(await coverage('EURUSD'), null)

  configureStore({ baseUrl: '/market-data', fetchFn: async () => new Response('nope', { status: 404 }) })
  await assert.rejects(coverage('XAUUSD'), (e) => e.code === 'STORE_NOT_CONFIGURED')
  // an SPA host that answers every path with index.html must not be mistaken for a manifest
  configureStore({ baseUrl: '/market-data', fetchFn: async () => new Response('<!doctype html><html></html>', { status: 200 }) })
  await assert.rejects(coverage('XAUUSD'), (e) => e.code === 'STORE_NOT_CONFIGURED')
})
