// Approximate P&L calculator — shared by AddTradeModal and EditTradeModal so
// both compute P&L the exact same way. (Previously this lived only inside
// AddTradeModal, which is why editing a trade's exit price never
// recalculated P&L — EditTradeModal had no calculator at all.)
export function calcPnl(symbol, side, entry, exit, size) {
  if (!entry || !exit || !size) return null
  const e = parseFloat(entry), x = parseFloat(exit), s = parseFloat(size)
  if (isNaN(e) || isNaN(x) || isNaN(s) || s <= 0) return null
  const sym  = (symbol || '').toUpperCase()
  const diff = side === 'long' ? (x - e) : (e - x)
  if (sym.includes('XAU') || sym.includes('GOLD')) return parseFloat((diff * s * 100).toFixed(2))
  if (sym.includes('JPY'))                          return parseFloat((diff * s * 1000).toFixed(2))
  if (['NAS100','US30','SPX500','DE30'].some(i => sym.includes(i))) return parseFloat((diff * s).toFixed(2))
  return parseFloat((diff * s * 100000).toFixed(2))
}