import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Pencil, Calendar, Clock, FileText, CircleCheck, ChevronRight, ChevronLeft, Sparkles, Save, X,
} from 'lucide-react'
import { FieldsView, FieldEditor, AddFieldButton } from './Fields'
import { RichTextToolbar, RichTextArea } from './RichTextEditor'
import { NoteMenu } from './Panels'
import { ConfirmDialog } from './ui'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import { templateName } from '../../data/notebookTemplates'
import { shortDate, isFieldEmpty, isNoteEmpty, deepClone, sameContent } from '../../lib/notebook'

function StatTile({ icon: Icon, tint, label, value }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl min-w-0"
         style={{ background: 'var(--nb-field-bg)', border: '1px solid var(--border-subtle)' }}>
      <span className="nb-tile w-10 h-10 rounded-xl" style={{ background: `${tint}22` }}><Icon size={17} style={{ color: tint }} /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}

function MetaLine({ note }) {
  const { fmtDateTime } = useTimeFormat()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      <span className="inline-flex items-center gap-1.5"><Calendar size={12} />Created {fmtDateTime(note.created_at)}</span>
      <span className="inline-flex items-center gap-1.5"><Clock size={12} />Updated {fmtDateTime(note.updated_at)}</span>
    </div>
  )
}

export default function NoteDetail({
  note, folder, folders, editing, onStartEdit, onStopEdit, onSave, onDirtyChange, onBack,
  menuHandlers, onToggleItem,
}) {
  const [draft, setDraft] = useState(() => (editing ? { title: note.title, fields: deepClone(note.fields) } : null))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const [newFieldId, setNewFieldId]   = useState(null)
  const titleRef = useRef(null)
  const scrollRef = useRef(null)

  // Entering edit mode takes a fresh working copy of the note.
  useEffect(() => {
    if (editing) { setDraft({ title: note.title, fields: deepClone(note.fields) }); setError('') }
    else setDraft(null)
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(
    () => !!editing && !!draft && !sameContent({ t: draft.title, f: draft.fields }, { t: note.title, f: note.fields }),
    [editing, draft, note],
  )
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirtyChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Browser-level guard for tab close / reload with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const handleSave = useCallback(async () => {
    if (!draft || saving) return
    if (!draft.title.trim()) { setError('Give this note a title before saving.'); titleRef.current?.focus(); return }
    setSaving(true); setError('')
    const res = await onSave({ title: draft.title, fields: draft.fields })
    setSaving(false)
    if (res?.error) setError(res.error)
  }, [draft, saving, onSave])

  // Ctrl/Cmd + S saves while editing.
  useEffect(() => {
    if (!editing) return
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [editing, handleSave])

  function requestCancel() {
    if (dirty) setDiscardOpen(true)
    else onStopEdit()
  }

  const patchField = (id, patch) => setDraft(d => ({ ...d, fields: d.fields.map(f => f.id === id ? { ...f, ...patch } : f) }))
  const moveField = (idx, dir) => setDraft(d => {
    const fields = [...d.fields]; const j = idx + dir
    if (j < 0 || j >= fields.length) return d
    ;[fields[idx], fields[j]] = [fields[j], fields[idx]]
    return { ...d, fields }
  })
  const removeField = (id) => setDraft(d => ({ ...d, fields: d.fields.filter(f => f.id !== id) }))
  const addField = (f) => {
    setDraft(d => ({ ...d, fields: [...d.fields, f] }))
    setNewFieldId(f.id)
    requestAnimationFrame(() => setTimeout(() => {
      document.querySelector(`[data-field-id="${f.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 30))
  }

  const hasRich = !!draft?.fields.some(f => f.type === 'richtext')
  // A plain blank note is just one big writing surface — no field chrome.
  const bare = !!draft && note.template_id === 'blank' && draft.fields.length === 1 && draft.fields[0].type === 'richtext'
  const emptyCount = note.fields.filter(isFieldEmpty).filter(f => f.type !== 'rr').length
  const userFieldCount = note.fields.filter(f => f.type !== 'rr').length
  const noteEmpty = isNoteEmpty(note.fields)
  const doneStatus = note.status === 'completed'

  const BackBtn = (
    <button onClick={() => (editing ? requestCancel() : onBack())} className="md:!hidden nb-icon-btn -ml-1" aria-label="Back to notes" style={{ width: 32, height: 32 }}>
      <ChevronLeft size={20} />
    </button>
  )

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  if (editing && draft) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <header className="px-5 sm:px-7 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-start gap-3">
            {BackBtn}
            <div className="flex-1 min-w-0">
              <input ref={titleRef} value={draft.title} onChange={(e) => { setDraft(d => ({ ...d, title: e.target.value })); setError('') }}
                     maxLength={160} aria-label="Note title" placeholder="Note title"
                     className="w-full bg-transparent outline-none text-[22px] font-extrabold leading-tight rounded-lg px-2 -mx-2 py-1 focus:bg-[var(--nb-hover)]"
                     style={{ color: 'var(--text-primary)' }} />
              <div className="mt-1.5"><MetaLine note={note} /></div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={requestCancel} disabled={saving} className="nb-btn nb-btn-ghost" style={{ padding: '8px 12px' }}>
                <X size={14} /> <span className="hidden sm:inline">Cancel</span>
              </button>
              <button onClick={handleSave} disabled={saving || !dirty} className="nb-btn nb-btn-primary" title="Save (Ctrl+S)">
                <Save size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {error && <p className="text-[12px] mt-2" style={{ color: 'var(--negative-red)' }} role="alert">{error}</p>}
        </header>

        {hasRich && <div className="flex-shrink-0"><RichTextToolbar /></div>}
        {!hasRich && <div className="flex-shrink-0 h-px" style={{ background: 'var(--border-subtle)' }} />}

        <div ref={scrollRef} className="nb-scroll flex-1 min-h-0 px-5 sm:px-7 py-5">
          <div className="max-w-3xl mx-auto space-y-3.5 pb-8">
            {draft.fields.length === 0 && (
              <p className="text-center text-[13px] py-6" style={{ color: 'var(--text-muted)' }}>This note has no fields yet. Add one below to get started.</p>
            )}
            {bare && (
              <div className="nb-field-card px-5 py-4">
                <RichTextArea value={draft.fields[0].value} placeholder="Start writing…" minHeight={380} autoFocus
                              onChange={(html) => patchField(draft.fields[0].id, { value: html })} />
              </div>
            )}
            {!bare && draft.fields.map((f, i) => (
              <FieldEditor key={f.id} field={f} fields={draft.fields} index={i} total={draft.fields.length}
                           autoFocusLabel={f.id === newFieldId}
                           onChange={(patch) => patchField(f.id, patch)} onMove={(dir) => moveField(i, dir)} onRemove={() => removeField(f.id)} />
            ))}
            <AddFieldButton onAdd={addField} />
          </div>
        </div>

        <ConfirmDialog open={discardOpen} danger title="Discard your changes?"
                       message="You have unsaved edits to this note. If you leave now they will be lost."
                       confirmLabel="Discard changes" cancelLabel="Keep editing"
                       onCancel={() => setDiscardOpen(false)}
                       onConfirm={() => { setDiscardOpen(false); onStopEdit() }} />
      </div>
    )
  }

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-5 sm:px-7 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-start gap-3">
          {BackBtn}
          <div className="flex-1 min-w-0">
            <nav className="flex items-center gap-1.5 text-[11px] mb-1.5 min-w-0" aria-label="Breadcrumb" style={{ color: 'var(--text-muted)' }}>
              <span className="truncate">{folder ? folder.name : 'Unfiled'}</span>
              <ChevronRight size={11} className="flex-shrink-0" />
              <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{note.title}</span>
            </nav>
            <h1 className="text-[24px] font-extrabold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{note.title}</h1>
            <div className="mt-2"><MetaLine note={note} /></div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <NoteMenu note={note} folders={folders} {...menuHandlers} />
            <button onClick={onStartEdit} className="nb-btn nb-btn-primary"><Pencil size={14} /> Edit</button>
          </div>
        </div>
      </header>

      <div className="nb-scroll flex-1 min-h-0 px-5 sm:px-7 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[24px] p-5 sm:p-7"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset' }}>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              <StatTile icon={FileText} tint="#3B82F6" label="Type" value={templateName(note.template_id)} />
              <StatTile icon={CircleCheck} tint={doneStatus ? '#3B82F6' : '#22C55E'} label="Status" value={doneStatus ? 'Completed' : 'Active'} />
              <StatTile icon={Calendar} tint="#F59E0B" label="Created" value={shortDate(note.created_at)} />
              <StatTile icon={Clock} tint="#3B82F6" label="Updated" value={shortDate(note.updated_at)} />
            </div>

            <div className="h-px my-6" style={{ background: 'var(--border-subtle)' }} />

            <div className="flex items-center gap-2 mb-4">
              <span className="w-[3px] h-4 rounded-full" style={{ background: 'var(--accent-purple)' }} />
              <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Content</h2>
            </div>

            {noteEmpty && note.fields.length <= 1 ? (
              <p className="italic text-[14px] py-1" style={{ color: 'var(--text-muted)' }}>No content yet. Click Edit to add content.</p>
            ) : (
              <FieldsView fields={note.fields} onToggleItem={onToggleItem} />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button onClick={onStartEdit} className="nb-btn nb-btn-soft"><Pencil size={14} /> Edit Note</button>
            {emptyCount > 0 && (
              <span className="inline-flex items-center gap-2 text-[12px] px-3.5 py-2 rounded-full"
                    style={{ background: 'var(--nb-field-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <Sparkles size={13} style={{ color: '#F59E0B' }} />
                {emptyCount === userFieldCount
                  ? 'Tip: Add details to make this note more useful'
                  : `Tip: ${emptyCount} field${emptyCount === 1 ? '' : 's'} still empty. Fill ${emptyCount === 1 ? 'it' : 'them'} in to complete this note`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}