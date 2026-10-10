import test from 'node:test'
import assert from 'node:assert/strict'
import { auctionSpecFor, termMonths, normalizeRows, evaluateAuction } from '../services/treasuryAuctions.js'

const ev = (title, iso, previous) => ({ currency: 'USD', title, time: Date.parse(iso), forecast: null, previous })
const rec = (auctionDate, securityType, securityTerm, highYield, bidToCoverRatio) => ({ auctionDate: `${auctionDate}T00:00:00`, securityType, securityTerm, highYield, bidToCoverRatio })

test('title → tenor and security type (FF calls the 10-year a "Bond")', () => {
  assert.deepEqual(auctionSpecFor(ev('10-y Bond Auction', '2026-10-08T17:01:00Z')), { years: 10, type: 'Note' })
  assert.deepEqual(auctionSpecFor(ev('30-y Bond Auction', '2026-10-08T17:01:00Z')), { years: 30, type: 'Bond' })
  assert.deepEqual(auctionSpecFor(ev('3-y Note Auction', '2026-10-08T17:01:00Z')), { years: 3, type: 'Note' })
  assert.equal(auctionSpecFor(ev('13-w Bill Auction', '2026-10-08T17:01:00Z')), null)
  assert.equal(auctionSpecFor(ev('10-y TIPS Auction', '2026-10-08T17:01:00Z')), null)
})

test('term parsing handles reopenings', () => {
  assert.equal(termMonths('10-Year'), 120)
  assert.equal(termMonths('9-Year 11-Month'), 119)
  assert.equal(termMonths('13-Week'), null)
})

test('result is "yield|bid-to-cover" and the previous auction must reproduce FF previous', () => {
  const rows = normalizeRows([
    rec('2026-10-07', 'Note', '9-Year 11-Month', '4.276', '2.58'),    // the auction being reported (a reopening)
    rec('2026-09-09', 'Note', '10-Year', '4.83', '2.65'),             // previous 10-year auction
    rec('2026-10-07', 'Note', '3-Year', '3.9', '2.9'),                // other tenor, same day
    rec('2026-10-07', 'Bond', '29-Year 11-Month', '4.9', '2.4'),      // other type
  ])
  const e = ev('10-y Bond Auction', '2026-10-07T17:01:00Z', '4.83|2.7')
  assert.equal(evaluateAuction(e, { years: 10, type: 'Note' }, rows), '4.28|2.6')
  // FF's previous disagrees with Treasury's previous auction → blank
  assert.equal(evaluateAuction(ev('10-y Bond Auction', '2026-10-07T17:01:00Z', '4.50|2.7'), { years: 10, type: 'Note' }, rows), null)
  // the auction has not been published yet
  assert.equal(evaluateAuction(e, { years: 10, type: 'Note' }, rows.filter(r => r.date !== '2026-10-07' || r.months !== 119)), null)
})

test('rows with missing or non-numeric values are ignored', () => {
  assert.equal(normalizeRows([rec('2026-10-07', 'Note', '10-Year', '', '2.5'), rec('2026-10-07', 'Note', '10-Year', '4.2', 'n/a')]).length, 0)
})
