import { useRef, useState, useEffect } from 'react'
import {
  FolderPlus, Folder, FileText, MoreHorizontal, Check, Plus, Search, Pin, Copy, Trash2,
  Pencil, FolderInput, CircleCheck, RotateCcw, X, PinOff, FolderOpen,
} from 'lucide-react'
import { Menu, MenuItem, MenuDivider, MenuLabel } from './ui'
import { notePreview, relativeDay } from '../../lib/notebook'

// ═════════════════════════════════════════════════════════════════════════════
// Folders
// ═════════════════════════════════════════════════════════════════════════════
function FolderRow({ icon: Icon, name, count, active, onClick, menu }) {
  return (
    <div className={`nb-row group flex items-center gap-3 px-3 py-2.5 rounded-xl ${active ? 'selected' : ''}`}
         onClick={onClick} role="button" tabIndex={0} aria-current={active ? 'true' : undefined}
         onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}>
      <span className="nb-tile w-8 h-8" style={active ? { background: 'rgba(139,92,246,0.22)' } : undefined}>
        <Icon size={15} className={active ? 'nb-accent-text' : ''} style={active ? undefined : { color: 'var(--text-secondary)' }} />
      </span>
      <span className={`flex-1 min-w-0 truncate text-[13.5px] font-medium ${active ? 'nb-accent-text' : ''}`}
            style={active ? undefined : { color: 'var(--text-primary)' }} title={name}>{name}</span>
      {menu}
      <span className="text-[12px] tabular-nums flex-shrink-0 min-w-[14px] text-right" style={{ color: 'var(--text-muted)' }}>{count}</span>
    </div>
  )
}

function FolderMenu({ onRename, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  return (
    <>
      <button ref={ref} onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }} aria-label="Folder options" aria-haspopup="menu"
              className={`nb-icon-btn nb-row-more ${open ? 'open' : ''}`} style={{ width: 24, height: 24 }}>
        <MoreHorizontal size={15} />
      </button>
      <Menu open={open} anchorRef={ref} onClose={() => setOpen(false)} width={170}>
        <MenuItem icon={Pencil} onClick={(e) => { e.stopPropagation(); setOpen(false); onRename() }}>Rename</MenuItem>
        <MenuItem icon={Trash2} danger onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete() }}>Delete folder</MenuItem>
      </Menu>
    </>
  )
}

export function FolderPanel({ folders, counts, totalCount, selected, onSelect, onCreate, onRename, onDelete, className = '', style }) {
  const [adding, setAdding] = useState(false)
  const [name, setName]     = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal]   = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitNew() {
    if (!name.trim() || busy) return
    setBusy(true); setErr('')
    const res = await onCreate(name)
    setBusy(false)
    if (res?.error) { setErr(res.error); return }
    setName(''); setAdding(false)
  }
  async function submitRename(id) {
    const val = renameVal.trim()
    if (!val) { setRenamingId(null); return }
    const current = folders.find(f => f.id === id)
    if (current && current.name === val) { setRenamingId(null); return }
    const res = await onRename(id, val)
    if (res?.error) { setErr(res.error); return }
    setRenamingId(null)
  }

  return (
    <aside className={`flex flex-col min-h-0 ${className}`} style={style} aria-label="Folders">
      <div className="flex items-center justify-between px-5 h-14 flex-shrink-0">
        <h2 className="text-[13.5px] font-bold" style={{ color: 'var(--text-primary)' }}>Folders</h2>
        <button onClick={() => { setAdding(a => !a); setErr('') }} className={`nb-icon-btn ${adding ? 'nb-accent-text' : ''}`}
                aria-label="New folder" title="New folder" aria-expanded={adding}>
          <FolderPlus size={17} className="nb-accent-text" />
        </button>
      </div>

      {adding && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr('') }} maxLength={60}
                   onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); if (e.key === 'Escape') { setAdding(false); setName('') } }}
                   placeholder="New Folder" aria-label="New folder name"
                   className="nb-field flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px]" />
            <button onClick={submitNew} disabled={!name.trim() || busy} aria-label="Create folder"
                    className="nb-btn nb-btn-soft" style={{ padding: 0, width: 34, height: 34, borderRadius: 9 }}>
              <Check size={15} />
            </button>
          </div>
          {err && <p className="text-[11px] mt-1.5 px-1" style={{ color: 'var(--negative-red)' }} role="alert">{err}</p>}
        </div>
      )}

      <div className="nb-scroll flex-1 min-h-0 px-2.5 pb-3">
        <FolderRow icon={FileText} name="All Notes" count={totalCount} active={selected === 'all'} onClick={() => onSelect('all')} />
        <div className="h-px mx-3 my-2" style={{ background: 'var(--border-subtle)' }} />
        <div className="space-y-0.5">
          {folders.map(f => renamingId === f.id ? (
            <div key={f.id} className="px-1.5 py-1">
              <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} maxLength={60} aria-label="Rename folder"
                     onBlur={() => submitRename(f.id)}
                     onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setRenamingId(null) } }}
                     className="nb-field w-full rounded-lg px-3 py-2 text-[13px]" />
            </div>
          ) : (
            <FolderRow key={f.id} icon={Folder} name={f.name} count={counts[f.id] || 0}
                       active={selected === f.id} onClick={() => onSelect(f.id)}
                       menu={<FolderMenu onRename={() => { setRenamingId(f.id); setRenameVal(f.name); setErr('') }} onDelete={() => onDelete(f)} />} />
          ))}
        </div>
        {!folders.length && (
          <p className="text-[12px] text-center px-3 py-6" style={{ color: 'var(--text-muted)' }}>No folders yet. Use the folder button above to add one.</p>
        )}
      </div>
    </aside>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Note "…" menu (used in the list rows and the detail header)
// ═════════════════════════════════════════════════════════════════════════════
export function NoteMenu({ note, folders, onPin, onDuplicate, onMove, onToggleStatus, onDelete, buttonClass = '', align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = () => setOpen(false)
  const stop = (fn) => (e) => { e.stopPropagation(); close(); fn() }
  return (
    <>
      <button ref={ref} onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }} aria-label="Note options" aria-haspopup="menu"
              className={`nb-icon-btn ${buttonClass} ${open ? 'open' : ''}`} style={{ width: 26, height: 26 }}>
        <MoreHorizontal size={16} />
      </button>
      <Menu open={open} anchorRef={ref} onClose={close} width={220} align={align}>
        <MenuItem icon={note.pinned ? PinOff : Pin} onClick={stop(onPin)}>{note.pinned ? 'Unpin note' : 'Pin to top'}</MenuItem>
        <MenuItem icon={note.status === 'completed' ? RotateCcw : CircleCheck} onClick={stop(onToggleStatus)}>
          {note.status === 'completed' ? 'Mark as active' : 'Mark as completed'}
        </MenuItem>
        <MenuItem icon={Copy} onClick={stop(onDuplicate)}>Duplicate</MenuItem>
        {folders.length > 0 && (
          <>
            <MenuDivider />
            <MenuLabel>Move to</MenuLabel>
            <div className="max-h-40 overflow-y-auto">
              {folders.map(f => (
                <MenuItem key={f.id} icon={FolderInput} active={f.id === note.folder_id}
                          onClick={stop(() => f.id !== note.folder_id && onMove(f.id))}
                          trailing={f.id === note.folder_id ? <Check size={13} /> : null}>{f.name}</MenuItem>
              ))}
            </div>
          </>
        )}
        <MenuDivider />
        <MenuItem icon={Trash2} danger onClick={stop(onDelete)}>Delete note</MenuItem>
      </Menu>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Notes list
// ═════════════════════════════════════════════════════════════════════════════
export function NoteList({
  title, notes, folders, folderName, showFolder, selectedId, loading, search, onSearch,
  onSelect, onNew, menuHandlers, onOpenFolders, className = '', style,
}) {
  const searching = search.trim().length > 0
  const searchRef = useRef(null)

  // "/" jumps to the search box (unless you're already typing somewhere).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault(); searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className={`flex flex-col min-h-0 ${className}`} style={style} aria-label="Notes">
      <div className="flex items-center justify-between px-5 h-14 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onOpenFolders} className="xl:!hidden nb-icon-btn -ml-1.5" aria-label="Browse folders" title="Folders">
            <FolderOpen size={16} />
          </button>
          <h2 className="text-[13.5px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        </div>
        <button onClick={onNew} className="nb-icon-btn" aria-label="New note" title="New note"><Plus size={19} className="nb-accent-text" /></button>
      </div>

      <div className="px-3 pb-3 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input ref={searchRef} value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search notes…" aria-label="Search notes"
                 className="nb-field w-full rounded-xl pl-9 pr-8 py-2.5 text-[13px]" />
          {searching && (
            <button onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 nb-icon-btn" style={{ width: 22, height: 22 }} aria-label="Clear search"><X size={13} /></button>
          )}
        </div>
      </div>

      <div className="nb-scroll flex-1 min-h-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {loading ? (
          <div className="p-4 space-y-5">
            {[0, 1, 2].map(i => (
              <div key={i} className="space-y-2">
                <div className="nb-skeleton h-3.5 w-3/4" /><div className="nb-skeleton h-3 w-1/2" /><div className="nb-skeleton h-3 w-2/5" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center text-center px-6 pt-14">
            <div className="nb-tile w-14 h-14 rounded-2xl mb-3">
              <FileText size={24} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{searching ? 'No matching notes' : 'No Notes'}</p>
            {searching
              ? <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>Nothing matches “{search.trim()}”.</p>
              : <button onClick={onNew} className="text-[12.5px] mt-2 nb-accent-text hover:underline underline-offset-2">Create a note</button>}
          </div>
        ) : (
          <ul>
            {notes.map(n => {
              const active = n.id === selectedId
              const preview = notePreview(n.fields)
              return (
                <li key={n.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className={`nb-row px-5 py-3.5 ${active ? 'selected' : ''}`} onClick={() => onSelect(n.id)} role="button" tabIndex={0}
                       aria-current={active ? 'true' : undefined}
                       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id) } }}
                       style={{ boxShadow: active ? 'inset 2px 0 0 var(--accent-purple)' : 'none' }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {n.pinned && <Pin size={11} className="flex-shrink-0 nb-accent-text" aria-label="Pinned" />}
                          <p className={`text-[13.5px] font-semibold truncate ${active ? 'nb-accent-text' : ''}`}
                             style={active ? undefined : { color: 'var(--text-primary)' }}>{n.title}</p>
                          {n.status === 'completed' && <CircleCheck size={12} className="flex-shrink-0" style={{ color: 'var(--positive-green)' }} aria-label="Completed" />}
                        </div>
                        <p className="text-[11.5px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                          {relativeDay(n.updated_at)}
                          {showFolder && <><span className="mx-1.5">·</span>{folderName(n.folder_id)}</>}
                        </p>
                        <p className={`text-[12px] mt-1.5 truncate ${preview ? '' : 'italic'}`} style={{ color: 'var(--text-muted)' }}>
                          {preview || 'No additional text'}
                        </p>
                      </div>
                      <div className="flex-shrink-0 -mr-1.5">
                        <NoteMenu note={n} folders={folders} buttonClass="nb-row-more" {...menuHandlers(n)} />
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}