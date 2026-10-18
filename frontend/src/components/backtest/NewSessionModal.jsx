import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, ChevronDown, Search, BookOpen, Loader2, AlertCircle } from 'lucide-react'
import PairIcon from '../ui/PairIcon'
import { BASE_TFS, MAX_BASE_CANDLES, describeSource, plannedCandles, searchSymbols, tfLabel } from '../../lib/backtest/data'
import { getSpec } from '../../lib/backtest/specs'
import { normaliseSymbol } from '../../lib/binanceDirect'

const LEVERAGE = [1, 10, 25, 50, 100, 200, 300, 500]
const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const today = () => iso(new Date())

const fieldCls = 'w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[var(--accent-purple)]'
const fieldStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

const Label = ({ children, hint }) => (
  <label className="block mb-1.5 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
    {children} {hint && <span className="normal-case tracking-normal font-normal">· {hint}</span>}
  </label>
)

function Combo({ value, onChange, options, placeholder, icon, allowCustom, customLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])
  const q = value.trim().toLowerCase()
  const list = options.filter(o => !q || o.toLowerCase().includes(q))
  const exact = options.some(o => o.toLowerCase() === q)
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>{icon}</span>}
        <input value={value} onChange={(e) => { onChange(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder={placeholder}
               className={fieldCls} style={{ ...fieldStyle, paddingLeft: icon ? 34 : 12 }} />
      </div>
      {open && (list.length > 0 || (allowCustom && q && !exact)) && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg py-1 max-h-[200px] overflow-y-auto"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          {allowCustom && q && !exact && (
            <button type="button" onClick={() => { onChange(value.trim()); setOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-white/5" style={{ color: 'var(--accent-purple-light)' }}>
              <Plus size={13} /> {customLabel} “{value.trim()}”
            </button>
          )}
          {list.map(o => (
            <button type="button" key={o} onClick={() => { onChange(o); setOpen(false) }} className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function SymbolField({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])
  const groups = useMemo(() => searchSymbols(value), [value])
  const src = value ? describeSource(value) : null
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input value={value} onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true) }} onFocus={() => setOpen(true)}
               placeholder="Search symbol (e.g. EURUSD, XAUUSD, BTCUSDT)" className={fieldCls} style={{ ...fieldStyle, paddingLeft: 34 }} />
      </div>
      {open && groups.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg py-1 max-h-[240px] overflow-y-auto"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          {groups.map(g => (
            <div key={g.group}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{g.group}</p>
              {g.items.map(s => (
                <button type="button" key={s} onClick={() => { onChange(s); setOpen(false) }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
                  <PairIcon symbol={s} size={18} /> {s}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {src && <p className="mt-1.5 text-[11.5px] flex items-start gap-1.5" style={{ color: src.ok ? 'var(--text-muted)' : 'var(--negative-red)' }}>{!src.ok && <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}{src.note}</p>}
    </div>
  )
}

export default function NewSessionModal({ strategies = [], onCreate, onClose }) {
  const [f, setF] = useState({
    name: '', description: '', strategy: '', symbol: '',
    start: '', end: '', balance: '10000', leverage: 100, baseTf: '15m', spread: '0',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p) => { setF(s => ({ ...s, ...p })); setErr('') }

  const sym = normaliseSymbol(f.symbol)
  const spec = sym ? getSpec(sym) : null
  const range = f.start && f.end ? { s: new Date(`${f.start}T00:00:00`).getTime() / 1000, e: new Date(`${f.end}T00:00:00`).getTime() / 1000 + 86400 } : null
  const planned = range && range.e > range.s ? plannedCandles(f.baseTf, range.s, range.e) : null
  const tooBig = planned != null && planned > MAX_BASE_CANDLES

  const validate = () => {
    if (!f.name.trim()) return 'Give the session a name.'
    if (!sym || !describeSource(sym)?.ok) return 'Choose a symbol that has a data feed.'
    if (!f.start || !f.end) return 'Pick a start and an end date.'
    if (f.end < f.start) return 'The end date must be on or after the start date.'
    if (f.end > today()) return 'The end date cannot be in the future.'
    if (!(Number(f.balance) > 0)) return 'Starting balance must be greater than zero.'
    if (!(Number(f.spread) >= 0)) return 'Spread cannot be negative.'
    if (tooBig) return `That range needs about ${planned.toLocaleString()} ${f.baseTf} candles (max ${MAX_BASE_CANDLES.toLocaleString()}). Shorten it or pick a coarser precision.`
    return ''
  }

  const submit = async (e) => {
    e.preventDefault()
    const problem = validate()
    if (problem) { setErr(problem); return }
    setBusy(true)
    try {
      await onCreate({
        name: f.name, description: f.description, strategy: f.strategy, symbol: sym, baseTf: f.baseTf,
        startAt: new Date(`${f.start}T00:00:00`).toISOString(),
        endAt: new Date(range.e * 1000).toISOString(),                  // end date is inclusive
        balance: Number(f.balance), leverage: f.leverage,
        spread: Number(f.spread) * (spec?.pipSize || 0),                // entered in pips
      })
    } catch (ex) {
      setErr(ex.message || 'Could not create the session.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onPointerDown={onClose}>
      <form noValidate onSubmit={submit} onPointerDown={(e) => e.stopPropagation()} className="w-full max-w-[460px] rounded-2xl my-auto"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 30px 100px rgba(0,0,0,0.65)' }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h2 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>New Backtest Session</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <Label>Session name *</Label>
            <input autoFocus value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. EURUSD Asia sweep" className={fieldCls} style={fieldStyle} />
          </div>
          <div>
            <Label>Description</Label>
            <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="What are you testing?" className={`${fieldCls} resize-none`} style={fieldStyle} />
          </div>
          <div>
            <Label hint="optional">Strategy</Label>
            <Combo value={f.strategy} onChange={(v) => set({ strategy: v })} options={strategies} placeholder="No strategy" icon={<BookOpen size={14} />} allowCustom customLabel="Create strategy" />
          </div>
          <div>
            <Label>Symbol *</Label>
            <SymbolField value={f.symbol} onChange={(v) => set({ symbol: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date *</Label>
              <input type="date" value={f.start} max={today()} onChange={(e) => set({ start: e.target.value })} className={fieldCls} style={{ ...fieldStyle, colorScheme: 'dark' }} />
            </div>
            <div>
              <Label>End date *</Label>
              <input type="date" value={f.end} min={f.start || undefined} max={today()} onChange={(e) => set({ end: e.target.value })} className={fieldCls} style={{ ...fieldStyle, colorScheme: 'dark' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starting balance *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: 'var(--text-muted)' }}>$</span>
                <input type="number" min={1} step="any" value={f.balance} onChange={(e) => set({ balance: e.target.value })} className={fieldCls} style={{ ...fieldStyle, paddingLeft: 26 }} />
              </div>
            </div>
            <div>
              <Label>Leverage</Label>
              <div className="relative">
                <select value={f.leverage} onChange={(e) => set({ leverage: +e.target.value })} className={`${fieldCls} appearance-none pr-8`} style={fieldStyle}>
                  {LEVERAGE.map(l => <option key={l} value={l}>1:{l}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label hint="finest candle">Replay precision</Label>
              <div className="relative">
                <select value={f.baseTf} onChange={(e) => set({ baseTf: e.target.value })} className={`${fieldCls} appearance-none pr-8`} style={fieldStyle}>
                  {BASE_TFS.map(t => <option key={t} value={t}>{tfLabel(t)} candles</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
            <div>
              <Label hint={spec?.kind === 'forex' ? 'pips' : 'points'}>Spread</Label>
              <input type="number" min={0} step="any" value={f.spread} onChange={(e) => set({ spread: e.target.value })} className={fieldCls} style={fieldStyle} />
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed -mt-1" style={{ color: tooBig ? 'var(--negative-red)' : 'var(--text-muted)' }}>
            {planned != null
              ? `${planned.toLocaleString()} ${f.baseTf} candles will load (including history before the start). Higher timeframes are built from these, so you can switch freely while replaying.`
              : 'Pick the finest candle you want to replay with — 1m is most precise for SL/TP fills but loads the most data.'}
          </p>

          {err && <p className="flex items-start gap-1.5 text-[12.5px] px-3 py-2 rounded-lg" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--negative-red)' }}><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{err}</p>}
        </div>

        <div className="flex justify-end gap-2.5 px-6 pb-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-white/5" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary px-5 py-2 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5 disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Session
          </button>
        </div>
      </form>
    </div>
  )
}