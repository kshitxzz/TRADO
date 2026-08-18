import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, Pencil } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import DateTimePicker from './DateTimePicker'
import { calcPnl } from '../../lib/pnlCalculator'

function pad(n) { return String(n).padStart(2,'0') }
function toLocalISO(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export default function EditTradeModal({ open, onClose, onSave, trade }) {
  const [side,    setSide]  = useState('long')
  const [saving,  setSaving] = useState(false)
  const [form,    setForm]   = useState({
    symbol: '', size: '', entry_price: '', exit_price: '',
    opened_at: '', closed_at: '', notes: '',
  })

  // Pre-fill form whenever `trade` changes
  useEffect(() => {
    if (!trade) return
    setSide(trade.side === 'BUY' ? 'long' : 'short')
    setForm({
      symbol:      trade.symbol      || '',
      size:        trade.size        != null ? String(trade.size)        : '',
      entry_price: trade.entry_price != null ? String(trade.entry_price) : '',
      exit_price:  trade.exit_price  != null ? String(trade.exit_price)  : '',
      opened_at:   toLocalISO(trade.opened_at),
      closed_at:   toLocalISO(trade.closed_at),
      notes:       trade.notes || '',
    })
  }, [trade])

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Recalculated live from whatever is currently in the form — this is what
  // was missing before: the modal saved the form fields but never
  // recomputed P&L from them, so editing the exit price left the old P&L
  // value untouched.
  const estimatedPnl = calcPnl(form.symbol, side, form.entry_price, form.exit_price, form.size)

  async function handleSave() {
    if (!form.symbol.trim() || !form.size || !form.entry_price) return
    setSaving(true)

    // Same rule as Add Trade: only 'closed' once both exit price AND exit
    // date/time are filled in — this is how a trade "graduates" from Open
    // Trades to Closed Trades when the user comes back to fill in the rest.
    const isClosed = !!(form.exit_price && form.closed_at)

    await onSave(trade.id, {
      symbol:      form.symbol.trim().toUpperCase(),
      side:        side === 'long' ? 'BUY' : 'SELL',
      size:        parseFloat(form.size),
      entry_price: parseFloat(form.entry_price),
      exit_price:  form.exit_price ? parseFloat(form.exit_price) : null,
      pnl:         estimatedPnl ?? null,
      status:      isClosed ? 'closed' : 'open',
      opened_at:   form.opened_at ? new Date(form.opened_at).toISOString() : null,
      closed_at:   form.closed_at ? new Date(form.closed_at).toISOString() : null,
      notes:       form.notes || null,
    })

    setSaving(false)
    onClose()
  }

  if (!open || !trade) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>

        <motion.div
          initial={{ opacity:0, scale:0.96, y:16 }}
          animate={{ opacity:1, scale:1, y:0 }}
          exit={{ opacity:0, scale:0.96 }}
          transition={{ type:'spring', damping:28, stiffness:320 }}
          className="w-full max-w-md rounded-2xl flex flex-col"
          style={{ background:'var(--bg-card)', border:'1px solid var(--border-subtle)', maxHeight:'92vh' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0"
               style={{ borderBottom:'1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                   style={{ background:'rgba(59,130,246,0.15)' }}>
                <Pencil size={15} style={{ color:'#3B82F6' }} />
              </div>
              <h2 className="font-bold text-base" style={{ color:'var(--text-primary)' }}>Edit Trade</h2>
            </div>
            <button onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ color:'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

            {/* Long / Short */}
            <div className="grid grid-cols-2 rounded-xl overflow-hidden p-1 gap-1"
                 style={{ background:'var(--bg-card-hover, rgba(255,255,255,0.04))', border:'1px solid var(--border-subtle)' }}>
              {[['long', TrendingUp, 'var(--accent-purple)'], ['short', TrendingDown, '#EF4444']].map(([s, Icon, color]) => (
                <button key={s} onClick={() => setSide(s)}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all capitalize"
                        style={{ background: side===s ? color : 'transparent',
                                 color: side===s ? 'white' : 'var(--text-muted)' }}>
                  <Icon size={14} /> {s}
                </button>
              ))}
            </div>

            {/* Symbol + Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color:'var(--text-muted)' }}>
                  SYMBOL <span style={{ color:'var(--negative-red)' }}>*</span>
                </label>
                <input className="input-dark font-mono uppercase"
                       value={form.symbol}
                       onChange={e => update('symbol', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color:'var(--text-muted)' }}>
                  QUANTITY (LOTS) <span style={{ color:'var(--negative-red)' }}>*</span>
                </label>
                <input className="input-dark font-mono" type="number" step="0.01" min="0.01"
                       value={form.size}
                       onChange={e => update('size', e.target.value)} />
              </div>
            </div>

            {/* Entry + Exit price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color:'var(--text-muted)' }}>
                  ENTRY PRICE <span style={{ color:'var(--negative-red)' }}>*</span>
                </label>
                <input className="input-dark font-mono" type="number" step="any"
                       value={form.entry_price}
                       onChange={e => update('entry_price', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color:'var(--text-muted)' }}>
                  EXIT PRICE
                </label>
                <input className="input-dark font-mono" type="number" step="any"
                       placeholder="Optional"
                       value={form.exit_price}
                       onChange={e => update('exit_price', e.target.value)} />
              </div>
            </div>

            {/* Entry Date */}
            <DateTimePicker
              label="ENTRY DATE"
              value={form.opened_at}
              onChange={v => update('opened_at', v)}
            />

            {/* Exit Date */}
            <DateTimePicker
              label="EXIT DATE"
              value={form.closed_at}
              onChange={v => update('closed_at', v)}
              optional
            />

            {/* P&L preview (read-only, from price calc) */}
            {estimatedPnl !== null && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm"
                   style={{
                     background: estimatedPnl >= 0 ? 'rgba(34,197,94,0.07)' : 'rgba(244,63,94,0.07)',
                     border: `1px solid ${estimatedPnl >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(244,63,94,0.2)'}`,
                   }}>
                <span style={{ color: 'var(--text-muted)' }}>Calculated P&L</span>
                <span className="font-bold" style={{ color: estimatedPnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                  {estimatedPnl >= 0 ? '+' : ''}${estimatedPnl.toFixed(2)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:4 }} />

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color:'var(--text-muted)' }}>
                NOTES
              </label>
              <textarea className="input-dark resize-y" rows={3}
                        placeholder="Trade rationale, entry/exit notes..."
                        value={form.notes}
                        onChange={e => update('notes', e.target.value)} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 pb-5 pt-3 flex-shrink-0"
               style={{ borderTop:'1px solid var(--border-subtle)' }}>
            <button onClick={onClose}
                    className="btn-outline flex-1 justify-center py-2.5 text-sm">
              Cancel
            </button>
            <button onClick={handleSave}
                    disabled={saving || !form.symbol.trim() || !form.size || !form.entry_price}
                    className="flex-1 justify-center py-2.5 text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
                    style={{ background:'#3B82F6', color:'white' }}>
              {saving ? 'Updating…' : 'Update Trade'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}