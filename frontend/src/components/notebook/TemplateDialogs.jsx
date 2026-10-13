import { useEffect, useMemo, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { Modal, Dropdown, TemplateIcon } from './ui'
import { NOTE_TEMPLATES, TEMPLATE_CATEGORIES, getTemplate } from '../../data/notebookTemplates'

const countLabel = (n) => `${n} field${n === 1 ? '' : 's'}`

// Cached so each template's field count is computed once, not on every render.
const FIELD_COUNTS = Object.fromEntries(NOTE_TEMPLATES.map(t => [t.id, t.build().length]))

// ── "Choose a Template" ──────────────────────────────────────────────────────
export function TemplatePicker({ open, onClose, onPick }) {
  const groups = useMemo(() => TEMPLATE_CATEGORIES
    .map(c => ({ ...c, items: NOTE_TEMPLATES.filter(t => t.category === c.id) }))
    .filter(g => g.items.length), [])

  return (
    <Modal open={open} onClose={onClose} width={620} label="Choose a template">
      {/* Accent line across the top edge */}
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #6D28D9 0%, #8B5CF6 35%, #22D3EE 70%, #34D399 100%)' }} />
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="nb-tile w-10 h-10" style={{ background: 'rgba(139,92,246,0.16)' }}>
          <Sparkles size={18} style={{ color: 'var(--accent-purple-light)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Choose a Template</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Start with a pre-built structure for your notes</p>
        </div>
        <button onClick={onClose} className="nb-icon-btn" aria-label="Close"><X size={17} /></button>
      </div>

      <div className="nb-scroll px-5 py-4 space-y-5" style={{ maxHeight: 'min(62vh, 520px)' }}>
        {groups.map(g => (
          <section key={g.id}>
            <h3 className="text-[13px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{g.label}</h3>
            <p className="text-[11px] mb-2.5" style={{ color: 'var(--text-muted)' }}>{g.sub}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {g.items.map(t => (
                <button key={t.id} type="button" onClick={() => onPick(t.id)}
                        className="nb-template-card flex items-start gap-3 p-3.5 rounded-xl"
                        style={{ background: `${t.color}14`, border: `1px solid ${t.color}33` }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${t.color}88`; e.currentTarget.style.boxShadow = `0 8px 22px ${t.color}22` }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${t.color}33`; e.currentTarget.style.boxShadow = 'none' }}>
                  <div className="nb-tile w-9 h-9" style={{ background: `${t.color}26` }}>
                    <TemplateIcon name={t.icon} size={16} style={{ color: t.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                    <p className="text-[11.5px] leading-snug mt-1" style={{ color: 'var(--text-secondary)' }}>{t.description}</p>
                    <p className="text-[10.5px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{countLabel(FIELD_COUNTS[t.id])}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}

// ── "New <Template>" — name it, pick the folder, create ──────────────────────
export function NewNoteDialog({ open, templateId, folders, defaultFolderId, onClose, onCreate }) {
  const tpl = getTemplate(templateId)
  const [title, setTitle]   = useState('')
  const [folderId, setFolderId] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  // Reset every time the dialog opens for a (possibly different) template.
  useEffect(() => {
    if (!open) return
    setTitle(''); setError(''); setBusy(false)
    setFolderId(defaultFolderId || folders[0]?.id || '')
  }, [open, templateId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fieldPreview = useMemo(() => {
    if (!tpl || tpl.id === 'blank') return ''
    const labels = tpl.build().map(f => f.label)
    return labels.slice(0, 5).join(' · ') + (labels.length > 5 ? ` · +${labels.length - 5} more` : '')
  }, [tpl])

  async function submit(e) {
    e?.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true); setError('')
    const res = await onCreate({ title, folderId: folderId || null, templateId })
    if (res?.error) { setError(res.error); setBusy(false) }
  }

  const folderOptions = [{ value: '', label: 'No folder' }, ...folders.map(f => ({ value: f.id, label: f.name }))]

  return (
    <Modal open={open && !!tpl} onClose={busy ? undefined : onClose} width={420} label={tpl ? `New ${tpl.name}` : 'New note'}>
      <form onSubmit={submit} className="p-5">
        <div className="flex items-center gap-3 mb-4">
          {tpl && (
            <div className="nb-tile w-9 h-9" style={{ background: `${tpl.color}26` }}>
              <TemplateIcon name={tpl.icon} size={16} style={{ color: tpl.color }} />
            </div>
          )}
          <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>New {tpl?.name}</h3>
        </div>

        {fieldPreview && (
          <p className="text-[11.5px] leading-relaxed mb-4 -mt-1" style={{ color: 'var(--text-muted)' }}>
            Comes pre-filled with: {fieldPreview}. You can add, rename or remove fields afterwards.
          </p>
        )}

        <label htmlFor="nb-new-title" className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Note Title</label>
        <input id="nb-new-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160}
               placeholder={tpl ? tpl.titleHint() : 'Enter note title…'}
               className="nb-field w-full rounded-lg px-3 py-2.5 text-[13.5px]" />

        <div className="flex items-center gap-2.5 mt-3.5">
          <span className="text-[12px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Folder:</span>
          <div className="flex-1 min-w-0">
            <Dropdown size="sm" value={folderId} options={folderOptions} onChange={setFolderId} ariaLabel="Folder" />
          </div>
        </div>

        {error && <p className="text-[12px] mt-3" style={{ color: 'var(--negative-red)' }} role="alert">{error}</p>}

        <div className="flex gap-2.5 mt-5">
          <button type="button" onClick={onClose} disabled={busy} className="nb-btn nb-btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={!title.trim() || busy} className="nb-btn nb-btn-primary flex-1">{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  )
}