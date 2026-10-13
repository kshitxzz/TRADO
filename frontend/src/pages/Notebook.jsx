import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { FileText, DatabaseZap, AlertCircle, RefreshCw } from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../hooks/useAuth'
import { useNotebook } from '../hooks/useNotebook'
import { FolderPanel, NoteList } from '../components/notebook/Panels'
import NoteDetail from '../components/notebook/NoteDetail'
import { TemplatePicker, NewNoteDialog } from '../components/notebook/TemplateDialogs'
import { ConfirmDialog, Modal, TemplateIcon } from '../components/notebook/ui'
import { getTemplate, QUICK_START_IDS } from '../data/notebookTemplates'
import { noteSearchText } from '../lib/notebook'
import '../components/notebook/notebook.css'

const DIVIDER = '1px solid var(--border-subtle)'

export default function Notebook() {
  const { user } = useAuth()
  const nb = useNotebook(user?.id)
  const { folders, notes, loading, setupNeeded, loadError } = nb

  const [selectedFolder, setSelectedFolder] = useState('all') // 'all' | folder id
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing]       = useState(false)
  const [search, setSearch]         = useState('')

  const [pickerOpen, setPickerOpen]   = useState(false)
  const [newTemplate, setNewTemplate] = useState(null)   // template id while the title dialog is open
  const [foldersOpen, setFoldersOpen] = useState(false)  // folders sheet on narrower screens

  const [confirm, setConfirm] = useState(null)           // { kind, ... }
  const [busy, setBusy] = useState(false)

  // Unsaved-edits guard: NoteDetail reports dirtiness; anything that would
  // navigate away asks first.
  const dirtyRef = useRef(false)
  const [pendingNav, setPendingNav] = useState(null)
  const guard = useCallback((fn) => {
    if (dirtyRef.current) setPendingNav(() => fn)
    else fn()
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const folderById = useMemo(() => Object.fromEntries(folders.map(f => [f.id, f])), [folders])
  const folderName = useCallback((id) => folderById[id]?.name || 'Unfiled', [folderById])

  const counts = useMemo(() => {
    const c = {}
    for (const n of notes) if (n.folder_id) c[n.folder_id] = (c[n.folder_id] || 0) + 1
    return c
  }, [notes])

  const scoped = useMemo(
    () => selectedFolder === 'all' ? notes : notes.filter(n => n.folder_id === selectedFolder),
    [notes, selectedFolder],
  )
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? scoped.filter(n => noteSearchText(n).includes(q)) : scoped
    // pinned first, then most recently updated (notes already arrive newest-first)
    return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updated_at) - new Date(a.updated_at))
  }, [scoped, search])

  const selectedNote = useMemo(() => notes.find(n => n.id === selectedId) || null, [notes, selectedId])

  // If the open note disappears (deleted elsewhere), fall back to the empty state.
  useEffect(() => { if (selectedId && !loading && !selectedNote) { setSelectedId(null); setEditing(false) } }, [selectedId, selectedNote, loading])

  const listTitle = selectedFolder === 'all' ? 'All Notes' : folderName(selectedFolder)

  // ── Navigation ─────────────────────────────────────────────────────────────
  const openNote = (id) => {
    if (id === selectedId) return
    guard(() => { setSelectedId(id); setEditing(false) })
  }
  const openFolder = (id) => {
    if (id === selectedFolder) { setFoldersOpen(false); return }
    guard(() => { setSelectedFolder(id); setSelectedId(null); setEditing(false); setSearch(''); setFoldersOpen(false) })
  }
  const backToList = () => guard(() => { setSelectedId(null); setEditing(false) })

  // ── Create flow: + → Choose a Template → title dialog → note ───────────────
  const startNew = () => guard(() => setPickerOpen(true))
  const pickTemplate = (id) => { setPickerOpen(false); setNewTemplate(id) }

  const handleCreate = async ({ title, folderId, templateId }) => {
    const res = await nb.createNote({ title, folderId, templateId })
    if (res.error) return { error: res.error }
    const note = res.note
    setNewTemplate(null)
    // Make sure the new note is actually visible in the list we're looking at.
    if (selectedFolder !== 'all' && selectedFolder !== note.folder_id) setSelectedFolder(note.folder_id || 'all')
    setSearch('')
    setSelectedId(note.id)
    // Templates open straight into edit mode so the structure is ready to fill in.
    setEditing(templateId !== 'blank')
    toast.success(`${getTemplate(templateId)?.name || 'Note'} created`)
    return {}
  }

  // ── Folder actions ─────────────────────────────────────────────────────────
  const createFolder = async (name) => {
    const res = await nb.createFolder(name)
    if (!res.error) toast.success('Folder created')
    return res
  }
  const renameFolder = async (id, name) => {
    const res = await nb.renameFolder(id, name)
    if (res.error) toast.error(res.error)
    return res
  }
  const askDeleteFolder = (folder) => guard(() => setConfirm({ kind: 'folder', folder, count: counts[folder.id] || 0 }))

  // ── Note actions ───────────────────────────────────────────────────────────
  const menuHandlers = (note) => ({
    onPin:          async () => { const r = await nb.updateNote(note.id, { pinned: !note.pinned }); if (r.error) toast.error(r.error) },
    onToggleStatus: async () => {
      const r = await nb.updateNote(note.id, { status: note.status === 'completed' ? 'active' : 'completed' })
      if (r.error) toast.error(r.error)
    },
    onDuplicate:    async () => {
      const r = await nb.duplicateNote(note)
      if (r.error) toast.error(r.error); else toast.success('Note duplicated')
    },
    onMove:         async (folderId) => {
      const r = await nb.updateNote(note.id, { folder_id: folderId })
      if (r.error) toast.error(r.error)
      else {
        toast.success(`Moved to ${folderName(folderId)}`)
        if (selectedFolder !== 'all' && selectedFolder !== folderId) { setSelectedId(null); setEditing(false) }
      }
    },
    onDelete:       () => guard(() => setConfirm({ kind: 'note', note })),
  })

  const saveNote = async (patch) => {
    const r = await nb.updateNote(selectedNote.id, patch)
    if (r.error) { toast.error('Could not save. Please try again.'); return { error: r.error } }
    dirtyRef.current = false
    setEditing(false)
    toast.success('Note saved')
    return {}
  }

  // Tick a checklist item straight from the read-only view.
  const toggleItem = async (fieldId, itemId) => {
    if (!selectedNote) return
    const fields = selectedNote.fields.map(f => f.id !== fieldId ? f : {
      ...f, value: (f.value || []).map(i => i.id === itemId ? { ...i, done: !i.done } : i),
    })
    const r = await nb.updateNote(selectedNote.id, { fields })
    if (r.error) toast.error('Could not update that item')
  }

  const runConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    if (confirm.kind === 'note') {
      const r = await nb.deleteNote(confirm.note.id)
      if (r.error) toast.error(r.error)
      else {
        toast.success('Note deleted')
        if (selectedId === confirm.note.id) { setSelectedId(null); setEditing(false) }
      }
    } else {
      const r = await nb.deleteFolder(confirm.folder.id)
      if (r.error) toast.error(r.error)
      else {
        toast.success('Folder deleted')
        if (selectedFolder === confirm.folder.id) setSelectedFolder('all')
        if (selectedNote?.folder_id === confirm.folder.id) { setSelectedId(null); setEditing(false) }
      }
    }
    setBusy(false)
    setConfirm(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const showDetail = !!selectedNote
  const folderProps = {
    folders, counts, totalCount: notes.length, selected: selectedFolder,
    onSelect: openFolder, onCreate: createFolder, onRename: renameFolder, onDelete: askDeleteFolder,
  }

  let body
  if (setupNeeded || loadError) {
    body = (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="nb-tile w-14 h-14 rounded-2xl mx-auto mb-4" style={{ background: setupNeeded ? 'rgba(139,92,246,0.16)' : 'rgba(244,63,94,0.14)' }}>
            {setupNeeded ? <DatabaseZap size={24} style={{ color: 'var(--accent-purple-light)' }} /> : <AlertCircle size={24} style={{ color: 'var(--negative-red)' }} />}
          </div>
          <h2 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {setupNeeded ? 'One-time setup needed' : 'Could not load your notebook'}
          </h2>
          <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {setupNeeded
              ? <>The Notebook tables don't exist in your database yet. Run <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--nb-tile)' }}>supabase/migrations/004_notebook.sql</code> in the Supabase SQL editor, then reload.</>
              : loadError}
          </p>
          <button onClick={nb.reload} className="nb-btn nb-btn-primary mt-5"><RefreshCw size={14} /> Try again</button>
        </div>
      </div>
    )
  } else {
    body = (
      <>
        {/* Folders column — xl and up. Narrower screens reach it from a sheet. */}
        <FolderPanel {...folderProps} className="hidden xl:flex w-60 flex-shrink-0"
                     style={{ borderRight: DIVIDER, background: 'var(--bg-sidebar)' }} />

        {/* Notes list */}
        <NoteList
          title={listTitle} notes={visible} folders={folders} folderName={folderName}
          showFolder={selectedFolder === 'all'} selectedId={selectedId} loading={loading}
          search={search} onSearch={setSearch} onSelect={openNote} onNew={startNew}
          menuHandlers={menuHandlers} onOpenFolders={() => setFoldersOpen(true)}
          className={`${showDetail ? 'hidden md:flex' : 'flex'} w-full md:w-72 xl:w-80 flex-shrink-0`}
          style={{ borderRight: DIVIDER }}
        />

        {/* Detail */}
        <main className={`${showDetail ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 min-h-0 flex-col`}>
          {showDetail ? (
            <NoteDetail
              key={selectedNote.id}
              note={selectedNote} folder={folderById[selectedNote.folder_id]} folders={folders}
              editing={editing} onStartEdit={() => setEditing(true)} onStopEdit={() => setEditing(false)}
              onSave={saveNote} onBack={backToList}
              onDirtyChange={(d) => { dirtyRef.current = d }}
              menuHandlers={menuHandlers(selectedNote)} onToggleItem={toggleItem}
            />
          ) : (
            <div className="flex-1 nb-scroll flex flex-col items-center justify-center px-6 py-10">
              <div className="nb-tile w-[72px] h-[72px] rounded-3xl mb-5" style={{ background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <FileText size={32} className="nb-accent-text" />
              </div>
              <h2 className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>Select a Note</h2>
              <p className="text-[13px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>Choose a note from the list or create a new one to get started</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-[420px]">
                {QUICK_START_IDS.map(id => {
                  const t = getTemplate(id)
                  return (
                    <button key={id} onClick={() => guard(() => setNewTemplate(id))}
                            className="nb-template-card flex items-center gap-3 px-3.5 py-3 rounded-xl"
                            style={{ background: 'var(--nb-field-bg)', border: '1px solid var(--border-subtle)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${t.color}77` }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}>
                      <span className="nb-tile w-9 h-9" style={{ background: `${t.color}22` }}><TemplateIcon name={t.icon} size={16} style={{ color: t.color }} /></span>
                      <span className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </>
    )
  }

  return (
    <PageWrapper flush>
      <div className="nb-root flex-1 min-h-0 flex" style={{ background: 'var(--bg-primary)' }}>
        {body}
      </div>

      <TemplatePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickTemplate} />
      <NewNoteDialog
        open={!!newTemplate} templateId={newTemplate} folders={folders}
        defaultFolderId={selectedFolder !== 'all' ? selectedFolder : ''}
        onClose={() => setNewTemplate(null)} onCreate={handleCreate}
      />

      {/* Folders sheet (below xl) */}
      <Modal open={foldersOpen} onClose={() => setFoldersOpen(false)} width={340} label="Folders">
        <FolderPanel {...folderProps} className="h-[min(70vh,520px)]" />
      </Modal>

      <ConfirmDialog
        open={!!confirm} danger busy={busy}
        title={confirm?.kind === 'folder' ? `Delete “${confirm.folder.name}”?` : 'Delete this note?'}
        message={confirm?.kind === 'folder'
          ? (confirm.count > 0
              ? `This permanently deletes the folder and the ${confirm.count} note${confirm.count === 1 ? '' : 's'} inside it. This can't be undone.`
              : 'This folder is empty. It will be removed permanently.')
          : `“${confirm?.note?.title}” will be permanently deleted. This can't be undone.`}
        confirmLabel={confirm?.kind === 'folder' ? 'Delete folder' : 'Delete note'}
        onCancel={() => setConfirm(null)} onConfirm={runConfirm}
      />

      <ConfirmDialog
        open={!!pendingNav} danger title="Discard your changes?"
        message="You have unsaved edits to this note. If you continue they will be lost."
        confirmLabel="Discard changes" cancelLabel="Keep editing"
        onCancel={() => setPendingNav(null)}
        onConfirm={() => { const fn = pendingNav; dirtyRef.current = false; setPendingNav(null); setEditing(false); fn?.() }}
      />
    </PageWrapper>
  )
}