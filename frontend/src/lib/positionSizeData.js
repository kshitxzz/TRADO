// Reference pip value / pip size data for the Position Size Calculator.
// Pip values are typical approximations per 1.0 standard lot (quoted in
// USD) — precise values move with live FX rates, so anyone who needs
// exact numbers can flip on "Use custom pip value" in the calculator.
export const INSTRUMENTS = {
  // Metals
  XAUUSD: { pipValue: 10,    pipSize: 0.01   },
  XAGUSD: { pipValue: 50,    pipSize: 0.01   },

  // Crypto
  BTCUSD: { pipValue: 1,     pipSize: 1      },
  ETHUSD: { pipValue: 1,     pipSize: 1      },
  SOLUSD: { pipValue: 1,     pipSize: 0.1    },
  XRPUSD: { pipValue: 1,     pipSize: 0.001  },

  // Forex Majors
  EURUSD: { pipValue: 10,    pipSize: 0.0001 },
  GBPUSD: { pipValue: 10,    pipSize: 0.0001 },
  USDJPY: { pipValue: 6.7,   pipSize: 0.01   },
  USDCHF: { pipValue: 11.3,  pipSize: 0.0001 },
  USDCAD: { pipValue: 7.35,  pipSize: 0.0001 },
  AUDUSD: { pipValue: 10,    pipSize: 0.0001 },
  NZDUSD: { pipValue: 10,    pipSize: 0.0001 },

  // Forex Crosses
  EURGBP: { pipValue: 12.7,  pipSize: 0.0001 },
  EURJPY: { pipValue: 6.7,   pipSize: 0.01   },
  GBPJPY: { pipValue: 6.7,   pipSize: 0.01   },
  EURAUD: { pipValue: 6.6,   pipSize: 0.0001 },
  GBPAUD: { pipValue: 6.6,   pipSize: 0.0001 },
  AUDJPY: { pipValue: 6.7,   pipSize: 0.01   },

  // Indices
  US30:  { pipValue: 1, pipSize: 1 },
  US100: { pipValue: 1, pipSize: 1 },
  US500: { pipValue: 1, pipSize: 1 },
  GER40: { pipValue: 1, pipSize: 1 },
  UK100: { pipValue: 1, pipSize: 1 },
}

export const INSTRUMENT_GROUPS = [
  { label: 'Popular',       symbols: ['XAUUSD', 'BTCUSD', 'ETHUSD'] },
  { label: 'Forex Majors',  symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD'] },
  { label: 'Forex Crosses', symbols: ['EURGBP', 'EURJPY', 'GBPJPY', 'EURAUD', 'GBPAUD', 'AUDJPY'] },
  { label: 'Metals',        symbols: ['XAGUSD'] },
  { label: 'Indices',       symbols: ['US30', 'US100', 'US500', 'GER40', 'UK100'] },
  { label: 'Crypto',        symbols: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'] },
]

// Strips trailing zeroes the same way the reference calculator does —
// 1.2500 -> "1.25", 12.50 -> "12.5", 0.1250 -> "0.13" (2dp round first).
export function formatLots(n) {
  if (!Number.isFinite(n)) return '0'
  return String(Number(n.toFixed(2)))
}

export function formatCurrency(n) {
  const val = Number.isFinite(n) ? n : 0
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}