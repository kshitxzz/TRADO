// No network needed. The speech feed below is a trimmed copy of the real
// federalreserve.gov/feeds/speeches_and_testimony.xml (Oct 2026); the statement sentences are the
// real Sept 16 and July 29 2026 FOMC statements.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fedKindOf, parseFeed, pickSpeech, pickMonetary, parseRateUpper, etDay } from '../services/fedActuals.js'

const SPEECH_XML = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel><title>FRB: Speeches and Testimony</title>
<item><title>Waller, The Signaling Value of the Summary of Economic Projections</title>
<link><![CDATA[https://www.federalreserve.gov/newsevents/speech/waller20261008a.htm]]></link>
<description><![CDATA[Speech At the Istanbul Economic Forum, Istanbul, T&uuml;rkiye]]></description>
<category>Speech</category><pubDate><![CDATA[Thu, 8 Oct 2026 08:30:00 GMT]]></pubDate></item>
<item><title>Bowman, Modernizing the Regulatory and Supervisory Landscape</title>
<link><![CDATA[https://www.federalreserve.gov/newsevents/speech/bowman20261006a.htm]]></link>
<description><![CDATA[Speech At the 2026 Community Banking Research Conference, St. Louis, Missouri]]></description>
<category>Speech</category><pubDate><![CDATA[Tue, 6 Oct 2026 14:45:00 GMT]]></pubDate></item>
<item><title>Bowman, The Final Chapter on Modernizing Bank Regulatory Stress Testing</title>
<link><![CDATA[https://www.federalreserve.gov/newsevents/speech/bowman20260918a.htm]]></link>
<description><![CDATA[Speech At the Luncheon of the Lord Mayor City of London at Mansion House]]></description>
<category>Speech</category><pubDate><![CDATA[Fri, 18 Sep 2026 13:30:00 GMT]]></pubDate></item>
<item><title>Bowman, Initial Findings from Independent Review of Silicon Valley Bank</title>
<link><![CDATA[https://www.federalreserve.gov/newsevents/speech/bowman20260918b.htm]]></link>
<description><![CDATA[Speech At the Luncheon of the Lord Mayor City of London at Mansion House]]></description>
<category>Speech</category><pubDate><![CDATA[Fri, 18 Sep 2026 13:30:00 GMT]]></pubDate></item>
<item><title>Evil, Not the Fed</title>
<link><![CDATA[https://example.com/newsevents/speech/bowman20261006a.htm]]></link>
<pubDate><![CDATA[Tue, 6 Oct 2026 14:45:00 GMT]]></pubDate></item>
</channel></rss>`

const ev = (title, iso, extra = {}) => ({ currency: 'USD', title, time: Date.parse(iso), forecast: null, previous: null, ...extra })

test('which titles are handled', () => {
  assert.deepEqual(fedKindOf(ev('Federal Funds Rate', '2026-10-28T18:00:00Z')), { kind: 'rate' })
  assert.deepEqual(fedKindOf(ev('FOMC Statement', '2026-10-28T18:00:00Z')), { kind: 'statement' })
  assert.deepEqual(fedKindOf(ev('FOMC Meeting Minutes', '2026-10-28T18:00:00Z')), { kind: 'minutes' })
  assert.deepEqual(fedKindOf(ev('FOMC Economic Projections', '2026-10-28T18:00:00Z')), { kind: 'projections' })
  assert.deepEqual(fedKindOf(ev('FOMC Member Bowman Speaks', '2026-10-06T14:45:00Z')), { kind: 'speech', surname: 'bowman' })
  assert.deepEqual(fedKindOf(ev('Fed Chair Powell Testifies', '2026-10-06T14:45:00Z')), { kind: 'speech', surname: 'powell' })
  assert.equal(fedKindOf(ev('President Trump Speaks', '2026-10-06T14:45:00Z')), null)
  assert.equal(fedKindOf({ currency: 'EUR', title: 'Federal Funds Rate', time: 0 }), null)
})

test('feed parsing keeps only federalreserve.gov links and decodes text', () => {
  const items = parseFeed(SPEECH_XML)
  assert.equal(items.length, 4)                                    // the example.com item is dropped
  assert.equal(items[1].title, 'Bowman, Modernizing the Regulatory and Supervisory Landscape')
  assert.equal(items[1].time, Date.parse('2026-10-06T14:45:00Z'))
})

test('speech matching: surname + same US-Eastern day', () => {
  const items = parseFeed(SPEECH_XML)
  const bowman = pickSpeech(ev('FOMC Member Bowman Speaks', '2026-10-06T14:45:00Z'), 'bowman', items)
  assert.equal(bowman.link, 'https://www.federalreserve.gov/newsevents/speech/bowman20261006a.htm')
  assert.equal(pickSpeech(ev('FOMC Member Schmid Speaks', '2026-10-06T17:15:00Z'), 'schmid', items), null)    // regional president → not on the Board feed
  assert.equal(pickSpeech(ev('FOMC Member Bowman Speaks', '2026-10-07T14:45:00Z'), 'bowman', items), null)     // different day
  // two speeches the same day at the same time → deterministic pick (the "a" one)
  assert.ok(pickSpeech(ev('FOMC Member Bowman Speaks', '2026-09-18T13:30:00Z'), 'bowman', items).link.endsWith('bowman20260918a.htm'))
})

test('Eastern day is used, not UTC', () => {
  assert.equal(etDay(Date.parse('2026-10-07T02:30:00Z')), '2026-10-06')
})

test('statement / minutes / projections matching (release within 3 hours)', () => {
  const mon = parseFeed(`<rss><channel>
  <item><title>Federal Reserve issues FOMC statement</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm</link><pubDate>Wed, 16 Sep 2026 18:00:00 GMT</pubDate></item>
  <item><title>Minutes of the Federal Open Market Committee, July 28-29, 2026</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260819a.htm</link><pubDate>Wed, 19 Aug 2026 18:00:00 GMT</pubDate></item>
  <item><title>Minutes of the Board's discount rate meetings on June 8 and June 17, 2026</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260709a.htm</link><pubDate>Thu, 9 Jul 2026 18:00:00 GMT</pubDate></item>
  <item><title>Federal Reserve Board and Federal Open Market Committee release economic projections from the September 15-16 FOMC meeting</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916b.htm</link><pubDate>Wed, 16 Sep 2026 18:00:00 GMT</pubDate></item>
  </channel></rss>`)
  assert.ok(pickMonetary(ev('FOMC Statement', '2026-09-16T18:00:00Z'), 'statement', mon).link.endsWith('monetary20260916a.htm'))
  assert.ok(pickMonetary(ev('Federal Funds Rate', '2026-09-16T18:00:00Z'), 'rate', mon).link.endsWith('monetary20260916a.htm'))
  assert.ok(pickMonetary(ev('FOMC Meeting Minutes', '2026-08-19T18:00:00Z'), 'minutes', mon).link.endsWith('monetary20260819a.htm'))
  assert.equal(pickMonetary(ev('FOMC Meeting Minutes', '2026-07-09T18:00:00Z'), 'minutes', mon), null)       // discount-rate minutes are not FOMC minutes
  assert.ok(pickMonetary(ev('FOMC Economic Projections', '2026-09-16T18:00:00Z'), 'projections', mon).link.endsWith('monetary20260916b.htm'))
  assert.equal(pickMonetary(ev('FOMC Statement', '2026-09-17T18:00:00Z'), 'statement', mon), null)             // a day off
})

test('rate (upper bound of the target range) from real FOMC statements', () => {
  const sep = `The Committee decided to raise the target range for the federal funds rate by\n\n1/4 percentage point to 3-3/4 to 4 percent, in support of the Federal Reserve’s dual mandate.`
  const jul = `The Committee decided to maintain the target range for the federal funds rate at 3-1/2 to\n\n3-3/4 percent, in support of the Federal Reserve’s dual mandate.`
  assert.equal(parseRateUpper(sep), 4)
  assert.equal(parseRateUpper(jul), 3.75)
  assert.equal(parseRateUpper('decided to lower the target range for the federal funds rate by 1/4 percentage point to 4 to 4-1/4 percent.'), 4.25)
  assert.equal(parseRateUpper('maintain the target range for the federal funds rate at 4.25 to 4.50 percent'), 4.5)
  assert.equal(parseRateUpper('maintain the target range for the federal funds rate at 3½ to 3¾ percent'), 3.75)
  assert.equal(parseRateUpper('maintain the target range for the federal funds rate at 0 to 1/4 percent'), 0.25)
})

test('rate parser refuses anything doubtful', () => {
  assert.equal(parseRateUpper('Inflation remains elevated.'), null)
  assert.equal(parseRateUpper('the target range for the federal funds rate was discussed'), null)
  assert.equal(parseRateUpper('maintain the target range for the federal funds rate at 1 to 9 percent'), null)    // 8 points wide: not a policy range
  assert.equal(parseRateUpper('maintain the target range for the federal funds rate at 4 to 3 percent'), null)    // inverted
})
