import { useState } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { fmtUsd, fmtFactor } from '../../lib/backtest/stats'

const fmtPrice = (n, d) => (Number.isFinite(n) ? Number(n).toFixed(d) : '—')

function Stepper({ value, onChange, step, digits = 2, min = 0, placeholder }) {
  const nudge = (dir) => {
    const base = Number.isFinite(value) ? value : 0
    onChange(Math.max(min, Number((base + dir * step).toFixed(digits))))
  }
  return (
    <div className="flex items-center rounded-lg overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
      <input type="number" step="any" value={Number.isFinite(value) ? value : ''} placeholder={placeholder}
             onChange={(e) => { const n = parseFloat(e.target.value); onChange(Number.isFinite(n) ? n : null) }}
             className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
      <button onClick={() => nudge(-1)} className="px-2 py-2 hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><Minus size={13} /></button>
      <button onClick={() => nudge(1)} className="px-2 py-2 hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><Plus size={13} /></button>
    </div>
  )
}

const Label = ({ children, right }) => (
  <div className="flex items-center justify-between mb-1">
    <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{children}</span>
    {right}
  </div>
)

export default function OrderPanel({
  symbol, spec, digits, quote, ready, ticket, onTicket, suggest, projectTicketPnl, ticketMargin,
  onConfirm, stats, account, openCount,
}) {
  const [advanced, setAdvanced] = useState(false)
  // remembered between tickets, so confirming / cancelling doesn't reset the panel
  const [mode, setMode] = useState('market')            // 'market' | 'limit' | 'stop'
  const [lotsPref, setLotsPref] = useState(null)
  const lotsDefault = lotsPref ?? spec.minLot * 10
  const sell = ticket?.side === 'sell', buy = ticket?.side === 'buy'

  // sensible starting price for a pending order: one volatility step away on the correct side
  const pendingPrice = (side, entry, type) => {
    const d = Math.abs(entry - suggest(side, entry).sl)
    const dir = (side === 'buy') === (type === 'limit') ? -1 : 1
    return Number((entry + dir * d).toFixed(digits))
  }

  const start = (side) => {
    if (!ready) return
    const entry = side === 'buy' ? quote.ask : quote.bid
    const next = { side, lots: ticket?.lots ?? lotsDefault, orderType: mode, price: mode === 'market' ? entry : (ticket?.price ?? pendingPrice(side, entry, mode)), entry, sl: null, tp: null }
    if (advanced) Object.assign(next, suggest(side, entry))
    onTicket(next)
  }
  const patch = (p) => onTicket({ ...ticket, ...p })
  const toggleAdvanced = () => {
    const next = !advanced
    setAdvanced(next)
    if (next && ticket && ticket.sl == null && ticket.tp == null) patch(suggest(ticket.side, ticket.entry))
  }
  const setType = (orderType) => {
    setMode(orderType)
    if (ticket) patch({ orderType, price: orderType === 'market' ? ticket.entry : pendingPrice(ticket.side, ticket.entry, orderType) })
  }
  const setLots = (v) => {
    if (Number.isFinite(v)) setLotsPref(v)
    if (ticket) patch({ lots: v })
  }

  const entry = ticket ? (ticket.orderType === 'market' ? ticket.entry : ticket.price) : null
  const risk = ticket && ticket.sl != null ? projectTicketPnl({ ...ticket, entry }, ticket.sl) : null
  const reward = ticket && ticket.tp != null ? projectTicketPnl({ ...ticket, entry }, ticket.tp) : null
  const rr = risk != null && reward != null && risk < 0 ? Math.abs(reward / risk) : null
  const margin = ticket ? ticketMargin({ ...ticket, entry }) : 0

  const pnlColor = (n) => (n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-primary)')

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ width: 268, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-subtle)' }}>
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between">
        <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--accent-purple-light)' }}>{openCount} open</span>
      </div>

      <div className="px-4 grid grid-cols-2 gap-2">
        <button onClick={() => start('sell')} disabled={!ready}
                className="rounded-lg py-2.5 transition-all disabled:opacity-40"
                style={{ background: sell ? 'rgba(244,63,94,0.2)' : 'rgba(244,63,94,0.08)', border: `1px solid ${sell ? '#F43F5E' : 'rgba(244,63,94,0.3)'}` }}>
          <div className="text-[10px] font-bold tracking-wider" style={{ color: '#F43F5E' }}>SELL</div>
          <div className="text-[14px] font-semibold tabular-nums" style={{ color: '#F43F5E' }}>{ready ? fmtPrice(quote.bid, digits) : '—'}</div>
        </button>
        <button onClick={() => start('buy')} disabled={!ready}
                className="rounded-lg py-2.5 transition-all disabled:opacity-40"
                style={{ background: buy ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.08)', border: `1px solid ${buy ? '#3B82F6' : 'rgba(59,130,246,0.3)'}` }}>
          <div className="text-[10px] font-bold tracking-wider" style={{ color: '#60A5FA' }}>BUY</div>
          <div className="text-[14px] font-semibold tabular-nums" style={{ color: '#60A5FA' }}>{ready ? fmtPrice(quote.ask, digits) : '—'}</div>
        </button>
      </div>

      <div className="px-4 mt-3">
        <div className="grid grid-cols-2 p-0.5 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
          {[['market', 'Market'], ['pending', 'Pending']].map(([k, label]) => {
            const on = (k === 'market') === (mode === 'market')
            return (
              <button key={k} onClick={() => setType(k === 'market' ? 'market' : mode === 'stop' ? 'stop' : 'limit')}
                      className="py-1.5 text-[12px] font-semibold rounded-md transition-colors"
                      style={{ background: on ? 'var(--accent-purple)' : 'transparent', color: on ? '#fff' : 'var(--text-muted)' }}>{label}</button>
            )
          })}
        </div>
      </div>

      <div className="px-4 mt-3 space-y-3">
        {mode !== 'market' && (<>
          <div>
            <Label>Order type</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {['limit', 'stop'].map(t => (
                <button key={t} onClick={() => setType(t)} className="py-1.5 rounded-md text-[12px] capitalize"
                        style={{ background: mode === t ? 'rgba(139,92,246,0.16)' : 'var(--bg-primary)', color: mode === t ? 'var(--accent-purple-light)' : 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  {ticket?.side || 'buy'} {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Entry price</Label>
            <Stepper value={ticket ? ticket.price : quote.ask} onChange={(v) => ticket && patch({ price: v })} step={spec.pipSize} digits={digits} />
          </div>
        </>)}

        <div>
          <Label right={ticket && <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Margin {fmtUsd(margin)}</span>}>Volume (lots)</Label>
          <Stepper value={ticket?.lots ?? lotsDefault} onChange={setLots} step={spec.lotStep * 10} digits={2} min={spec.minLot} />
        </div>

        <button onClick={toggleAdvanced} className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          <ChevronDown size={12} style={{ transform: advanced ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }} /> Advanced
        </button>

        {advanced && ticket && (<>
          <div>
            <Label right={reward != null && <span className="text-[10.5px] font-semibold" style={{ color: pnlColor(reward) }}>Profit: {fmtUsd(reward, { sign: true })}</span>}>Take profit</Label>
            <Stepper value={ticket.tp} onChange={(v) => patch({ tp: v })} step={spec.pipSize * 10} digits={digits} placeholder="Price" />
          </div>
          <div>
            <Label right={risk != null && <span className="text-[10.5px] font-semibold" style={{ color: 'var(--negative-red)' }}>Risk: {fmtUsd(risk, { sign: true })}</span>}>Stop loss</Label>
            <Stepper value={ticket.sl} onChange={(v) => patch({ sl: v })} step={spec.pipSize * 10} digits={digits} placeholder="Price" />
          </div>
          {rr != null && <p className="text-[11.5px] font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>R : R &nbsp; 1 : {rr.toFixed(2)}</p>}
        </>)}

        {ticket ? (
          <div className="space-y-1.5 pt-1">
            <button onClick={onConfirm} className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: sell ? '#E11D48' : '#2563EB' }}>
              {ticket.orderType === 'market' ? 'Confirm' : 'Place'} {ticket.side === 'sell' ? 'Sell' : 'Buy'}{ticket.orderType !== 'market' ? ` ${ticket.orderType}` : ''} {ticket.lots} lots
            </button>
            <button onClick={() => onTicket(null)} className="w-full py-1.5 text-[12px] hover:underline" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        ) : (
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {ready ? 'Pick SELL or BUY, set the volume, then confirm. Open Advanced to drag TP / SL on the chart.' : 'Start the replay to trade.'}
          </p>
        )}
      </div>

      <div className="mt-auto px-4 py-3.5 space-y-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {[
          ['Net P&L', fmtUsd(stats.netPnl, { sign: true }), pnlColor(stats.netPnl)],
          ['Win rate', `${stats.winRate.toFixed(1)}%`],
          ['Trades', `${stats.wins}W / ${stats.losses}L`],
          ['Profit factor', fmtFactor(stats.profitFactor)],
        ].map(([k, v, c]) => (
          <div key={k} className="flex items-center justify-between text-[12px]">
            <span style={{ color: 'var(--text-muted)' }}>{k}</span>
            <span className="font-semibold tabular-nums" style={{ color: c || 'var(--text-primary)' }}>{v}</span>
          </div>
        ))}
        <div className="h-px my-1" style={{ background: 'var(--border-subtle)' }} />
        {[['Balance', account.balance], ['Equity', account.equity], ['Margin used', account.margin], ['Free margin', account.freeMargin]].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-[11.5px]">
            <span style={{ color: 'var(--text-muted)' }}>{k}</span>
            <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>{fmtUsd(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}