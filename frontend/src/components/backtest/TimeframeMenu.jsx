import { useRef, useState } from 'react'
import { ChevronDown, Star, Database } from 'lucide-react'
import Popover from './Popover'
import { TF_PRESETS, TF_UNITS, baseFor, isValidTf, tfLabel, tfName, tfSecs, tfKey } from '../../lib/backtest/data'

const MAX_SECS = 366 * 86400

function Chip({ active, onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} className="h-8 min-w-8 px-2 flex items-center justify-center rounded-md text-[12.5px] font-medium transition-colors hover:bg-white/10"
            style={{ color: active ? 'var(--accent-purple-light)' : 'var(--text-secondary)', background: active ? 'rgba(139,92,246,0.15)' : undefined }}>
      {children}
    </button>
  )
}

export default function TimeframeMenu({ value, onChange, baseTf, favorites, onFavorites, recentCustom, onRecentCustom }) {
  const [open, setOpen] = useState(false)
  const [n, setN] = useState('')
  const [unit, setUnit] = useState('m')
  const [err, setErr] = useState('')
  const anchor = useRef(null)

  const strip = [...favorites].filter(isValidTf)
  if (!strip.includes(value)) strip.push(value)
  strip.sort((a, b) => tfSecs(a) - tfSecs(b))

  const pick = (k) => { setOpen(false); setErr(''); if (k !== value) onChange(k) }
  const toggleFav = (k) => onFavorites(favorites.includes(k) ? favorites.filter(x => x !== k) : [...favorites, k])
  const needsData = (k) => baseFor(k, baseTf) !== baseTf

  const applyCustom = () => {
    const num = parseInt(n, 10)
    if (!Number.isFinite(num) || num < 1) { setErr('Enter a whole number, 1 or more.'); return }
    if (num > 999) { setErr('Use a number up to 999.'); return }
    const key = tfKey(num, unit)
    if (tfSecs(key) > MAX_SECS) { setErr('The longest interval is 1 year.'); return }
    if (!baseFor(key, baseTf)) { setErr('That interval can’t be built from the available data.'); return }
    if (!TF_PRESETS.some(g => g.keys.includes(key))) onRecentCustom([key, ...recentCustom.filter(x => x !== key)].slice(0, 6))
    setN(''); pick(key)
  }

  const Row = ({ k }) => (
    <div className="group flex items-center gap-1 px-1.5">
      <button onClick={() => pick(k)} className="flex-1 min-w-0 flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12.5px] hover:bg-white/5"
              style={{ color: k === value ? 'var(--accent-purple-light)' : 'var(--text-primary)' }}>
        <span className="flex-1">{tfName(k)}</span>
        {needsData(k) && <span title={`Loads ${tfLabel(baseFor(k, baseTf))} candles once so this interval is exact`} className="flex items-center"><Database size={11} style={{ color: 'var(--text-muted)' }} /></span>}
      </button>
      <button onClick={() => toggleFav(k)} title={favorites.includes(k) ? 'Remove from toolbar' : 'Pin to toolbar'}
              className={`p-1.5 rounded hover:bg-white/10 ${favorites.includes(k) ? '' : 'opacity-0 group-hover:opacity-100'}`}>
        <Star size={13} fill={favorites.includes(k) ? '#F59E0B' : 'none'} style={{ color: favorites.includes(k) ? '#F59E0B' : 'var(--text-muted)' }} />
      </button>
    </div>
  )

  const field = { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

  return (
    <div className="flex items-center">
      {strip.map(k => <Chip key={k} active={k === value} onClick={() => pick(k)} title={tfName(k)}>{tfLabel(k)}</Chip>)}
      <div ref={anchor}>
        <button onClick={() => setOpen(o => !o)} title="All timeframes · custom interval" className="h-8 w-7 flex items-center justify-center rounded-md hover:bg-white/10"
                style={{ color: open ? 'var(--accent-purple-light)' : 'var(--text-secondary)' }}><ChevronDown size={15} /></button>
      </div>

      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} style={{ width: 272 }}>
        <div className="py-1.5">
          {TF_PRESETS.map(g => (
            <div key={g.title}>
              <p className="px-3.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{g.title}</p>
              {g.keys.map(k => <Row key={k} k={k} />)}
            </div>
          ))}

          {recentCustom.length > 0 && (
            <div>
              <p className="px-3.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>Your intervals</p>
              {recentCustom.map(k => <Row key={k} k={k} />)}
            </div>
          )}

          <div className="mx-3 mt-2 pt-3 pb-1.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-[10px] font-semibold tracking-wider uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>Custom interval</p>
            <div className="flex gap-1.5">
              <input value={n} inputMode="numeric" placeholder="e.g. 7" onChange={(e) => { setN(e.target.value.replace(/\D/g, '').slice(0, 3)); setErr('') }}
                     onKeyDown={(e) => { if (e.key === 'Enter') applyCustom(); e.stopPropagation() }}
                     className="w-[72px] rounded-md px-2.5 py-1.5 text-[12.5px] outline-none" style={field} />
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className="flex-1 rounded-md px-2 py-1.5 text-[12.5px] outline-none" style={field}>
                {TF_UNITS.map(u => <option key={u.unit} value={u.unit}>{u.label}</option>)}
              </select>
              <button onClick={applyCustom} className="btn-primary px-3 rounded-md text-[12px] font-semibold text-white">Apply</button>
            </div>
            {err && <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--negative-red)' }}>{err}</p>}
            <p className="mt-2 text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              <Database size={10} className="inline -mt-0.5 mr-1" />Intervals finer than your replay precision load finer candles once, then switch instantly.
            </p>
          </div>
        </div>
      </Popover>
    </div>
  )
}