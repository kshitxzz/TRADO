import { useEffect, useRef, useState } from 'react'
import { LayoutTemplate, ChevronDown, Save, Pencil, Trash2, Check, X, Plus } from 'lucide-react'

export default function LayoutMenu({ layouts, activeId, onSave, onUpdate, onLoad, onRename, onDelete }) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const ref = useRef(null)
  const active = layouts.find(l => l.id === activeId)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setNaming(false); setRenaming(null) } }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [open])

  const submitNew = () => {
    const n = name.trim()
    if (!n) return
    onSave(n); setName(''); setNaming(false)
  }
  const field = { background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="h-8 px-2.5 flex items-center gap-1.5 rounded-md text-[12.5px] hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }} title="Chart layouts — save and restore drawings, indicators and timeframe">
        <LayoutTemplate size={15} />
        <span className="max-w-[110px] truncate">{active?.name || 'My Layout'}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-[270px] rounded-xl py-1.5"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 16px 50px rgba(0,0,0,0.55)' }}>
          {active && (
            <button onClick={() => { onUpdate(active); setOpen(false) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
              <Save size={14} style={{ color: 'var(--accent-purple-light)' }} /> Save changes to “{active.name}”
            </button>
          )}
          {naming ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Layout name"
                     onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') setNaming(false); e.stopPropagation() }}
                     className="flex-1 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none" style={field} />
              <button onClick={submitNew} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--positive-green)' }}><Check size={15} /></button>
              <button onClick={() => setNaming(false)} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={15} /></button>
            </div>
          ) : (
            <button onClick={() => setNaming(true)} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>
              <Plus size={14} style={{ color: 'var(--accent-purple-light)' }} /> Save current chart as new layout…
            </button>
          )}

          <div className="my-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          <p className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>Saved layouts</p>
          {layouts.length === 0 && <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>None yet — set up your chart, then save it here.</p>}
          <div className="max-h-[240px] overflow-y-auto">
            {layouts.map(l => (
              <div key={l.id} className="group flex items-center gap-1 px-1.5">
                {renaming === l.id ? (
                  <div className="flex items-center gap-1.5 flex-1 px-1.5 py-1">
                    <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} maxLength={60}
                           onKeyDown={(e) => { if (e.key === 'Enter' && renameVal.trim()) { onRename(l.id, renameVal.trim()); setRenaming(null) } if (e.key === 'Escape') setRenaming(null); e.stopPropagation() }}
                           className="flex-1 rounded-md px-2 py-1 text-[12.5px] outline-none" style={field} />
                    <button onClick={() => { if (renameVal.trim()) { onRename(l.id, renameVal.trim()); setRenaming(null) } }} className="p-1 rounded hover:bg-white/10" style={{ color: 'var(--positive-green)' }}><Check size={14} /></button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { onLoad(l); setOpen(false) }} className="flex-1 min-w-0 text-left px-2 py-2 rounded-md text-[12.5px] hover:bg-white/5 truncate"
                            style={{ color: l.id === activeId ? 'var(--accent-purple-light)' : 'var(--text-primary)' }}>{l.name}</button>
                    <button onClick={() => { setRenaming(l.id); setRenameVal(l.name) }} className="p-1.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100" style={{ color: 'var(--text-muted)' }} title="Rename"><Pencil size={13} /></button>
                    <button onClick={() => onDelete(l)} className="p-1.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100" title="Delete"><Trash2 size={13} style={{ color: 'var(--negative-red)' }} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}