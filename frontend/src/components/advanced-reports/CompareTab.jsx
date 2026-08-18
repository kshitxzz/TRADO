import { useMemo, useState } from 'react'
import { ArrowLeftRight, Play, DollarSign, Percent, Hash, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { BLUE } from './shared'
import { fmtMoney, fmtPct, pnlColor } from '../../lib/advancedReportsHelpers'
import { computeStats } from '../../lib/utils'

const emptyFilters = { symbol: '', tags: '', side: 'any', startDate: '', endDate: '', outcome: 'any' }

function matchTrades(trades, f) {
  return trades.filter(t => {
    if (f.symbol && !(t.symbol || '').toLowerCase().includes(f.symbol.trim().toLowerCase())) return false
    if (f.tags) {
      const wanted = f.tags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const have = (t.journal_tags || []).map(s => s.toLowerCase())
      if (wanted.length && !wanted.some(w => have.includes(w))) return false
    }
    if (f.side !== 'any' && t.side !== f.side) return false
    if (f.startDate && (!t.closed_at || t.closed_at.slice(0, 10) < f.startDate)) return false
    if (f.endDate && (!t.closed_at || t.closed_at.slice(0, 10) > f.endDate)) return false
    if (f.outcome === 'win' && !((t.pnl || 0) > 0)) return false
    if (f.outcome === 'loss' && !((t.pnl || 0) < 0)) return false
    if (f.outcome === 'breakeven' && (t.pnl || 0) !== 0) return false
    return true
  })
}

function FilterPanel({ title, matched, filters, setFilters }) {
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const inputStyle = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, width: '100%',
  }
  const labelStyle = { color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
  return (
    <div className="glass-card p-6">
      <p className="text-base font-bold mb-5" style={{ color: 'var(--text-primary)' }}>
        {title} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({matched} Trades Matched)</span>
      </p>
      <div className="space-y-4">
        <div>
          <label style={labelStyle}>Symbol</label>
          <input style={inputStyle} placeholder="Enter Symbol (e.g., EURUSD)" value={filters.symbol}
                 onChange={e => set('symbol', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Tags</label>
          <input style={inputStyle} placeholder="Enter tags..." value={filters.tags}
                 onChange={e => set('tags', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Side</label>
          <select style={inputStyle} value={filters.side} onChange={e => set('side', e.target.value)}>
            <option value="any">Any</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" style={inputStyle} value={filters.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" style={inputStyle} value={filters.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Trade P&L</label>
          <select style={inputStyle} value={filters.outcome} onChange={e => set('outcome', e.target.value)}>
            <option value="any">Any</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ icon: Icon, label, valueA, valueB, colorA, colorB }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: BLUE }}>Group 1</p>
          <p className="text-lg font-bold" style={{ color: colorA || 'var(--text-primary)' }}>{valueA}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#F59E0B' }}>Group 2</p>
          <p className="text-lg font-bold" style={{ color: colorB || 'var(--text-primary)' }}>{valueB}</p>
        </div>
      </div>
    </div>
  )
}

export default function CompareTab({ trades }) {
  const [filtersA, setFiltersA] = useState(emptyFilters)
  const [filtersB, setFiltersB] = useState(emptyFilters)
  const [applied, setApplied] = useState(false)

  const closed = useMemo(() => trades.filter(t => t.status === 'closed'), [trades])
  const matchedA = useMemo(() => matchTrades(closed, filtersA), [closed, filtersA])
  const matchedB = useMemo(() => matchTrades(closed, filtersB), [closed, filtersB])
  const statsA = useMemo(() => computeStats(matchedA), [matchedA])
  const statsB = useMemo(() => computeStats(matchedB), [matchedB])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FilterPanel title="Group #1" matched={matchedA.length} filters={filtersA} setFilters={setFiltersA} />
        <FilterPanel title="Group #2" matched={matchedB.length} filters={filtersB} setFilters={setFiltersB} />
      </div>

      <div className="flex justify-center">
        <button onClick={() => setApplied(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm"
                style={{ background: BLUE, color: '#fff' }}>
          <Play size={15} fill="#fff" /> Apply Comparison
        </button>
      </div>

      {applied && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)' }}>
              <ArrowLeftRight size={16} style={{ color: BLUE }} />
            </div>
            <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Comparison Results</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <ResultCard icon={DollarSign} label="Net P&L"
                        valueA={fmtMoney(statsA.totalPnl)} valueB={fmtMoney(statsB.totalPnl)}
                        colorA={pnlColor(statsA.totalPnl)} colorB={pnlColor(statsB.totalPnl)} />
            <ResultCard icon={Percent} label="Win Rate"
                        valueA={fmtPct(statsA.winRate)} valueB={fmtPct(statsB.winRate)} />
            <ResultCard icon={Hash} label="Trade Count"
                        valueA={matchedA.length} valueB={matchedB.length} />
            <ResultCard icon={TrendingUp} label="Avg Win"
                        valueA={fmtMoney(statsA.avgWin)} valueB={fmtMoney(statsB.avgWin)}
                        colorA="var(--positive-green)" colorB="var(--positive-green)" />
            <ResultCard icon={TrendingDown} label="Avg Loss"
                        valueA={fmtMoney(statsA.avgLoss)} valueB={fmtMoney(statsB.avgLoss)}
                        colorA="var(--negative-red)" colorB="var(--negative-red)" />
            <ResultCard icon={Activity} label="Profit Factor"
                        valueA={statsA.profitFactor > 99 ? '∞' : statsA.profitFactor.toFixed(2)}
                        valueB={statsB.profitFactor > 99 ? '∞' : statsB.profitFactor.toFixed(2)} />
          </div>
        </div>
      )}
    </div>
  )
}