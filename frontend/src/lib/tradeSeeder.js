// Deterministic seeder — same accountNumber always produces same trades
const SYMBOLS   = ['XAUUSD','EURUSD','GBPUSD','GBPJPY','USDJPY','AUDUSD','USDCHF','USDCAD','NAS100','US30']
const STRATEGIES= ['Scalp','Reversal','Breakout','Pullback','Trend Follow']
const SESSIONS  = ['Asian','London','New York']
const SIDES     = ['BUY','SELL']

const BASE_PRICES = {
  XAUUSD:2345, EURUSD:1.085, GBPUSD:1.264, GBPJPY:196.4,
  USDJPY:151.2, AUDUSD:0.654, USDCHF:0.896, USDCAD:1.366,
  NAS100:17580, US30:38820,
}
const PIP_VALUES = {
  XAUUSD:10, EURUSD:10, GBPUSD:10, GBPJPY:7,
  USDJPY:6.6, AUDUSD:10, USDCHF:11, USDCAD:7.3,
  NAS100:0.5, US30:1,
}

// Seeded LCG random — deterministic for same seed
function createRng(seed) {
  let s = 0
  String(seed).split('').forEach(c => { s = (s * 31 + c.charCodeAt(0)) | 0 })
  s = Math.abs(s) || 12345
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1)
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296
  }
}

function rng_range(rng, min, max) { return rng() * (max - min) + min }
function rng_pick(rng, arr)       { return arr[Math.floor(rng() * arr.length)] }

function formatDuration(mins) {
  if (mins < 60) return `${mins}m ${Math.floor(Math.random()*60)}s`
  return `${Math.floor(mins/60)}h ${mins%60}m`
}

export function generateTrades(userId, brokerAccountId, count = 40, accountNumber = '00000') {
  const rng    = createRng(accountNumber + userId)
  const trades = []
  const now    = new Date()

  for (let i = 0; i < count; i++) {
    const symbol   = rng_pick(rng, SYMBOLS)
    const side     = rng_pick(rng, SIDES)
    const strategy = rng_pick(rng, STRATEGIES)
    const session  = rng_pick(rng, SESSIONS)
    const size     = parseFloat(rng_range(rng, 0.01, 0.50).toFixed(2))

    const basePrice  = BASE_PRICES[symbol]
    const pipValue   = PIP_VALUES[symbol]
    const isWin      = rng() < 0.58
    const pips       = isWin ? rng_range(rng, 8, 85) : -rng_range(rng, 5, 42)
    const pnl        = parseFloat((pips * pipValue * size).toFixed(2))

    const daysAgo  = Math.floor(rng_range(rng, 0, 90))
    const openedAt = new Date(now)
    openedAt.setDate(openedAt.getDate() - daysAgo)
    openedAt.setHours(Math.floor(rng_range(rng, 0, 23)), Math.floor(rng_range(rng, 0, 59)))

    const durationMins = Math.floor(rng_range(rng, 2, 240))
    const closedAt     = new Date(openedAt.getTime() + durationMins * 60000)

    const isJpyOrIndex = symbol.includes('JPY') || symbol === 'US30' || symbol === 'NAS100'
    const decimals     = isJpyOrIndex ? 2 : 5
    const pipSize      = isJpyOrIndex ? 0.01 : 0.0001

    const entryPrice = parseFloat((basePrice * (1 + rng_range(rng, -0.003, 0.003))).toFixed(decimals))
    const exitPrice  = side === 'BUY'
      ? parseFloat((entryPrice + pips * pipSize).toFixed(decimals))
      : parseFloat((entryPrice - pips * pipSize).toFixed(decimals))

    trades.push({
      user_id:           userId,
      broker_account_id: brokerAccountId,
      symbol, side, strategy, session, size,
      entry_price:  entryPrice,
      exit_price:   exitPrice,
      pnl,
      duration:     formatDuration(durationMins),
      status:       'closed',
      opened_at:    openedAt.toISOString(),
      closed_at:    closedAt.toISOString(),
      gold_volume:  symbol === 'XAUUSD' ? size : 0,
    })
  }

  return trades.sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at))
}

// New trades on sync — deterministic based on account + timestamp bucket
export function generateSyncTrades(userId, brokerAccountId, accountNumber = '00000') {
  const bucket = Math.floor(Date.now() / 300000) // 5-min bucket → stable per session
  const rng    = createRng(accountNumber + bucket)
  const count  = Math.floor(rng_range(rng, 1, 4))
  return generateTrades(userId, brokerAccountId, count, accountNumber + bucket)
    .map(t => ({ ...t, opened_at: new Date(Date.now() - 3600000).toISOString(), closed_at: new Date().toISOString() }))
}
