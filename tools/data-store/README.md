# Trado market-data store

Backtesting reads **1-minute BID candles** from an immutable store instead of a live feed.
Every other timeframe (5m, 15m, 1h, 4h, daily…) is built from those minutes inside the app.

Why a store: the same bytes every time (a backtest never changes between sessions), no rate limits,
no geo-blocks, and nothing is approximated. If a month is missing, the app says so instead of drawing guesses.

- Source: **Dukascopy** historical data (the same vendor TradersCasa names as its source).
- Covers: all forex pairs, XAUUSD, XAGUSD, WTIUSD, BRENTUSD, NATGAS in the Trado symbol catalog. Crypto still uses Binance spot live.
- Size: about **0.4 MB per symbol-month** (a symbol for 2 years ≈ 9 MB).

## One-time setup (Windows PowerShell)

Dukascopy protects its free feed with an AWS WAF challenge, so the downloader needs Chromium once.

```powershell
cd tools\data-store
npm install
npx dukascopy-node --install-browser
```

## Ingest data

```powershell
# a starter set, into the site's static folder
node ingest.mjs --symbols XAUUSD,EURUSD,GBPUSD,USDJPY --from 2024-01 --out ..\..\frontend\public\market-data

# check that everything on disk matches the manifest (also runs automatically at the end of an ingest)
node ingest.mjs --check --out ..\..\frontend\public\market-data
```

- Re-running is safe: finished months are skipped; the current month is refreshed. Run it monthly to keep data current.
- Each month is validated, written, then read back and compared before it joins the manifest.
- Any hole in a symbol's history stops the run. A month with more than 0.1 % bad source rows is rejected.
- Warnings (`⚠`) list suspicious minutes (a 5 %+ move, a 6 h+ weekday gap) for you to eyeball. They never change data.
- `--force` re-downloads everything; `--cache` sets dukascopy-node's download cache (default `.\.cache`).

Then commit and push `frontend/public/market-data` — Cloudflare serves it. `frontend/public/_headers` makes month files cache forever
(their URL carries a content hash) and the manifest revalidate every time.

## When it grows: Cloudflare R2 instead of git

Past a handful of symbols the folder gets too big for git. Move it to R2 (free tier: 10 GB, no egress fees):

1. Create an R2 bucket, make it public (custom domain recommended), and add a CORS rule allowing `GET` from your site's origin.
2. Upload the output folder (for example with `rclone sync`), setting `Cache-Control: public, max-age=31536000, immutable`
   on `*/*.bin.gz` and `Cache-Control: no-cache` on `manifest.json`.
3. In Cloudflare Pages, set the **build variable** `VITE_TRADO_DATA_URL` to the bucket's public URL (no trailing slash),
   then push so a fresh build runs. Build variables are compile-time for Vite.

## What the candles are

- **Bid** prices (what an MT5 chart draws). Spread is applied by the backtest engine, as before.
- Quiet minutes with no quotes have **no candle**, exactly like MT5. Dukascopy's flat zero-volume padding candles are dropped.
- Weekends and holidays are real gaps.
- 4h, daily, weekly and monthly candles start at the **17:00 New York** trading-day change (DST-aware), matching MT5 brokers on NY-close servers and TradingView forex.
  Crypto uses 00:00 UTC.

## File format

`<SYMBOL>/<YYYY-MM>.bin.gz?v=<hash>` — gzip of a 16-byte header + 24-byte records (time offset, open, high, low, close as integers × 10^digits, volume).
Defined once in `frontend/src/lib/backtest/storeFormat.js`, used by both this tool and the browser.

## Tests

```powershell
node --test ingest.test.mjs                      # from tools\data-store
node --test frontend/tests/aggregate.test.mjs frontend/tests/store.test.mjs   # from the repo root
```
