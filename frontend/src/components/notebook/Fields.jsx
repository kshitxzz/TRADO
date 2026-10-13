import { useRef, useState, useEffect, memo } from 'react'
import {
  ArrowUp, ArrowDown, Trash2, Plus, Check, X, Type, AlignLeft, Hash, ChevronDown, Star,
  ListChecks, Calendar, FileText, Settings2, Scale, AlertTriangle,
} from 'lucide-react'
import { Dropdown, Menu, MenuItem } from './ui'
import { RichTextArea } from './RichTextEditor'
import { FIELD_TYPES, fieldTypeLabel, makeField, newId } from '../../data/notebookTemplates'
import { sanitizeHtml, isFieldEmpty, computeRR, formatRR } from '../../lib/notebook'

const TYPE_ICON = {
  text: Type, textarea: AlignLeft, number: Hash, select: ChevronDown, rating: Star,
  checklist: ListChecks, date: Calendar, richtext: FileText, rr: Scale,
}

const SHORT_TYPES = new Set(['text', 'number', 'date', 'select', 'rating', 'rr'])

function fmtDateValue(v) {
  if (!v) return ''
  const d = new Date(`${v}T00:00:00`)
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW MODE
// ═════════════════════════════════════════════════════════════════════════════
const Muted = ({ children = '—' }) => <span className="italic" style={{ color: 'var(--text-muted)' }}>{children}</span>

function ValueView({ field, fields, onToggleItem }) {
  const v = field.value
  switch (field.type) {
    case 'rr': {
      const rr = computeRR(fields)
      if (!rr) return <Muted>Add entry, stop loss and take profit</Muted>
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-bold" style={{ color: rr.sideOk ? 'var(--positive-green-bright)' : 'var(--warning-orange)' }}>{formatRR(rr)}</span>
          {!rr.sideOk && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--warning-orange)' }}>
              <AlertTriangle size={12} /> Stop and target should be on opposite sides of entry
            </span>
          )}
        </div>
      )
    }
    case 'rating': {
      if (!v) return <Muted />
      return (
        <div className="flex items-center gap-2" aria-label={`${v} out of 10`}>
          <div className="flex gap-[3px]">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className="h-2 w-2.5 rounded-sm"
                    style={{ background: i < v ? 'var(--accent-purple)' : 'var(--nb-tile)' }} />
            ))}
          </div>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{v}<span style={{ color: 'var(--text-muted)' }}>/10</span></span>
        </div>
      )
    }
    case 'checklist': {
      const items = (v || []).filter(i => i.text)
      if (!items.length) return <Muted />
      const done = items.filter(i => i.done).length
      return (
        <div>
          <ul className="space-y-1.5">
            {items.map(i => (
              <li key={i.id}>
                <button type="button" onClick={() => onToggleItem?.(field.id, i.id)} disabled={!onToggleItem}
                        className="flex items-start gap-2.5 text-left w-full group" style={{ cursor: onToggleItem ? 'pointer' : 'default' }}>
                  <span className={`nb-checkbox mt-px ${i.done ? 'on' : ''}`}>{i.done && <Check size={12} strokeWidth={3} />}</span>
                  <span className="text-[13.5px] leading-snug"
                        style={{ color: i.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: i.done ? 'line-through' : 'none' }}>{i.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>{done} of {items.length} done</p>
        </div>
      )
    }
    case 'richtext': {
      if (isFieldEmpty(field)) return <Muted />
      return <div className="nb-rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(v) }} />
    }
    case 'textarea':
      return v ? <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{v}</p> : <Muted />
    case 'date':
      return v ? <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{fmtDateValue(v)}</span> : <Muted />
    default:
      return v !== '' && v != null
        ? <span className="text-[14px] font-medium break-words" style={{ color: 'var(--text-primary)' }}>{String(v)}</span>
        : <Muted />
  }
}

// A note's fields in read-only form. Runs of short fields sit in a 2-column
// grid; long ones (text areas, rich text, checklists) take the full width.
export function FieldsView({ fields, onToggleItem }) {
  const groups = []
  for (const f of fields) {
    const short = SHORT_TYPES.has(f.type)
    const last = groups[groups.length - 1]
    if (short && last?.short) last.items.push(f)
    else groups.push({ short, items: [f] })
  }

  const Label = ({ f }) => (
    <p className="text-[10.5px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{f.label || 'Untitled field'}</p>
  )

  return (
    <div className="space-y-5">
      {groups.map((g, gi) => g.short ? (
        <div key={gi} className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {g.items.map(f => (
            <div key={f.id} className="min-w-0">
              <Label f={f} />
              <ValueView field={f} fields={fields} />
            </div>
          ))}
        </div>
      ) : g.items.map(f => (
        <div key={f.id}>
          <Label f={f} />
          <ValueView field={f} fields={fields} onToggleItem={onToggleItem} />
        </div>
      )))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// EDIT MODE
// ═════════════════════════════════════════════════════════════════════════════
function OptionsEditor({ options, onCommit }) {
  const [text, setText] = useState((options || []).join(', '))
  useEffect(() => { setText((options || []).join(', ')) }, [options])
  const commit = () => {
    const next = Array.from(new Set(text.split(',').map(s => s.trim()).filter(Boolean)))
    if (next.length) onCommit(next)
    else setText((options || []).join(', '))
  }
  return (
    <div className="mt-2.5">
      <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Options (comma separated)</label>
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
             onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
             className="nb-field w-full rounded-lg px-3 py-2 text-[12.5px]" />
    </div>
  )
}

function ChecklistEditor({ items, onChange }) {
  const refs = useRef({})
  const [focusId, setFocusId] = useState(null)
  useEffect(() => { if (focusId && refs.current[focusId]) { refs.current[focusId].focus(); setFocusId(null) } }, [focusId, items])

  const update = (id, patch) => onChange(items.map(i => i.id === id ? { ...i, ...patch } : i))
  const add = () => { const id = newId('i'); onChange([...items, { id, text: '', done: false }]); setFocusId(id) }

  return (
    <div className="space-y-1.5">
      {items.map(i => (
        <div key={i.id} className="flex items-center gap-2.5">
          <button type="button" onClick={() => update(i.id, { done: !i.done })} aria-pressed={i.done} aria-label={i.done ? 'Mark not done' : 'Mark done'}
                  className={`nb-checkbox ${i.done ? 'on' : ''}`}>{i.done && <Check size={12} strokeWidth={3} />}</button>
          <input ref={el => { refs.current[i.id] = el }} value={i.text} onChange={(e) => update(i.id, { text: e.target.value })}
                 placeholder="List item"
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') { e.preventDefault(); add() }
                   if (e.key === 'Backspace' && !i.text) { e.preventDefault(); onChange(items.filter(x => x.id !== i.id)) }
                 }}
                 className="nb-field flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px]" />
          <button type="button" onClick={() => onChange(items.filter(x => x.id !== i.id))} className="nb-icon-btn danger" aria-label="Remove item"><X size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-1 py-1 nb-accent-text hover:opacity-80">
        <Plus size={13} /> Add item
      </button>
    </div>
  )
}

function FieldInput({ field, fields, onChange }) {
  const v = field.value
  const base = 'nb-field w-full rounded-lg px-3 py-2.5 text-[13.5px]'
  switch (field.type) {
    case 'text':
      return <input value={v ?? ''} onChange={(e) => onChange({ value: e.target.value })} placeholder={field.placeholder || ''} className={base} />
    case 'number':
      return <input type="number" inputMode="decimal" step="any" value={v ?? ''} onChange={(e) => onChange({ value: e.target.value })} placeholder={field.placeholder || '0'} className={base} />
    case 'date':
      return <input type="date" value={v ?? ''} onChange={(e) => onChange({ value: e.target.value })} className={base} />
    case 'textarea':
      return <textarea rows={3} value={v ?? ''} onChange={(e) => onChange({ value: e.target.value })} placeholder={field.placeholder || ''} className={base} />
    case 'select': {
      const opts = (field.options || []).map(o => ({ value: o, label: o }))
      return (
        <>
          <Dropdown value={v || ''} options={[{ value: '', label: '— None —' }, ...opts]} placeholder="Select…" onChange={(val) => onChange({ value: val })} />
        </>
      )
    }
    case 'rating':
      return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={field.label}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" role="radio" aria-checked={v === n}
                    onClick={() => onChange({ value: v === n ? 0 : n })}
                    className={`nb-rate ${v >= n ? 'on' : ''}`}>{n}</button>
          ))}
        </div>
      )
    case 'checklist':
      return <ChecklistEditor items={v || []} onChange={(items) => onChange({ value: items })} />
    case 'richtext':
      return <RichTextArea value={v || ''} placeholder={field.placeholder || 'Start writing…'} onChange={(html) => onChange({ value: html })} minHeight={120} />
    case 'rr': {
      const rr = computeRR(fields)
      return rr
        ? <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold" style={{ color: rr.sideOk ? 'var(--positive-green-bright)' : 'var(--warning-orange)' }}>{formatRR(rr)}</span>
            {!rr.sideOk && <span className="text-[11px]" style={{ color: 'var(--warning-orange)' }}>Stop and target should be on opposite sides of entry</span>}
          </div>
        : <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Calculated automatically once entry, stop loss and take profit are filled in.</p>
    }
    default: return null
  }
}

// One editable field: rename it, fill it in, reorder it, or remove it.
export const FieldEditor = memo(function FieldEditor({ field, fields, index, total, onChange, onMove, onRemove, autoFocusLabel }) {
  const Icon = TYPE_ICON[field.type] || Type
  const [optsOpen, setOptsOpen] = useState(false)
  const labelRef = useRef(null)
  useEffect(() => { if (autoFocusLabel) { labelRef.current?.focus(); labelRef.current?.select() } }, [autoFocusLabel])

  return (
    <div className="nb-field-card p-3.5 sm:p-4" data-field-id={field.id}>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={14} className="flex-shrink-0" style={{ color: 'var(--accent-purple-light)' }} />
        <input ref={labelRef} value={field.label} onChange={(e) => onChange({ label: e.target.value })}
               placeholder="Field name" aria-label="Field name" maxLength={80}
               className="flex-1 min-w-0 bg-transparent outline-none text-[12px] font-bold uppercase tracking-wide rounded px-1 py-0.5 focus:bg-[var(--nb-hover)]"
               style={{ color: 'var(--text-secondary)' }} />
        <span className="hidden sm:inline text-[10.5px] px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--nb-tile)', color: 'var(--text-muted)' }}>{fieldTypeLabel(field.type)}</span>
        {field.type === 'select' && (
          <button type="button" onClick={() => setOptsOpen(o => !o)} className={`nb-icon-btn ${optsOpen ? 'nb-accent-text' : ''}`} title="Edit options" aria-label="Edit options">
            <Settings2 size={14} />
          </button>
        )}
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="nb-icon-btn" aria-label="Move up" title="Move up"><ArrowUp size={14} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="nb-icon-btn" aria-label="Move down" title="Move down"><ArrowDown size={14} /></button>
        <button type="button" onClick={onRemove} className="nb-icon-btn danger" aria-label="Remove field" title="Remove field"><Trash2 size={14} /></button>
      </div>
      <FieldInput field={field} fields={fields} onChange={onChange} />
      {field.type === 'select' && optsOpen && (
        <OptionsEditor options={field.options}
                       onCommit={(options) => onChange({ options, value: options.includes(field.value) ? field.value : '' })} />
      )}
    </div>
  )
})

// "Add field" — pick a type from a themed menu.
export function AddFieldButton({ onAdd }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
              className="nb-btn nb-btn-soft w-full" style={{ borderStyle: 'dashed', padding: '12px 16px' }}>
        <Plus size={15} /> Add field
      </button>
      <Menu open={open} anchorRef={ref} onClose={() => setOpen(false)} width={260} align="left">
        {FIELD_TYPES.map(t => (
          <MenuItem key={t.type} icon={TYPE_ICON[t.type]} onClick={() => { setOpen(false); onAdd(makeField(t.type)) }}
                    trailing={<span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{t.hint}</span>}>
            {t.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}