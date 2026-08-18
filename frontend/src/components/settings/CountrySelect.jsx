import { useMemo, useRef, useState, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import * as Flags from 'country-flag-icons/react/3x2'
import { countries as codes } from 'country-flag-icons'

// Build the full country list once — ISO codes ship with the package, and
// Intl.DisplayNames (native to every modern browser) gives us the English
// name per code, so we don't have to hand-maintain a ~200-row name table.
const regionNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null

const COUNTRIES = codes
  .filter(code => /^[A-Z]{2}$/.test(code)) // exclude subdivision codes like GB-ENG, ES-CT, BQ-BO
  .map(code => ({ code, name: regionNames ? regionNames.of(code) : code }))
  .filter(c => c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name))

export default function CountrySelect({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selected = COUNTRIES.find(c => c.name === value || c.code === value)
  const SelectedFlag = selected ? Flags[selected.code] : null

  const filtered = useMemo(() => {
    if (!query) return COUNTRIES
    const q = query.toLowerCase()
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(q))
  }, [query])

  if (disabled) {
    return <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{value || '—'}</span>
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}>
        {SelectedFlag && <SelectedFlag style={{ width: 18, height: 13, borderRadius: 2, flexShrink: 0 }} />}
        {selected?.name || value || 'Select country'}
        <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-30 rounded-xl overflow-hidden shadow-2xl"
             style={{ background: '#19181C', border: '1px solid rgba(255,255,255,0.1)', width: 280 }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <Search size={13} style={{ color: 'var(--text-muted)' }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                   placeholder="Search country..."
                   className="bg-transparent outline-none text-sm flex-1"
                   style={{ color: 'var(--text-primary)' }} />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map(c => {
              const Flag = Flags[c.code]
              const isSel = c.name === selected?.name
              return (
                <button key={c.code} type="button"
                        onClick={() => { onChange(c.name); setOpen(false); setQuery('') }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm"
                        style={{ background: isSel ? 'rgba(59,130,246,0.12)' : 'transparent', color: isSel ? '#3B82F6' : 'var(--text-secondary)' }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}>
                  {Flag && <Flag style={{ width: 18, height: 13, borderRadius: 2, flexShrink: 0 }} />}
                  {c.name}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No countries found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}