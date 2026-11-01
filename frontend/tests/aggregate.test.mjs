// Run (repo root):  node --test frontend/tests/aggregate.test.mjs frontend/tests/store.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  nyOffsetSecs, fxDayStart, bucketStart, aggregate, foldToHourly, buildTfIndex, barsAt, partialBar,
  candlesToNextBar, histFeeds, cleanCandles, parseTf, baseFor,
} from '../src/lib/backtest/aggregate.js'

const Z = (s) => Date.parse(s) / 1000
const iso = (t) => new Date(t * 1000).toISOString().replace('.000Z', 'Z')

// ── deterministic PRNG so failures are reproducible ──────────────────────
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

/** Synthetic FX-like 1m series: closed Fri 22:00Z→Sun 22:00Z (winter) / 21:00Z (summer) like real FX; ~3% of minutes missing. */
function makeM1(startIso, days, seed = 1) {
  const r = rng(seed), out = []
  let price = 1.1
  const start = Z(startIso)
  for (let t = start; t < start + days * 86400; t += 60) {
    const off = nyOffsetSecs(t)
    const local = t + off                                             // New York wall clock
    const dow = new Date(local * 1000).getUTCDay(), hr = ((local % 86400) + 86400) % 86400 / 3600
    const closed = (dow === 5 && hr >= 17) || dow === 6 || (dow === 0 && hr < 17)
    if (closed || r() < 0.03) continue
    const o = price, c = o + (r() - 0.5) * 0.001
    out.push({ time: t, open: o, high: Math.max(o, c) + r() * 0.0004, low: Math.min(o, c) - r() * 0.0004, close: c, volume: Math.round(r() * 50) })
    price = c
  }
  return out
}

// ── New York DST ─────────────────────────────────────────────────────────
test('NY offset flips exactly at 02:00 local on the right Sundays (2007+ and pre-2007 rules)', () => {
  assert.equal(nyOffsetSecs(Z('2026-03-08T06:59:59Z')), -5 * 3600)
  assert.equal(nyOffsetSecs(Z('2026-03-08T07:00:00Z')), -4 * 3600)     // 2nd Sunday of March 2026
  assert.equal(nyOffsetSecs(Z('2026-11-01T05:59:59Z')), -4 * 3600)
  assert.equal(nyOffsetSecs(Z('2026-11-01T06:00:00Z')), -5 * 3600)     // 1st Sunday of November 2026
  assert.equal(nyOffsetSecs(Z('2025-03-09T07:00:00Z')), -4 * 3600)
  assert.equal(nyOffsetSecs(Z('2025-11-02T06:00:00Z')), -5 * 3600)
  assert.equal(nyOffsetSecs(Z('2006-04-02T07:00:00Z')), -4 * 3600)     // old rule: 1st Sunday of April
  assert.equal(nyOffsetSecs(Z('2006-10-29T06:00:00Z')), -5 * 3600)     // old rule: last Sunday of October
  assert.equal(nyOffsetSecs(Z('2006-03-15T12:00:00Z')), -5 * 3600)     // inside the new-rule window but before the old one
})

// ── Known answers: what an MT5 (GMT+2/+3, NY-close) chart shows ──────────
test('trading day starts 17:00 New York (22:00Z winter, 21:00Z summer)', () => {
  assert.equal(iso(fxDayStart(Z('2026-01-12T10:00:00Z'))), '2026-01-11T22:00:00Z')
  assert.equal(iso(fxDayStart(Z('2026-07-13T10:00:00Z'))), '2026-07-12T21:00:00Z')
  assert.equal(iso(fxDayStart(Z('2026-01-11T22:00:00Z'))), '2026-01-11T22:00:00Z')   // the boundary itself opens the new day
  assert.equal(iso(fxDayStart(Z('2026-01-11T21:59:59Z'))), '2026-01-10T22:00:00Z')
  assert.equal(iso(fxDayStart(Z('2026-03-09T10:00:00Z'))), '2026-03-08T21:00:00Z')   // Monday after the spring switch
})

test('4h bars sit on 00/04/08/12/16/20 broker-server time (NY-close servers)', () => {
  assert.equal(iso(bucketStart(Z('2026-01-12T10:30:00Z'), '4h', 'ny17')), '2026-01-12T10:00:00Z')   // GMT+2 server: 12:00 bar
  assert.equal(iso(bucketStart(Z('2026-01-11T22:00:00Z'), '4h', 'ny17')), '2026-01-11T22:00:00Z')   // Sunday open = first bar of Monday
  assert.equal(iso(bucketStart(Z('2026-07-13T10:30:00Z'), '4h', 'ny17')), '2026-07-13T09:00:00Z')   // GMT+3 server: 12:00 bar
})

test('daily, weekly and monthly bars follow the NY trading week', () => {
  // Sunday-evening open belongs to the Monday daily bar
  assert.equal(iso(bucketStart(Z('2026-01-11T22:00:00Z'), '1d', 'ny17')), '2026-01-11T22:00:00Z')
  assert.equal(iso(bucketStart(Z('2026-01-12T15:00:00Z'), '1d', 'ny17')), '2026-01-11T22:00:00Z')
  // the whole Mon–Fri week is one weekly bar, opening Sunday 17:00 NY
  for (const t of ['2026-01-11T22:00:00Z', '2026-01-14T12:00:00Z', '2026-01-16T21:59:00Z']) assert.equal(iso(bucketStart(Z(t), '1w', 'ny17')), '2026-01-11T22:00:00Z')
  assert.equal(iso(bucketStart(Z('2026-01-18T22:00:00Z'), '1w', 'ny17')), '2026-01-18T22:00:00Z')    // next Sunday open → next week
  assert.equal(iso(bucketStart(Z('2026-07-15T12:00:00Z'), '1w', 'ny17')), '2026-07-12T21:00:00Z')
  // a week that contains the March DST switch
  assert.equal(iso(bucketStart(Z('2026-03-10T12:00:00Z'), '1w', 'ny17')), '2026-03-08T21:00:00Z')
  // month: the first trading day is the one ending on the 1st
  assert.equal(iso(bucketStart(Z('2026-02-10T12:00:00Z'), '1M', 'ny17')), '2026-01-31T22:00:00Z')
})

test('crypto (utc anchor): midnight UTC days, Monday UTC weeks', () => {
  assert.equal(iso(bucketStart(Z('2026-01-12T23:59:00Z'), '1d', 'utc')), '2026-01-12T00:00:00Z')
  assert.equal(iso(bucketStart(Z('2026-01-14T09:00:00Z'), '1w', 'utc')), '2026-01-12T00:00:00Z')
  assert.equal(iso(bucketStart(Z('2026-02-10T09:00:00Z'), '1M', 'utc')), '2026-02-01T00:00:00Z')
  assert.equal(iso(bucketStart(Z('2026-01-12T10:07:00Z'), '15m', 'utc')), '2026-01-12T10:00:00Z')
})

// ── Properties over realistic data ───────────────────────────────────────
const TFS = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '2d', '1w', '1M']
const ranges = [['2026-02-20T00:00:00Z', 40], ['2026-10-10T00:00:00Z', 40]]      // spans the March and the November DST switches

for (const [startIso, days] of ranges) {
  for (const anchor of ['ny17', 'utc']) {
    test(`timeframes nest exactly (${anchor}, from ${startIso.slice(0, 10)}): a finer bar never straddles a coarser one`, () => {
      const m1 = makeM1(startIso, days)
      const pairs = [['1m', '5m'], ['5m', '15m'], ['15m', '1h'], ['1h', '4h'], ['4h', '1d'], ['1h', '1d'], ['1d', '1w'], ['1h', '1w'], ['1h', '1M'], ['1d', '1M'], ['30m', '2h'], ['1h', '12h']]
      for (const c of m1) for (const [a, b] of pairs) {
        assert.equal(bucketStart(bucketStart(c.time, a, anchor), b, anchor), bucketStart(c.time, b, anchor), `${a}→${b} at ${iso(c.time)}`)
      }
    })

    test(`aggregation is exact (${anchor}, from ${startIso.slice(0, 10)}): OHLCV of every bar equals its own minutes`, () => {
      const m1 = makeM1(startIso, days)
      for (const tf of TFS) {
        const bars = aggregate(m1, tf, anchor)
        const by = new Map()
        for (const c of m1) { const k = bucketStart(c.time, tf, anchor); (by.get(k) || by.set(k, []).get(k)).push(c) }
        assert.equal(bars.length, by.size, tf)
        for (const b of bars) {
          const g = by.get(b.time)
          assert.equal(b.open, g[0].open); assert.equal(b.close, g[g.length - 1].close)
          assert.equal(b.high, Math.max(...g.map(x => x.high))); assert.equal(b.low, Math.min(...g.map(x => x.low)))
          assert.equal(b.volume, g.reduce((s, x) => s + x.volume, 0))
        }
        for (let i = 1; i < bars.length; i++) assert.ok(bars[i].time > bars[i - 1].time, `${tf} ascending`)
      }
    })

    test(`replay has no look-ahead (${anchor}, from ${startIso.slice(0, 10)}): bars at any moment equal bars built from only the past`, () => {
      const m1 = makeM1(startIso, days)
      const r = rng(7)
      for (const tf of ['5m', '15m', '1h', '4h', '1d', '1w', '1M']) {
        const idx = buildTfIndex(m1, tf, { anchor })
        for (let k = 0; k < 40; k++) {
          const count = 1 + Math.floor(r() * m1.length)
          assert.deepEqual(barsAt(m1, idx, count), aggregate(m1.slice(0, count), tf, anchor), `${tf} @ ${count}`)
        }
        assert.deepEqual(barsAt(m1, idx, m1.length), aggregate(m1, tf, anchor))
      }
    })

    test(`hourly history stitches in seamlessly (${anchor}, from ${startIso.slice(0, 10)}): history + window = one continuous series`, () => {
      const m1 = makeM1(startIso, days)
      const r = rng(11)
      for (let trial = 0; trial < 12; trial++) {
        // split on an hour boundary at a random point — often mid-day, mid-week and mid-month
        const cut = Math.floor((m1[Math.floor(r() * m1.length)].time) / 3600) * 3600
        const past = m1.filter(c => c.time < cut), window = m1.filter(c => c.time >= cut)
        if (!past.length || !window.length) continue
        const hist = foldToHourly(past)
        for (const tf of TFS) {
          const idx = buildTfIndex(window, tf, { anchor, hist })
          const got = barsAt(window, idx, window.length)
          if (!histFeeds(tf)) {
            assert.deepEqual(got, aggregate(window, tf, anchor), `${tf}: minute charts start with the 1m candles — nothing coarse is faked in`)
          } else {
            assert.deepEqual(got, aggregate(m1, tf, anchor), `${tf} cut at ${iso(cut)}`)
          }
        }
      }
    })

    test(`the forming bar is correct when the window starts mid-bar (${anchor}, from ${startIso.slice(0, 10)})`, () => {
      const m1 = makeM1(startIso, days)
      const cut = Math.floor(m1[Math.floor(m1.length / 2)].time / 3600) * 3600
      const past = m1.filter(c => c.time < cut), window = m1.filter(c => c.time >= cut)
      const hist = foldToHourly(past)
      for (const tf of ['1h', '4h', '1d', '1w', '1M']) {
        const idx = buildTfIndex(window, tf, { anchor, hist })
        for (let count = 1; count <= Math.min(window.length, 400); count += 7) {
          const bars = barsAt(window, idx, count)
          const want = aggregate(m1.filter(c => c.time < window[count - 1].time + 1), tf, anchor)
          assert.deepEqual(bars[bars.length - 1], want[want.length - 1], `${tf} @ ${count}`)
          const last = partialBar(window, idx, idx.bucketOf[count - 1], count - 1)
          assert.deepEqual(last, want[want.length - 1], `${tf} partialBar @ ${count}`)
        }
      }
    })
  }
}

test('4h/daily bars never start at an hour that is not a New York 17:00-aligned slot, across both DST switches', () => {
  for (const [s, d] of ranges) {
    const m1 = makeM1(s, d)
    for (const b of aggregate(m1, '4h', 'ny17')) {
      const wall = ((b.time + nyOffsetSecs(b.time)) % 86400 + 86400) % 86400 / 3600
      assert.ok([17, 21, 1, 5, 9, 13].includes(wall), `4h bar at ${iso(b.time)} has NY wall hour ${wall}`)
    }
    for (const b of aggregate(m1, '1d', 'ny17')) {
      const wall = ((b.time + nyOffsetSecs(b.time)) % 86400 + 86400) % 86400 / 3600
      assert.equal(wall, 17, `daily bar at ${iso(b.time)}`)
    }
  }
})

test('stepping to the next bar lands exactly on a bar boundary', () => {
  const m1 = makeM1('2026-03-02T00:00:00Z', 10)
  for (const tf of ['5m', '1h', '4h', '1d']) {
    const idx = buildTfIndex(m1, tf, { anchor: 'ny17' })
    let count = 40
    for (let i = 0; i < 30; i++) {
      const n = candlesToNextBar(idx, count, m1.length)
      assert.ok(n >= 1)
      count += n
      if (count >= m1.length) break
      assert.notEqual(idx.bucketOf[count - 1], idx.bucketOf[count], `${tf}: step ends on a bar close`)
    }
  }
})

// ── Integrity ────────────────────────────────────────────────────────────
test('cleanCandles drops garbage, widens inconsistent high/low, removes duplicates and invents nothing', () => {
  const raw = [
    { time: 120, open: 1, high: 1.2, low: 0.9, close: 1.1, volume: 3 },
    { time: 60, open: 1, high: 1.1, low: 0.95, close: 1.05, volume: 1 },        // out of order
    { time: 60, open: 9, high: 9, low: 9, close: 9, volume: 9 },                // duplicate time → first kept
    { time: 180, open: 1, high: 0.99, low: 1.0, close: 1.0, volume: 1 },        // high below open → widened
    { time: 240, open: NaN, high: 1, low: 1, close: 1 },                        // invalid
    { time: 300, open: 0, high: 1, low: 0, close: 1 },                          // non-positive price
    { time: 3600, open: 1, high: 1, low: 1, close: 1 },                         // real gap stays a gap
  ]
  const { candles, report } = cleanCandles(raw)
  assert.deepEqual(candles.map(c => c.time), [60, 120, 180, 3600])
  assert.equal(candles[0].open, 1)                                              // the first of the duplicates survives
  assert.equal(candles[2].high, 1); assert.equal(candles[2].low, 1)                // inverted high/low → widened only as far as open/close
  assert.equal(report.invalid, 2); assert.equal(report.repaired, 1); assert.equal(report.duplicates, 1); assert.equal(report.outOfOrder, 1)
  assert.equal(report.largestGapSecs, 3600 - 180)
  assert.equal(candles.length, 4)                                               // no synthetic candles were added to fill the gap
})

test('every timeframe the menu can produce is buildable from the 1m base; garbage is not', () => {
  for (const k of ['1m', '7m', '90m', '4h', '1d', '3d', '1w', '1M', '999m']) assert.equal(baseFor(k), '1m', k)
  for (const k of ['0m', '5x', '', null, 'h4', '-5m']) assert.equal(baseFor(k), null, String(k))
  assert.equal(parseTf('45m').secs, 2700)
})
