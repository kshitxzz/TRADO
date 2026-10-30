import { useState } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { fmtUsd } from '../../lib/backtest/stats'
import { formatShortDateTime } from '../../hooks/useTimeFormat'

const fp = (n, d) => (n == null ? '—' : Number(n).toFixed(d))
const REASON = { tp: 'Take profit', sl: 'Stop loss', manual: 'Manual', stopout: 'Stop-out' }
const clr = (n) => (n > 0 ? 'var(--positive-green)' : n < 0 ? 'var(--negative-red)' : 'var(--text-primary)')

function Table({ cols, rows, empty }) {
  if (!rows.length) return <p className="px-4 py-5 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{empty}</p>
  return (
    <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>{cols.map(c => (
          <th key={c} className="text-left font-medium px-4 py-1.5 sticky top-0" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)' }}>{c}</th>
        ))}</tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  )
}
const Td = ({ children, style }) => <td className="px-4 py-1.5 tabular-nums" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', ...style }}>{children}</td>
const Side = ({ side }) => <span className="font-semibold" style={{ color: side === 'buy' ? '#22C55E' : '#F43F5E' }}>{side === 'buy' ? 'Buy' : 'Sell'}</span>

export default function PositionsPanel({
  positions, orders, closed, digits, pnlOf, onClose, onCloseAll, onCancelOrder, floating, fmtTime, contentHeight,
}) {
  const when = (s) => (fmtTime ? fmtTime(s) : formatShortDateTime(s * 1000))
  const [tab, setTab] = useState('positions')
  const [open, setOpen] = useState(true)
  const hist = [...closed].reverse()
  const tabs = [['positions', `Positions (${positions.length})`], ['orders', `Orders (${orders.length})`], ['history', `History (${closed.length})`]]

  return (
    <div className="flex-shrink-0" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-1 px-2 h-9">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setOpen(true) }} className="px-3 h-7 rounded-md text-[12px] font-semibold transition-colors"
                  style={{ color: tab === k && open ? 'var(--text-primary)' : 'var(--text-muted)', background: tab === k && open ? 'rgba(255,255,255,0.06)' : 'transparent' }}>{label}</button>
        ))}
        <div className="flex-1" />
        <span className="text-[12px] mr-2" style={{ color: 'var(--text-muted)' }}>Floating P&L <b className="tabular-nums" style={{ color: clr(floating) }}>{fmtUsd(floating, { sign: true })}</b></span>
        {positions.length > 1 && tab === 'positions' && (
          <button onClick={onCloseAll} className="px-2.5 h-7 rounded-md text-[11.5px] font-semibold hover:bg-white/5" style={{ color: 'var(--negative-red)', border: '1px solid var(--border-subtle)' }}>Close all</button>
        )}
        <button onClick={() => setOpen(o => !o)} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      </div>

      {open && (
        <div className="overflow-auto" style={{ ...(contentHeight != null ? { height: contentHeight } : { maxHeight: 170 }), borderTop: '1px solid var(--border-subtle)' }}>
          {tab === 'positions' && (
            <Table cols={['Side', 'Lots', 'Entry', 'SL', 'TP', 'Opened', 'P&L', '']} empty="No open positions."
              rows={positions.map(p => {
                const pnl = pnlOf(p)
                return (
                  <tr key={p.id}>
                    <Td><Side side={p.side} /></Td><Td>{p.lots}</Td><Td>{fp(p.entry, digits)}</Td>
                    <Td style={{ color: p.sl ? '#F43F5E' : 'var(--text-muted)' }}>{fp(p.sl, digits)}</Td>
                    <Td style={{ color: p.tp ? '#60A5FA' : 'var(--text-muted)' }}>{fp(p.tp, digits)}</Td>
                    <Td>{when(p.openedAt)}</Td>
                    <Td style={{ color: clr(pnl), fontWeight: 600 }}>{fmtUsd(pnl, { sign: true })}</Td>
                    <Td><button onClick={() => onClose(p.id)} className="px-2 py-0.5 rounded text-[11px] font-semibold hover:bg-white/10" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>Close</button></Td>
                  </tr>
                )
              })} />
          )}
          {tab === 'orders' && (
            <Table cols={['Type', 'Lots', 'Price', 'SL', 'TP', 'Placed', '']} empty="No pending orders."
              rows={orders.map(o => (
                <tr key={o.id}>
                  <Td><Side side={o.side} /> <span style={{ color: 'var(--text-muted)' }}>{o.type}</span></Td><Td>{o.lots}</Td><Td>{fp(o.price, digits)}</Td>
                  <Td>{fp(o.sl, digits)}</Td><Td>{fp(o.tp, digits)}</Td><Td>{when(o.createdAt)}</Td>
                  <Td><button onClick={() => onCancelOrder(o.id)} className="p-1 rounded hover:bg-white/10" title="Cancel order"><X size={13} style={{ color: 'var(--negative-red)' }} /></button></Td>
                </tr>
              ))} />
          )}
          {tab === 'history' && (
            <Table cols={['Side', 'Lots', 'Entry', 'Exit', 'Closed by', 'Opened', 'Closed', 'P&L']} empty="No closed trades yet."
              rows={hist.map(t => (
                <tr key={t.id}>
                  <Td><Side side={t.side} /></Td><Td>{t.lots}</Td><Td>{fp(t.entry, digits)}</Td><Td>{fp(t.exit, digits)}</Td>
                  <Td>{REASON[t.reason] || t.reason}</Td><Td>{when(t.openedAt)}</Td><Td>{when(t.closedAt)}</Td>
                  <Td style={{ color: clr(t.pnl), fontWeight: 600 }}>{fmtUsd(t.pnl, { sign: true })}</Td>
                </tr>
              ))} />
          )}
        </div>
      )}
    </div>
  )
}