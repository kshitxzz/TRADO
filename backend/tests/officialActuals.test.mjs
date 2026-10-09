// Run with:  npm test   (from /backend)  — no network needed, every API is stubbed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, specFor, SPECS, __test } from '../services/officialActuals.js'

const T = (iso) => Date.parse(iso)
const ev = (title, iso, forecast, previous, currency = 'USD') => ({ currency, title, time: T(iso), forecast, previous })
const spec = (title) => specFor({ currency: 'USD', title })
const rows = (obj) => Object.entries(obj).map(([k, v]) => ({ k, v }))

test('every mapping has a unique title and at least one source', () => {
  const names = SPECS.map(s => s.name)
  assert.equal(new Set(names).size, names.length)
  for (const s of SPECS) { assert.ok(s.src.length >= 1, s.name); assert.ok(s.re.test(s.name), `${s.name} must match its own regex`) }
})

test('only exact USD titles are mapped', () => {
  assert.ok(spec('Non-Farm Employment Change'))
  assert.equal(spec('ADP Non-Farm Employment Change'), null)
  assert.equal(spec('ISM Services PMI'), null)
  assert.equal(specFor({ currency: 'EUR', title: 'Unemployment Rate' }), null)
})

test('expected reference periods', () => {
  const { expectedPeriod } = __test
  assert.equal(expectedPeriod('M1', T('2026-10-02T12:30:00Z')), '2026-09')
  assert.equal(expectedPeriod('M1', T('2026-01-13T13:30:00Z')), '2025-12')
  assert.equal(expectedPeriod('M2', T('2026-10-06T12:30:00Z')), '2026-08')
  assert.equal(expectedPeriod('Q1', T('2026-01-29T13:30:00Z')), '2025-10')
  assert.equal(expectedPeriod('Q1', T('2026-04-29T12:30:00Z')), '2026-01')
  assert.equal(expectedPeriod('SAT', T('2026-10-08T12:30:00Z')), '2026-10-03')   // Thursday claims → Saturday before
  assert.equal(expectedPeriod('SAT', T('2026-11-25T13:30:00Z')), '2026-11-21')   // Thanksgiving week (Wednesday release)
  assert.equal(expectedPeriod('FRI', T('2026-10-07T14:30:00Z')), '2026-10-02')   // Wednesday crude → Friday before
  assert.equal(expectedPeriod('FRI', T('2026-11-27T15:30:00Z')), '2026-11-20')   // Friday release → previous Friday
})

test('payrolls: change in employment level, shown like FF ("150K")', () => {
  const s = spec('Non-Farm Employment Change')
  const e = ev('Non-Farm Employment Change', '2026-10-02T12:30:00Z', '150K', '22K')
  assert.equal(evaluate(s, e, rows({ '2026-09': 159500, '2026-08': 159350, '2026-07': 159328 })), '150K')
  // agency has not published September yet → must stay blank, never show August's number
  assert.equal(evaluate(s, e, rows({ '2026-08': 159350, '2026-07': 159328 })), null)
})

test('unemployment rate: previous must reproduce FF previous', () => {
  const s = spec('Unemployment Rate')
  const good = ev('Unemployment Rate', '2026-10-02T12:30:00Z', '4.3%', '4.3%')
  const data = rows({ '2026-09': 4.4, '2026-08': 4.3 })
  assert.equal(evaluate(s, good, data), '4.4%')
  const mismatch = ev('Unemployment Rate', '2026-10-02T12:30:00Z', '4.3%', '4.2%')
  assert.equal(evaluate(s, mismatch, data), null)
})

test('CPI m/m from index levels, and y/y with half-away-from-zero rounding', () => {
  const mm = spec('CPI m/m')
  const e1 = ev('CPI m/m', '2026-10-14T12:30:00Z', '0.3%', '0.2%')
  assert.equal(evaluate(mm, e1, rows({ '2026-09': 330.123, '2026-08': 329.1, '2026-07': 328.4 })), '0.3%')
  const yy = spec('CPI y/y')
  const e2 = ev('CPI y/y', '2026-10-14T12:30:00Z', '2.4%', '2.3%')
  const idx = rows({ '2026-09': 102.45, '2025-09': 100, '2026-08': 102.3, '2025-08': 100 })
  assert.equal(evaluate(yy, e2, idx), '2.5%')
})

test('a gap in the series (BLS "-" value is dropped) leaves the actual blank', () => {
  const s = spec('CPI m/m')
  const e = ev('CPI m/m', '2026-10-14T12:30:00Z', '0.3%', '0.2%')
  assert.equal(evaluate(s, e, rows({ '2026-09': 330.1, '2026-07': 328.4 })), null)
})

test('weekly claims: only the week ending the Saturday before the release counts', () => {
  const s = spec('Unemployment Claims')
  const e = ev('Unemployment Claims', '2026-10-08T12:30:00Z', '225K', '222K')
  assert.equal(evaluate(s, e, rows({ '2026-10-03': 219000, '2026-09-26': 222000 })), '219K')
  assert.equal(evaluate(s, e, rows({ '2026-09-26': 222000, '2026-09-19': 224000 })), null)   // last week's number is stale
})

test('crude inventories: weekly change in millions of barrels, previous cross-checked', () => {
  const s = spec('Crude Oil Inventories')
  const e = ev('Crude Oil Inventories', '2026-10-07T14:30:00Z', '-1.0M', '3.7M')
  const data = rows({ '2026-10-02': 420000, '2026-09-25': 422314, '2026-09-18': 418600 })
  assert.equal(evaluate(s, e, data), '-2.3M')
  const wrongPrev = ev('Crude Oil Inventories', '2026-10-07T14:30:00Z', '-1.0M', '9.9M')
  assert.equal(evaluate(s, wrongPrev, data), null)
})

test('a tiny negative change never prints "-0.0M"', () => {
  const s = spec('Crude Oil Inventories')
  const e = ev('Crude Oil Inventories', '2026-10-07T14:30:00Z', '-1.0M', '3.7M')
  const data = rows({ '2026-10-02': 420000, '2026-09-25': 420020, '2026-09-18': 416306 })
  assert.equal(evaluate(s, e, data), '0.0M')
})

test('natural gas storage in Bcf → "84B"', () => {
  const s = spec('Natural Gas Storage')
  const e = ev('Natural Gas Storage', '2026-10-08T14:30:00Z', '85B', '90B')
  assert.equal(evaluate(s, e, rows({ '2026-10-02': 3584, '2026-09-25': 3500, '2026-09-18': 3410 })), '84B')
})

test('trade balance: FRED millions → FF style billions', () => {
  const s = spec('Trade Balance')
  const e = ev('Trade Balance', '2026-10-06T12:30:00Z', '-100.8B', '-88.6B')
  assert.equal(evaluate(s, e, rows({ '2026-08-01': -78300, '2026-07-01': -88600 })), '-78.3B')
})

test('loose check rejects a wrong-scale series (GDP returning an index level)', () => {
  const s = spec('Advance GDP q/q')
  const e = ev('Advance GDP q/q', '2026-10-29T12:30:00Z', '2.0%', '3.3%')
  assert.equal(evaluate(s, e, rows({ '2026-07-01': 300 })), null)
  assert.equal(evaluate(s, e, rows({ '2026-07-01': 2.1 })), '2.1%')
})

test('format mismatch with FF (no % sign where one is expected) stays blank', () => {
  const s = spec('Unemployment Rate')
  const e = ev('Unemployment Rate', '2026-10-02T12:30:00Z', '4.3', '4.3')
  assert.equal(evaluate(s, e, rows({ '2026-09': 4.4, '2026-08': 4.3 })), null)
})
