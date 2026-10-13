import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Undo2, Redo2, Type, Heading, Bold, Italic, Underline, List, AlignLeft, AlignCenter,
  AlignRight, Link2, Table, ImageIcon, X,
} from 'lucide-react'
import { Dropdown, Modal } from './ui'
import { sanitizeHtml } from '../../lib/notebook'

// ── Rich-text editing ────────────────────────────────────────────────────────
// Built on contentEditable + document.execCommand, the same approach as the
// reference. Every editable region registers itself as the "active editor" on
// focus; the one shared toolbar always acts on whichever region was last
// focused, which is what lets a single note hold several rich-text fields.
const FONTS = [
  { value: 'Inter',           label: 'Inter',           fontFamily: 'Inter, sans-serif' },
  { value: 'Arial',           label: 'Arial',           fontFamily: 'Arial, sans-serif' },
  { value: 'Times New Roman', label: 'Times New Roman', fontFamily: '"Times New Roman", serif' },
  { value: 'Courier New',     label: 'Courier New',     fontFamily: '"Courier New", monospace' },
  { value: 'Georgia',         label: 'Georgia',         fontFamily: 'Georgia, serif' },
]

const MAX_IMG_DIM = 1400          // longest side after downscaling
const MAX_IMG_BYTES = 12 * 1024 * 1024 // refuse absurd source files outright

// Downscale + re-encode so a phone screenshot doesn't put several MB of base64
// into the note row.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) return reject(new Error('Use a PNG, JPG, GIF or WebP image'))
    if (file.size > MAX_IMG_BYTES) return reject(new Error('That image is too large (max 12 MB)'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      if (file.type === 'image/gif') return resolve(reader.result) // keep animation
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a valid image'))
      img.onload = () => {
        const scale = Math.min(1, MAX_IMG_DIM / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        const png = file.type === 'image/png' && w * h < 1_200_000
        resolve(canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// The editor that was focused last — module-level so the toolbar (a sibling
// component) can reach it without prop-drilling through every field.
let activeEditor = null
const listeners = new Set()
function setActive(el) { activeEditor = el; listeners.forEach(fn => fn(el)) }

function exec(cmd, value = null) {
  if (!activeEditor) return
  activeEditor.focus()
  document.execCommand('styleWithCSS', false, true)
  document.execCommand(cmd, false, value)
  activeEditor.dispatchEvent(new Event('input', { bubbles: true }))
}

// ── The editable region ──────────────────────────────────────────────────────
export function RichTextArea({ value, onChange, placeholder = 'Start writing…', minHeight = 140, autoFocus }) {
  const ref = useRef(null)
  const lastEmitted = useRef(null)

  // Push `value` into the DOM only when it differs from what we last emitted,
  // otherwise the caret would jump to the start on every keystroke.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value !== lastEmitted.current) {
      el.innerHTML = sanitizeHtml(value || '')
      lastEmitted.current = value || ''
    }
  }, [value])

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  const emit = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Treat a lone <br> / empty block as truly empty so the placeholder returns.
    const html = el.innerHTML
    const empty = !el.textContent.trim() && !el.querySelector('img,table,hr,li')
    const next = empty ? '' : html
    lastEmitted.current = next
    onChange(next)
  }, [onChange])

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'))
    if (files.length) {
      e.preventDefault()
      fileToDataUrl(files[0]).then(url => exec('insertImage', url)).catch(() => {})
      return
    }
    // Paste as plain text so foreign styles (and anything unsafe) never get in.
    const text = e.clipboardData?.getData('text/plain')
    if (text != null) {
      e.preventDefault()
      document.execCommand('insertText', false, text)
    }
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox" aria-multiline="true"
      data-placeholder={placeholder}
      onFocus={() => setActive(ref.current)}
      onInput={emit}
      onBlur={emit}
      onPaste={handlePaste}
      className="nb-rich nb-rich-edit"
      style={{ minHeight }}
    />
  )
}

// ── Link / table / image popovers ────────────────────────────────────────────
function SmallDialog({ open, title, onClose, children, onSubmit, submitLabel, disabled }) {
  return (
    <Modal open={open} onClose={onClose} width={380} label={title}>
      <form onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit() }} className="p-5">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <button type="button" onClick={onClose} className="nb-icon-btn" aria-label="Close"><X size={15} /></button>
        </div>
        {children}
        <div className="flex gap-2.5 mt-5">
          <button type="button" onClick={onClose} className="nb-btn nb-btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={disabled} className="nb-btn nb-btn-primary flex-1">{submitLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

const Label = ({ children }) => (
  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>{children}</label>
)

// ── Toolbar ──────────────────────────────────────────────────────────────────
export function RichTextToolbar() {
  const [state, setState] = useState({ bold: false, italic: false, underline: false, ul: false, left: true, center: false, right: false, block: 'p', font: 'Inter' })
  const [hasEditor, setHasEditor] = useState(!!activeEditor)
  const savedRange = useRef(null)
  const [dlg, setDlg] = useState(null) // 'link' | 'table' | 'image' | null
  const [linkUrl, setLinkUrl] = useState('')
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [imgUrl, setImgUrl] = useState('')
  const [imgErr, setImgErr] = useState('')
  const [imgBusy, setImgBusy] = useState(false)
  const fileRef = useRef(null)

  // Track which regions exist / are focused.
  useEffect(() => {
    const fn = (el) => setHasEditor(!!el)
    listeners.add(fn)
    return () => { listeners.delete(fn); if (activeEditor && !document.body.contains(activeEditor)) setActive(null) }
  }, [])

  // Reflect the formatting at the caret in the toolbar's pressed states.
  useEffect(() => {
    function sync() {
      const sel = window.getSelection()
      if (!activeEditor || !sel?.anchorNode || !activeEditor.contains(sel.anchorNode)) return
      const q = (c) => { try { return document.queryCommandState(c) } catch (_) { return false } }
      let block = 'p'
      try { block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '') } catch (_) { /* ignore */ }
      let font = 'Inter'
      try {
        const raw = String(document.queryCommandValue('fontName') || '').replace(/["']/g, '').split(',')[0].trim()
        font = FONTS.find(f => f.value.toLowerCase() === raw.toLowerCase())?.value || 'Inter'
      } catch (_) { /* ignore */ }
      setState({
        bold: q('bold'), italic: q('italic'), underline: q('underline'), ul: q('insertUnorderedList'),
        left: q('justifyLeft') || !(q('justifyCenter') || q('justifyRight')), center: q('justifyCenter'), right: q('justifyRight'),
        block: /^h[1-6]$/.test(block) ? 'h' : 'p', font,
      })
    }
    document.addEventListener('selectionchange', sync)
    return () => document.removeEventListener('selectionchange', sync)
  }, [])

  // Dialogs steal focus, so remember the selection and restore it afterwards.
  function saveSel() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && activeEditor?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange()
  }
  function openDialog(kind) {
    savedRange.current = null
    saveSel()
    setImgErr(''); setImgUrl(''); setLinkUrl('')
    setDlg(kind)
  }
  function restore() {
    activeEditor?.focus()
    const r = savedRange.current
    if (r) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r) }
  }
  const closeDialog = () => { setDlg(null) }

  function applyLink() {
    let url = linkUrl.trim()
    if (!url) return
    if (!/^(https?:|mailto:)/i.test(url)) url = `https://${url}`
    restore()
    const sel = window.getSelection()
    if (sel && sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`)
    else document.execCommand('createLink', false, url)
    activeEditor?.dispatchEvent(new Event('input', { bubbles: true }))
    closeDialog()
  }

  function applyTable() {
    const r = Math.min(Math.max(parseInt(rows, 10) || 1, 1), 20)
    const c = Math.min(Math.max(parseInt(cols, 10) || 1, 1), 10)
    const head = `<tr>${'<th>&nbsp;</th>'.repeat(c)}</tr>`
    const body = `<tr>${'<td>&nbsp;</td>'.repeat(c)}</tr>`.repeat(Math.max(r - 1, 0))
    restore()
    document.execCommand('insertHTML', false, `<table><tbody>${head}${body}</tbody></table><p><br></p>`)
    activeEditor?.dispatchEvent(new Event('input', { bubbles: true }))
    closeDialog()
  }

  function insertImageSrc(src) {
    restore()
    document.execCommand('insertImage', false, src)
    activeEditor?.dispatchEvent(new Event('input', { bubbles: true }))
    closeDialog()
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImgBusy(true); setImgErr('')
    try { insertImageSrc(await fileToDataUrl(file)) }
    catch (err) { setImgErr(err.message) }
    finally { setImgBusy(false) }
  }

  function applyImageUrl() {
    const u = imgUrl.trim()
    if (!/^https:\/\//i.test(u)) { setImgErr('Image links must start with https://'); return }
    insertImageSrc(u)
  }

  // Keep the editor's selection alive while clicking toolbar buttons.
  const keep = (e) => e.preventDefault()
  const Btn = ({ onClick, on, label, children, disabled }) => (
    <button type="button" onMouseDown={keep} onClick={onClick} disabled={disabled || !hasEditor}
            className={`nb-tb-btn ${on ? 'on' : ''}`} aria-label={label} title={label} aria-pressed={on}>
      {children}
    </button>
  )

  return (
    <>
      <div className="nb-hscroll flex items-center px-3 py-2" role="toolbar" aria-label="Text formatting"
           style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <Btn label="Undo" onClick={() => exec('undo')}><Undo2 size={15} /></Btn>
        <Btn label="Redo" onClick={() => exec('redo')}><Redo2 size={15} /></Btn>
        <span className="nb-tb-sep" />
        <Btn label="Normal text" on={state.block === 'p'} onClick={() => exec('formatBlock', 'p')}><Type size={15} /></Btn>
        <Btn label="Heading" on={state.block === 'h'} onClick={() => exec('formatBlock', state.block === 'h' ? 'p' : 'h2')}><Heading size={15} /></Btn>
        <span className="nb-tb-sep" />
        <div style={{ width: 150, flexShrink: 0 }} onMouseDownCapture={saveSel} onMouseDown={keep}>
          <Dropdown size="sm" ariaLabel="Font" value={state.font} options={FONTS} minWidth={170}
                    onChange={(f) => { restore(); exec('fontName', f); setState(s => ({ ...s, font: f })) }}
                    buttonStyle={{ opacity: hasEditor ? 1 : 0.5 }} />
        </div>
        <span className="nb-tb-sep" />
        <Btn label="Bold (Ctrl+B)" on={state.bold} onClick={() => exec('bold')}><Bold size={15} /></Btn>
        <Btn label="Italic (Ctrl+I)" on={state.italic} onClick={() => exec('italic')}><Italic size={15} /></Btn>
        <Btn label="Underline (Ctrl+U)" on={state.underline} onClick={() => exec('underline')}><Underline size={15} /></Btn>
        <span className="nb-tb-sep" />
        <Btn label="Bulleted list" on={state.ul} onClick={() => exec('insertUnorderedList')}><List size={15} /></Btn>
        <span className="nb-tb-sep" />
        <Btn label="Align left" on={state.left} onClick={() => exec('justifyLeft')}><AlignLeft size={15} /></Btn>
        <Btn label="Align center" on={state.center} onClick={() => exec('justifyCenter')}><AlignCenter size={15} /></Btn>
        <Btn label="Align right" on={state.right} onClick={() => exec('justifyRight')}><AlignRight size={15} /></Btn>
        <span className="nb-tb-sep" />
        <Btn label="Insert link" onClick={() => openDialog('link')}><Link2 size={15} /></Btn>
        <Btn label="Insert table" onClick={() => openDialog('table')}><Table size={15} /></Btn>
        <Btn label="Insert image" onClick={() => openDialog('image')}><ImageIcon size={15} /></Btn>
      </div>

      <SmallDialog open={dlg === 'link'} title="Insert link" onClose={closeDialog} onSubmit={applyLink}
                   submitLabel="Add link" disabled={!linkUrl.trim()}>
        <Label>URL</Label>
        <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com"
               className="nb-field w-full rounded-lg px-3 py-2.5 text-[13px]" />
      </SmallDialog>

      <SmallDialog open={dlg === 'table'} title="Insert table" onClose={closeDialog} onSubmit={applyTable} submitLabel="Insert table">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Rows</Label>
            <input type="number" min={1} max={20} value={rows} onChange={(e) => setRows(e.target.value)}
                   className="nb-field w-full rounded-lg px-3 py-2.5 text-[13px]" autoFocus />
          </div>
          <div>
            <Label>Columns</Label>
            <input type="number" min={1} max={10} value={cols} onChange={(e) => setCols(e.target.value)}
                   className="nb-field w-full rounded-lg px-3 py-2.5 text-[13px]" />
          </div>
        </div>
        <p className="text-[11px] mt-2.5" style={{ color: 'var(--text-muted)' }}>The first row becomes the header row.</p>
      </SmallDialog>

      <SmallDialog open={dlg === 'image'} title="Insert image" onClose={closeDialog} onSubmit={applyImageUrl}
                   submitLabel="Insert from link" disabled={!imgUrl.trim() || imgBusy}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onPickFile} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={imgBusy}
                className="nb-btn nb-btn-soft w-full" style={{ padding: '14px 16px' }}>
          <ImageIcon size={15} /> {imgBusy ? 'Processing…' : 'Upload from your device'}
        </button>
        <div className="flex items-center gap-3 my-3.5">
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>or paste a link</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        </div>
        <input value={imgUrl} onChange={(e) => { setImgUrl(e.target.value); setImgErr('') }} placeholder="https://…/chart.png"
               className="nb-field w-full rounded-lg px-3 py-2.5 text-[13px]" />
        {imgErr && <p className="text-[12px] mt-2" style={{ color: 'var(--negative-red)' }} role="alert">{imgErr}</p>}
      </SmallDialog>
    </>
  )
}