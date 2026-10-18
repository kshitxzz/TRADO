// ─────────────────────────────────────────────────────────────────────────
// Backtesting — instrument specs (pure, no React).
//
// 1 lot = `contract` units of the base asset. P&L is returned in USD.
// Conversion for pairs that do not quote in USD uses fixed approximate rates
// (the same ones the Position Size Calculator uses) — exact for XXXUSD pairs,
// crypto and metals; approximate for crosses.
// ─────────────────────────────────────────────────────────────────────────

import { normaliseSymbol } from '../binanceDirect'

// quote currency → USD per 1 unit (approximate; derived from the calculator's pip values)
const QUOTE_TO_USD = { USD: 1, JPY: 0.0067, CHF: 1.13, CAD: 0.735, GBP: 1.27, AUD: 0.66, NZD: 0.6, EUR: 1.08 }
// base currency → USD per 1 unit (approximate, for margin on crosses)
const BASE_TO_USD  = { EUR: 1.08, GBP: 1.27, AUD: 0.66, NZD: 0.6, USD: 1, CAD: 0.735, CHF: 1.13, JPY: 0.0067 }

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'AVAX', 'DOT', 'LINK', 'MATIC', 'TRX',
  'SHIB', 'BCH', 'ATOM', 'UNI', 'XLM', 'ETC', 'NEAR', 'APT', 'ARB', 'OP', 'FIL', 'INJ', 'SUI', 'PEPE', 'TON',
])

/**
 * @returns {{ kind:'forex'|'metal'|'energy'|'crypto'|'other', contract:number, pipSize:number,
 *             digits:number, base:string, quote:string, minLot:number, lotStep:number }}
 */
export function getSpec(rawSymbol = '') {
  const s = normaliseSymbol(rawSymbol)

  if (s.startsWith('XAU') || s === 'GOLD')   return { kind: 'metal',  contract: 100,    pipSize: 0.1,   digits: 2, base: 'XAU', quote: 'USD', minLot: 0.01, lotStep: 0.01 }
  if (s.startsWith('XAG') || s === 'SILVER') return { kind: 'metal',  contract: 5000,   pipSize: 0.01,  digits: 3, base: 'XAG', quote: 'USD', minLot: 0.01, lotStep: 0.01 }
  if (/WTI|USOIL|XTI|CLUSDT|BRENT|UKOIL|XBR|BZUSDT/.test(s))
                                             return { kind: 'energy', contract: 1000,   pipSize: 0.01,  digits: 2, base: 'OIL', quote: 'USD', minLot: 0.01, lotStep: 0.01 }
  if (/NATGAS|NGAS|XNG/.test(s))             return { kind: 'energy', contract: 10000,  pipSize: 0.001, digits: 3, base: 'GAS', quote: 'USD', minLot: 0.01, lotStep: 0.01 }

  const c = /^([A-Z0-9]{2,6}?)(USDT|USD)$/.exec(s)
  if (c && CRYPTO_BASES.has(c[1])) {
    return { kind: 'crypto', contract: 1, pipSize: 1, digits: c[1] === 'BTC' || c[1] === 'ETH' || c[1] === 'BNB' ? 2 : 4, base: c[1], quote: 'USD', minLot: 0.01, lotStep: 0.01 }
  }

  if (/^[A-Z]{6}$/.test(s)) {
    const quote = s.slice(3)
    const jpy = quote === 'JPY'
    return { kind: 'forex', contract: 100000, pipSize: jpy ? 0.01 : 0.0001, digits: jpy ? 3 : 5, base: s.slice(0, 3), quote, minLot: 0.01, lotStep: 0.01 }
  }

  return { kind: 'other', contract: 1, pipSize: 0.01, digits: 2, base: s, quote: 'USD', minLot: 0.01, lotStep: 0.01 }
}

/** USD profit for a price move of `diff` (already signed by trade direction). */
export function pnlUsd(spec, lots, diff, price) {
  const raw = diff * lots * spec.contract           // in quote currency
  if (spec.quote === 'USD') return raw
  if (spec.base === 'USD' && price > 0) return raw / price          // USDJPY, USDCHF, USDCAD — exact
  return raw * (QUOTE_TO_USD[spec.quote] ?? 1)                      // crosses — approximate
}

/** USD value of one price point for 1.0 lot (used for risk / reward labels). */
export function pointValueUsd(spec, lots, price) {
  return pnlUsd(spec, lots, 1, price)
}

/** Margin (USD) required to hold `lots` at `price` with the given leverage. */
export function marginUsd(spec, lots, price, leverage = 100) {
  let notional
  if (spec.quote === 'USD') notional = lots * spec.contract * price
  else if (spec.base === 'USD') notional = lots * spec.contract
  else notional = lots * spec.contract * (BASE_TO_USD[spec.base] ?? 1)
  return notional / Math.max(1, leverage)
}

/** Round a lot size to the instrument's step (never below the minimum). */
export function normaliseLots(spec, lots) {
  const n = Number(lots)
  if (!Number.isFinite(n)) return spec.minLot
  const stepped = Math.round(n / spec.lotStep) * spec.lotStep
  return Math.max(spec.minLot, Number(stepped.toFixed(2)))
}

/** Decimals to show prices with, learned from a sample price. */
export function priceDigits(spec, samplePrice) {
  if (spec.kind === 'forex') return spec.digits
  if (!Number.isFinite(samplePrice)) return spec.digits
  if (samplePrice >= 1000) return 2
  if (samplePrice >= 10) return Math.max(2, Math.min(spec.digits, 3))
  return Math.max(spec.digits, 4)
}

/** Price distance → pips (forex) / points. */
export const toPips = (spec, priceDiff) => priceDiff / spec.pipSize