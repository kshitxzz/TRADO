import { US, EU, GB, JP, AU, CA, CH, NZ, SG, HK, CN, ZA, TR, MX, SE, NO, DK, PL, IN } from 'country-flag-icons/react/1x1'
import goldIcon from '../../assets/icons/gold.png'
import silverIcon from '../../assets/icons/silver.png'

// ── Currency → flag component ──────────────────────────────────────────────────
const FLAGS = {
  USD: US, EUR: EU, GBP: GB, JPY: JP, AUD: AU, CAD: CA, CHF: CH, NZD: NZ,
  SGD: SG, HKD: HK, CNH: CN, CNY: CN, ZAR: ZA, TRY: TR, MXN: MX,
  SEK: SE, NOK: NO, DKK: DK, PLN: PL, INR: IN,
}

// ── Metals — no country, so a gold/silver bars badge instead ──────────────────
const METAL_ICONS = { XAU: goldIcon, XAG: silverIcon }

// ── Crypto — brand color + glyph, no flag equivalent ───────────────────────────
const CRYPTO = {
  BTC: { bg: '#F7931A', glyph: '₿' },
  ETH: { bg: '#627EEA', glyph: 'Ξ' },
}

// ── Index symbols — proxy to the underlying market's flag ─────────────────────
const INDEX_FLAGS = {
  NAS100: US, US30: US, SPX500: US, US100: US, US500: US,
  UK100: GB, DE30: null, GER40: null, JP225: JP,
}

/**
 * Circular icon for a trading symbol. Forex pairs render as a split circle
 * (base currency flag on the left half, quote currency on the right). Metals
 * get a gold/silver gradient coin. Crypto gets its brand glyph. Anything
 * unrecognized falls back to a colored two-letter badge.
 */
export default function PairIcon({ symbol, size = 32, className = '' }) {
  const sym = (symbol || '').toUpperCase().trim()
  const dim = { width: size, height: size }
  const border = { border: '1px solid rgba(255,255,255,0.08)' }

  // Metals (e.g. XAUUSD, XAGUSD) — actual gold/silver bars artwork
  const metalCode = Object.keys(METAL_ICONS).find(m => sym.startsWith(m))
  if (metalCode) {
    return (
      <img
        src={METAL_ICONS[metalCode]}
        alt={metalCode}
        className={`rounded-full flex-shrink-0 ${className}`}
        style={{ ...dim, ...border, objectFit: 'cover' }}
      />
    )
  }

  // Crypto (e.g. BTCUSD, ETHUSD)
  const cryptoCode = Object.keys(CRYPTO).find(c => sym.startsWith(c))
  if (cryptoCode) {
    const c = CRYPTO[cryptoCode]
    return (
      <div
        className={`rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white ${className}`}
        style={{ ...dim, ...border, background: c.bg, fontSize: Math.round(size * 0.5) }}
      >
        {c.glyph}
      </div>
    )
  }

  // Indices — single flag for the underlying market, no natural pair
  if (INDEX_FLAGS[sym]) {
    const Flag = INDEX_FLAGS[sym]
    return (
      <div className={`rounded-full overflow-hidden flex-shrink-0 ${className}`} style={{ ...dim, ...border }}>
        <Flag style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    )
  }

  // Forex pairs — split circle, base currency left / quote currency right
  if (sym.length === 6) {
    const base = sym.slice(0, 3), quote = sym.slice(3, 6)
    const BaseFlag = FLAGS[base], QuoteFlag = FLAGS[quote]
    if (BaseFlag && QuoteFlag) {
      return (
        <div className={`rounded-full overflow-hidden flex-shrink-0 relative ${className}`} style={{ ...dim, ...border }}>
          <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 50% 0 0)' }}>
            <BaseFlag style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 0 0 50%)' }}>
            <QuoteFlag style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      )
    }
    // One side recognized — show it full-circle rather than nothing
    const SoloFlag = BaseFlag || QuoteFlag
    if (SoloFlag) {
      return (
        <div className={`rounded-full overflow-hidden flex-shrink-0 ${className}`} style={{ ...dim, ...border }}>
          <SoloFlag style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      )
    }
  }

  // Fallback — colored initials, same treatment used before this component existed
  return (
    <div
      className={`rounded-full flex-shrink-0 flex items-center justify-center font-bold ${className}`}
      style={{
        ...dim, ...border,
        background: 'rgba(139,92,246,0.18)',
        color: 'var(--accent-purple)',
        fontSize: Math.round(size * 0.32),
      }}
    >
      {sym.slice(0, 2)}
    </div>
  )
}