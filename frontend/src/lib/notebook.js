// Pure helpers for the Notebook: HTML sanitising, previews, computed fields.

// ── HTML sanitiser ───────────────────────────────────────────────────────────
// Rich-text fields are stored as HTML and rendered back with
// dangerouslySetInnerHTML, so everything goes through this allow-list first —
// on the way in (before saving) and on the way out (before rendering).
const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'CODE', 'PRE', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'FONT',
])
// Tags whose entire contents are dropped, not just the tag itself.
const DROP_WITH_CONTENT = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'NOSCRIPT', 'TEMPLATE',
])
const ALLOWED_STYLE_PROPS = new Set([
  'font-family', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
])
const SAFE_FONT_RE = /^[\w\s,'"-]+$/
const SAFE_LINK_RE = /^(https?:|mailto:)/i
const SAFE_IMG_RE  = /^(https:\/\/|data:image\/(png|jpe?g|gif|webp);base64,)/i

function cleanStyle(raw) {
  const out = []
  for (const decl of String(raw || '').split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const val  = decl.slice(i + 1).trim()
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue
    if (/url\s*\(|expression|javascript:|[<>]/i.test(val)) continue
    if (prop === 'font-family' && !SAFE_FONT_RE.test(val)) continue
    out.push(`${prop}: ${val}`)
  }
  return out.join('; ')
}

function cleanNode(node, doc) {
  const frag = doc.createDocumentFragment()
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) { frag.appendChild(doc.createTextNode(child.nodeValue)); continue }
    if (child.nodeType !== 1) continue
    const tag = child.tagName
    if (DROP_WITH_CONTENT.has(tag)) continue
    if (!ALLOWED_TAGS.has(tag)) { frag.appendChild(cleanNode(child, doc)); continue } // unwrap unknown tags, keep text
    const el = doc.createElement(tag.toLowerCase())
    if (tag === 'A') {
      const href = child.getAttribute('href') || ''
      if (!SAFE_LINK_RE.test(href.trim())) { frag.appendChild(cleanNode(child, doc)); continue }
      el.setAttribute('href', href.trim())
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer nofollow')
    } else if (tag === 'IMG') {
      const src = child.getAttribute('src') || ''
      if (!SAFE_IMG_RE.test(src.trim())) continue
      el.setAttribute('src', src.trim())
      el.setAttribute('alt', (child.getAttribute('alt') || '').slice(0, 200))
    } else if (tag === 'TD' || tag === 'TH') {
      for (const a of ['colspan', 'rowspan']) {
        const v = parseInt(child.getAttribute(a), 10)
        if (v > 1 && v < 50) el.setAttribute(a, String(v))
      }
    } else if (tag === 'FONT') {
      const face = child.getAttribute('face')
      if (face && SAFE_FONT_RE.test(face)) el.setAttribute('face', face)
    }
    const style = cleanStyle(child.getAttribute('style'))
    if (style) el.setAttribute('style', style)
    el.appendChild(cleanNode(child, doc))
    frag.appendChild(el)
  }
  return frag
}

export function sanitizeHtml(html) {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const holder = doc.createElement('div')
  holder.appendChild(cleanNode(doc.body, doc))
  return holder.innerHTML
}

export function htmlToText(html) {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

// ── Field helpers ────────────────────────────────────────────────────────────
export function isFieldEmpty(f) {
  const v = f.value
  switch (f.type) {
    case 'rr':        return true // computed — never counts as "content"
    case 'checklist': return !Array.isArray(v) || v.length === 0
    case 'rating':    return !v
    case 'richtext':  return !htmlToText(v) && !/<img\b/i.test(v || '')
    default:          return v === '' || v == null
  }
}

// True when the note has nothing the user actually typed yet.
export const isNoteEmpty = (fields) => !(fields || []).some(f => !isFieldEmpty(f) && !(f.type === 'checklist' && !f.value.some(i => i.text)))

// One-line plain-text snippet for the notes list. Free-text fields win over
// pre-filled defaults (dates, selects) so a fresh template doesn't preview as
// "Week Starting: 2026-10-05".
export function notePreview(fields) {
  const fmtDate = (v) => {
    const d = new Date(`${v}T00:00:00`)
    return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const snippet = (f) => {
    let t = ''
    if (f.type === 'richtext')       t = htmlToText(f.value)
    else if (f.type === 'checklist') {
      const items = f.value.filter(i => i.text), done = items.filter(i => i.done).length
      t = done ? `${f.label}: ${done}/${items.length} done` : ''   // untouched template items aren't "content"
    }
    else if (f.type === 'rating')    t = `${f.label}: ${f.value}/10`
    else if (f.type === 'date')      t = `${f.label}: ${fmtDate(f.value)}`
    else if (f.type === 'text' || f.type === 'textarea') t = String(f.value)
    else                              t = `${f.label}: ${f.value}`
    t = t.replace(/\s+/g, ' ').trim()
    return t.length > 90 ? t.slice(0, 90).trimEnd() + '…' : t
  }
  const filled = (fields || []).filter(f => !isFieldEmpty(f))
  const prose = filled.find(f => ['textarea', 'richtext', 'text'].includes(f.type) && snippet(f))
  const pick = prose || filled.find(f => snippet(f))
  return pick ? snippet(pick) : ''
}

// Full-text haystack for the search box (title + every field's text).
export function noteSearchText(note) {
  const parts = [note.title]
  for (const f of note.fields || []) {
    parts.push(f.label)
    if (f.type === 'richtext')       parts.push(htmlToText(f.value))
    else if (f.type === 'checklist') parts.push((f.value || []).map(i => i.text).join(' '))
    else if (f.type !== 'rr')         parts.push(String(f.value ?? ''))
  }
  return parts.join(' ').toLowerCase()
}

// ── Risk : Reward (Trade Idea template) ──────────────────────────────────────
// Works for longs and shorts alike: risk = |entry − stop|, reward = |target − entry|,
// and the stop / target must sit on opposite sides of entry to make sense.
export function computeRR(fields) {
  const get = (id) => {
    const f = (fields || []).find(x => x.id === id)
    const n = f ? parseFloat(f.value) : NaN
    return Number.isFinite(n) ? n : null
  }
  const entry = get('entry'), stop = get('stop'), target = get('target')
  if (entry == null || stop == null || target == null) return null
  const risk = Math.abs(entry - stop), reward = Math.abs(target - entry)
  if (risk === 0) return null
  const sideOk = (stop - entry) * (target - entry) < 0
  return { ratio: reward / risk, sideOk }
}

export function formatRR(rr) {
  if (!rr) return '—'
  return `1 : ${rr.ratio >= 10 ? rr.ratio.toFixed(0) : rr.ratio.toFixed(2).replace(/\.?0+$/, '')}`
}

// ── Dates ────────────────────────────────────────────────────────────────────
// "Today" / weekday for the last week / "Jul 21" beyond that — as in the notes list.
export function relativeDay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)   return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

export function deepClone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))
}

// Stable comparison for the "unsaved changes" check.
export const sameContent = (a, b) => JSON.stringify(a) === JSON.stringify(b)