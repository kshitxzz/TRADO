import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getTemplate, makeField, DEFAULT_FOLDERS } from '../data/notebookTemplates'
import { deepClone, sanitizeHtml } from '../lib/notebook'

// Postgres "relation does not exist" / PostgREST "table not in schema cache" —
// both mean migration 004_notebook.sql hasn't been run yet.
const isMissingTable = (err) =>
  err && (err.code === '42P01' || err.code === 'PGRST205' || /notebook_(notes|folders)/i.test(err.message || '') && /does not exist|schema cache/i.test(err.message || ''))

// Rich-text values are sanitised once more right before they hit the database.
function cleanFields(fields) {
  return (fields || []).map(f => {
    const copy = { ...f }
    if (copy.type === 'richtext') copy.value = sanitizeHtml(copy.value)
    return copy
  })
}

export function useNotebook(userId) {
  const [folders, setFolders] = useState([])
  const [notes, setNotes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [loadError, setLoadError]     = useState(null)
  const seeding = useRef(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadError(null)
    const [fRes, nRes] = await Promise.all([
      supabase.from('notebook_folders').select('*').eq('user_id', userId).order('sort_order').order('created_at'),
      supabase.from('notebook_notes').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    ])
    const err = fRes.error || nRes.error
    if (err) {
      if (isMissingTable(err)) setSetupNeeded(true)
      else setLoadError(err.message || 'Could not load your notebook')
      setLoading(false)
      return
    }
    setSetupNeeded(false)

    let folderRows = fRes.data || []

    // First visit: give the notebook a few starter folders. The flag stops
    // them coming back if the user deliberately deletes them later.
    const seedKey = `trado_notebook_seeded_${userId}`
    let alreadySeeded = false
    try { alreadySeeded = localStorage.getItem(seedKey) === '1' } catch (_) { /* ignore */ }
    if (folderRows.length === 0 && (nRes.data || []).length === 0 && !alreadySeeded && !seeding.current) {
      seeding.current = true
      const { data: seeded, error: seedErr } = await supabase
        .from('notebook_folders')
        .insert(DEFAULT_FOLDERS.map((name, i) => ({ user_id: userId, name, sort_order: i })))
        .select()
      seeding.current = false
      if (!seedErr && seeded) {
        folderRows = seeded.sort((a, b) => a.sort_order - b.sort_order)
        try { localStorage.setItem(seedKey, '1') } catch (_) { /* ignore */ }
      }
    }

    setFolders(folderRows)
    setNotes(nRes.data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  // ── Folders ────────────────────────────────────────────────────────────────
  const createFolder = useCallback(async (name) => {
    const clean = name.trim().slice(0, 60)
    if (!clean) return { error: 'Folder name is required' }
    const nextOrder = folders.reduce((m, f) => Math.max(m, f.sort_order ?? 0), -1) + 1
    const { data, error } = await supabase
      .from('notebook_folders')
      .insert({ user_id: userId, name: clean, sort_order: nextOrder })
      .select().single()
    if (error) return { error: error.message }
    setFolders(prev => [...prev, data])
    return { folder: data }
  }, [userId, folders])

  const renameFolder = useCallback(async (id, name) => {
    const clean = name.trim().slice(0, 60)
    if (!clean) return { error: 'Folder name is required' }
    const { data, error } = await supabase
      .from('notebook_folders').update({ name: clean }).eq('id', id).eq('user_id', userId)
      .select().single()
    if (error) return { error: error.message }
    setFolders(prev => prev.map(f => f.id === id ? data : f))
    return { folder: data }
  }, [userId])

  const deleteFolder = useCallback(async (id) => {
    const { error } = await supabase.from('notebook_folders').delete().eq('id', id).eq('user_id', userId)
    if (error) return { error: error.message }
    setFolders(prev => prev.filter(f => f.id !== id))
    setNotes(prev => prev.filter(n => n.folder_id !== id)) // ON DELETE CASCADE removed them server-side
    return {}
  }, [userId])

  // ── Notes ──────────────────────────────────────────────────────────────────
  const createNote = useCallback(async ({ title, folderId, templateId }) => {
    const tpl = getTemplate(templateId)
    const fields = tpl ? tpl.build() : [makeField('richtext', 'Content')]
    const { data, error } = await supabase
      .from('notebook_notes')
      .insert({
        user_id: userId,
        folder_id: folderId || null,
        title: title.trim().slice(0, 160),
        template_id: tpl ? tpl.id : 'blank',
        fields,
      })
      .select().single()
    if (error) return { error: error.message }
    setNotes(prev => [data, ...prev])
    return { note: data }
  }, [userId])

  const updateNote = useCallback(async (id, patch) => {
    const body = { ...patch }
    if (body.fields) body.fields = cleanFields(body.fields)
    if (typeof body.title === 'string') body.title = body.title.trim().slice(0, 160)
    const { data, error } = await supabase
      .from('notebook_notes').update(body).eq('id', id).eq('user_id', userId)
      .select().single()
    if (error) return { error: error.message }
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? data : n)
      return next.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    })
    return { note: data }
  }, [userId])

  const deleteNote = useCallback(async (id) => {
    const { error } = await supabase.from('notebook_notes').delete().eq('id', id).eq('user_id', userId)
    if (error) return { error: error.message }
    setNotes(prev => prev.filter(n => n.id !== id))
    return {}
  }, [userId])

  const duplicateNote = useCallback(async (note) => {
    const { data, error } = await supabase
      .from('notebook_notes')
      .insert({
        user_id: userId,
        folder_id: note.folder_id,
        title: `${note.title} (copy)`.slice(0, 160),
        template_id: note.template_id,
        status: 'active',
        fields: deepClone(note.fields),
      })
      .select().single()
    if (error) return { error: error.message }
    setNotes(prev => [data, ...prev])
    return { note: data }
  }, [userId])

  return {
    folders, notes, loading, setupNeeded, loadError, reload: load,
    createFolder, renameFolder, deleteFolder,
    createNote, updateNote, deleteNote, duplicateNote,
  }
}