import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { fmtUsd, fmtFactor } from '../../lib/backtest/stats'
import { normaliseLots } from '../../lib/backtest/specs'

const fmtPrice = (n, d) => (Number.isFinite(n) ? Number(n).toFixed(d) : '—')
const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

/**
 * Plain typed number. A text input (so the browser draws no up/down spinner), free to hold
 * half-typed values like "0." — it only reports a value once the text is a valid number.
 * Optional − / + buttons nudge the value (used for prices, never for volume).
 */
function NumField({ value, onValue, digits = 2, placeholder, step, inputMode = 'decimal', onBlurNormalise }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '')
  const focused = useRef(false)

  // follow outside changes (dragging a line on the chart, switching ticket) unless the user is typing
  useEffect(() => {
    if (!focused.current) setText(Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '')
  }, [value, digits])

  const edit = (raw) => {
    let t = raw.replace(/[^0-9.]/g, '')
    const dot = t.indexOf('.')
    if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '')
    setText(t)
    const n = parseFloat(t)
    onValue(Number.isFinite(n) ? n : null)
  }
  const nudge = (dir) => {
    const base = Number.isFinite(value) ? value : 0
    const n = Math.max(0, Number((base + dir * step).toFixed(digits)))
    setText(String(n)); onValue(n)
  }

  return (
    <div className="flex items-center rounded-lg overflow-hidden" style={inputStyle}>
      <input type="text" inputMode={inputMode} autoComplete="off" spellCheck={false} value={text} placeholder={placeholder}
             onFocus={() => { focused.current = true }}
             onBlur={() => { focused.current = false; onBlurNormalise?.(text, setText) }}
             onChange={(e) => edit(e.target.value)}
             className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-[13px] outline-none tabular-nums" style={{ color: 'var(--text-primary)' }} />
      {step ? (<>
        <button type="button" onClick={() => nudge(-1)} className="px-2 py-2 hover:bg-white/10" style={{ color: 'var(--text-muted)' }} tabIndex={-1}><Minus size={13} /></button>
        <button type="button" onClick={() => nudge(1)} className="px-2 py-2 hover:bg-white/10" style={{ color: 'var(--text-muted)' }} tabIndex={-1}><Plus size={13} /></button>
      </>) : null}
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
  const [lots, setLots] = useState(null)                // typed volume (null until the user enters one)
  const sell = ticket?.side === 'sell', buy = ticket?.side === 'buy'
  const validLots = Number.isFinite(lots) && lots > 0

  const patch = (p) => onTicket({ ...ticket, ...p })

  // sensible starting price for a pending order: one volatility step away on the correct side
  const pendingPrice = (side, entry, type) => {
    const d = Math.abs(entry - suggest(side, entry).sl)
    const dir = (side === 'buy') === (type === 'limit') ? -1 : 1
    return Number((entry + dir * d).toFixed(digits))
  }

  const start = (side) => {
    if (!ready) return
    const entry = side === 'buy' ? quote.ask : quote.bid
    const next = {
      side, lots: validLots ? lots : null, orderType: mode, entry, sl: null, tp: null,
      price: mode === 'market' ? entry : (ticket?.price ?? pendingPrice(side, entry, mode)),
    }
    if (advanced) Object.assign(next, suggest(side, entry))
    onTicket(next)
  }
  const toggleAdvanced = () => {
    const next = !advanced
    setAdvanced(next)
    if (next && ticket && ticket.sl == null && ticket.tp == null) patch(suggest(ticket.side, ticket.entry))
  }
  const setType = (orderType) => {
    setMode(orderType)
    if (ticket) patch({ orderType, price: orderType === 'market' ? ticket.entry : pendingPrice(ticket.side, ticket.entry, orderType) })
  }
  const onVolume = (n) => {
    const v = Number.isFinite(n) && n > 0 ? n : null
    setLots(v)
    if (ticket) patch({ lots: v })
  }
  // on leaving the field, show the volume the engine will actually use (rounded to the lot step)
  const normaliseVolume = (text, setText) => {
    const n = parseFloat(text)
    if (!(n > 0)) return
    const used = normaliseLots(spec, n)
    setText(String(used))
    if (used !== n) onVolume(used)
  }

  const entry = ticket ? (ticket.orderType === 'market' ? ticket.entry : ticket.price) : null
  const t = ticket ? { ...ticket, entry } : null
  const risk = t && validLots && ticket.sl != null ? projectTicketPnl(t, ticket.sl) : null
  const reward = t && validLots && ticket.tp != null ? projectTicketPnl(t, ticket.tp) : null
  const rr = risk != null && reward != null && risk < 0 ? Math.abs(reward / risk) : null
  const margin = t && validLots ? ticketMargin(t) : 0
  const pnlColor = (n) => (n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-primary)')

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ width: 268, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-subtle)' }}>
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between">
        <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{symbol}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.14)', color: 'var(--accent-purple-light)' }}>{openCount} open</span>
      </div>

      <div className="px-4 grid grid-cols-2 gap-2">
        <button onClick={() => start('sell')} disabled={!ready} className="rounded-lg py-2.5 transition-all disabled:opacity-40"
                style={{ background: sell ? 'rgba(244,63,94,0.2)' : 'rgba(244,63,94,0.08)', border: `1px solid ${sell ? '#F43F5E' : 'rgba(244,63,94,0.3)'}` }}>
          <div className="text-[10px] font-bold tracking-wider" style={{ color: '#F43F5E' }}>SELL</div>
          <div className="text-[14px] font-semibold tabular-nums" style={{ color: '#F43F5E' }}>{ready ? fmtPrice(quote.bid, digits) : '—'}</div>
        </button>
        <button onClick={() => start('buy')} disabled={!ready} className="rounded-lg py-2.5 transition-all disabled:opacity-40"
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
              <button key={k} onClick={() => setType(k === 'market' ? 'market' : mode === 'stop' ? 'stop' : 'limit')} className="py-1.5 text-[12px] font-semibold rounded-md transition-colors"
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
              {['limit', 'stop'].map(tp => (
                <button key={tp} onClick={() => setType(tp)} className="py-1.5 rounded-md text-[12px] capitalize"
                        style={{ background: mode === tp ? 'rgba(139,92,246,0.16)' : 'var(--bg-primary)', color: mode === tp ? 'var(--accent-purple-light)' : 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  {ticket?.side || 'buy'} {tp}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Entry price</Label>
            <NumField value={ticket ? ticket.price : quote.ask} onValue={(v) => ticket && patch({ price: v })} digits={digits} step={spec.pipSize} />
          </div>
        </>)}

        <div>
          <Label right={validLots && ticket && <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Margin {fmtUsd(margin)}</span>}>Volume (lots)</Label>
          <NumField value={lots} onValue={onVolume} digits={2} placeholder={`Enter lots, e.g. ${(spec.lotStep * 10).toFixed(2)}`} onBlurNormalise={normaliseVolume} />
          <p className="mt-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Type the size yourself · min {spec.minLot} · step {spec.lotStep}</p>
        </div>

        <button onClick={toggleAdvanced} className="flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          <ChevronDown size={12} style={{ transform: advanced ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }} /> Advanced
        </button>

        {advanced && ticket && (<>
          <div>
            <Label right={reward != null && <span className="text-[10.5px] font-semibold" style={{ color: pnlColor(reward) }}>Profit: {fmtUsd(reward, { sign: true })}</span>}>Take profit</Label>
            <NumField value={ticket.tp} onValue={(v) => patch({ tp: v })} digits={digits} step={spec.pipSize * 10} placeholder="Price" />
          </div>
          <div>
            <Label right={risk != null && <span className="text-[10.5px] font-semibold" style={{ color: 'var(--negative-red)' }}>Risk: {fmtUsd(risk, { sign: true })}</span>}>Stop loss</Label>
            <NumField value={ticket.sl} onValue={(v) => patch({ sl: v })} digits={digits} step={spec.pipSize * 10} placeholder="Price" />
          </div>
          {rr != null && <p className="text-[11.5px] font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>R : R &nbsp; 1 : {rr.toFixed(2)}</p>}
        </>)}

        {ticket ? (
          <div className="space-y-1.5 pt-1">
            <button onClick={onConfirm} disabled={!validLots} className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: sell ? '#E11D48' : '#2563EB' }}>
              {!validLots ? 'Enter a volume to continue'
                : `${ticket.orderType === 'market' ? 'Confirm' : 'Place'} ${ticket.side === 'sell' ? 'Sell' : 'Buy'}${ticket.orderType !== 'market' ? ` ${ticket.orderType}` : ''} ${lots} lots`}
            </button>
            <button onClick={() => onTicket(null)} className="w-full py-1.5 text-[12px] hover:underline" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        ) : (
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {ready ? 'Enter a volume, pick SELL or BUY, then confirm. Open Advanced to drag TP / SL on the chart.' : 'Start the replay to trade.'}
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