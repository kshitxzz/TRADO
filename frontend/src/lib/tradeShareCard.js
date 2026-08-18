// Renders the "Trade P&L" share card (Story / Post / Landscape) onto a
// <canvas>, matching the reference templates. Pure Canvas 2D — no extra
// dependency, and gives us a real PNG via canvas.toBlob()/toDataURL().
//
// Layout constants below were measured directly off the 3 reference PNGs
// (OCR bounding boxes + pixel-level edge detection), not eyeballed — see
// each format's comments for what's measured vs. interpolated.

export const SHARE_FORMATS = {
  story:     { key: 'story',     label: 'Story',     w: 1080, h: 1920 },
  post:      { key: 'post',      label: 'Post',       w: 1080, h: 1080 },
  landscape: { key: 'landscape', label: 'Landscape',  w: 1920, h: 1080 },
}

const FONT = 'Poppins, Inter, system-ui, sans-serif'
const LOGO_SRC = '/trado-logo.png'

// Per-format layout. x/y are top-left unless noted. Landscape + Post share
// the same canvas height (1080), so their vertical rhythm is identical —
// only Story (1920 tall) gets the extra breathing room + bottom tagline card.
const LAYOUTS = {
  landscape: {
    marginX: 110,
    logo:      { x: 110,  y: 105, size: 140 },
    wordmark:  { x: 272,  yCenter: 176, fontSize: 58 },
    tagline:   { x: 110,  yCenter: 293, fontSize: 20 },
    title:     { x: 110,  y: 406, fontSize: 54 },
    row:       { yCenter: 507, fontSize: 27, gap: 20 },
    pnl:       { x: 110,  yCenter: 615, fontSize: 100 },
    labels:    { y: 713, fontSize: 23, xEntry: 109, xExit: 385 },
    values:    { yTop: 749, fontSize: 46, xEntry: 109, xExit: 385 },
    watermark: { x: 1690, y: 790, size: 150, opacity: 0.85 },
    bottomCard: null,
  },
  post: {
    marginX: 98,
    logo:      { x: 98,   y: 100, size: 122 },
    wordmark:  { x: 250,  yCenter: 165, fontSize: 50 },
    tagline:   { x: 98,   yCenter: 255, fontSize: 17 },
    title:     { x: 98,   y: 405, fontSize: 47 },
    row:       { yCenter: 497, fontSize: 24, gap: 16 },
    pnl:       { x: 98,   yCenter: 585, fontSize: 84 },
    labels:    { y: 673, fontSize: 20, xEntry: 98, xExit: 346 },
    values:    { yTop: 702, fontSize: 39, xEntry: 98, xExit: 346 },
    watermark: { x: 862,  y: 790, size: 128, opacity: 0.85 },
    bottomCard: null,
  },
  story: {
    marginX: 110,
    logo:      { x: 129,  y: 236, size: 122 },
    wordmark:  { x: 292,  yCenter: 305, fontSize: 60 },
    tagline:   { x: 110,  yCenter: 380, fontSize: 22 },
    title:     { x: 122,  y: 661, fontSize: 66 },
    row:       { yCenter: 787, fontSize: 33, gap: 24 },
    pnl:       { x: 110,  yCenter: 945, fontSize: 128 },
    labels:    { y: 1099, fontSize: 28, xEntry: 121, xExit: 446 },
    values:    { yTop: 1140, fontSize: 56, xEntry: 121, xExit: 446 },
    watermark: null,
    bottomCard: { x: 110, y: 1555, w: 860, h: 303 },
  },
}

const GREEN = '#22C55E'
const RED   = '#F43F5E'
const WHITE = '#FFFFFF'
const MUTED = 'rgba(255,255,255,0.55)'
const ACCENT = '#9B4EFC'

let logoImgPromise = null
function loadLogo() {
  if (!logoImgPromise) {
    logoImgPromise = new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = LOGO_SRC
    })
  }
  return logoImgPromise
}

async function ensureFontsReady() {
  try {
    await Promise.all([
      document.fonts.load('700 60px Poppins'),
      document.fonts.load('800 100px Poppins'),
      document.fonts.load('600 24px Poppins'),
      document.fonts.load('900 60px Poppins'),
    ])
    await document.fonts.ready
  } catch { /* font loading best-effort — canvas falls back to system font */ }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0,    '#001839')
  grad.addColorStop(0.55, '#3B0764')
  grad.addColorStop(1,    '#5E0079')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Faint grid overlay (~77px cells, matches the reference templates)
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  const cell = 77
  for (let x = 0; x <= w; x += cell) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke()
  }
  for (let y = 0; y <= h; y += cell) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke()
  }
}

// Fits text to a max width by shrinking font-size (never grows past base size).
function fitFontSize(ctx, text, baseSize, weight, maxWidth) {
  let size = baseSize
  ctx.font = `${weight} ${size}px ${FONT}`
  while (ctx.measureText(text).width > maxWidth && size > baseSize * 0.5) {
    size -= 2
    ctx.font = `${weight} ${size}px ${FONT}`
  }
  return size
}

function drawTaglineSegments(ctx, x, yCenter, fontSize) {
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${fontSize}px ${FONT}`
  const segs = [
    { t: 'Track Trades. ',      c: WHITE },
    { t: 'Analyze Performance. ', c: ACCENT },
    { t: 'Journal Emotions.',   c: WHITE },
  ]
  let cx = x
  for (const s of segs) {
    ctx.fillStyle = s.c
    ctx.fillText(s.t, cx, yCenter)
    cx += ctx.measureText(s.t).width
  }
}

function fmtPrice(v) {
  if (v == null || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
}

function fmtPnl(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n >= 0 ? '+' : '-'}$${abs}`
}

/**
 * Draws the full share card for `trade` in the given `formatKey`
 * ('story'|'post'|'landscape') onto `canvas` at native resolution.
 */
export async function renderTradeShareCard(canvas, trade, formatKey) {
  const fmt = SHARE_FORMATS[formatKey]
  const L = LAYOUTS[formatKey]
  if (!fmt || !L || !trade) return

  canvas.width = fmt.w
  canvas.height = fmt.h
  const ctx = canvas.getContext('2d')

  await ensureFontsReady()
  const logo = await loadLogo()

  drawBackground(ctx, fmt.w, fmt.h)

  // ── Header: logo + wordmark ─────────────────────────────────────────
  if (logo) ctx.drawImage(logo, L.logo.x, L.logo.y, L.logo.size, L.logo.size)
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${L.wordmark.fontSize}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText('trado', L.wordmark.x, L.wordmark.yCenter)

  // ── Tagline ──────────────────────────────────────────────────────────
  drawTaglineSegments(ctx, L.tagline.x, L.tagline.yCenter, L.tagline.fontSize)

  // ── "Trade P&L" title ────────────────────────────────────────────────
  ctx.textBaseline = 'top'
  ctx.font = `700 ${L.title.fontSize}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText('Trade P&L', L.title.x, L.title.y)

  // ── Side | Size | Symbol row (flows dynamically — equal gaps regardless
  //    of how wide "Buy"/"Sell", the lot size, or the symbol turn out to be) ─
  const isBuy = (trade.side || '').toUpperCase() === 'BUY' || (trade.side || '').toLowerCase() === 'long'
  const sideLabel = isBuy ? 'Buy' : 'Sell'
  const size = trade.size ?? trade.quantity ?? '—'
  const sizeLabel = `${size} Lots`
  const symbol = (trade.symbol || '').toUpperCase()

  // Fit the whole row to the available width (long symbols shouldn't run off-canvas)
  const maxRowWidth = fmt.w - L.marginX * 2
  const measureRow = (fs) => {
    ctx.font = `700 ${fs}px ${FONT}`; const wSide = ctx.measureText(sideLabel).width
    ctx.font = `600 ${fs}px ${FONT}`; const wSize = ctx.measureText(sizeLabel).width
    const wSym = ctx.measureText(symbol).width
    ctx.font = `300 ${fs}px ${FONT}`; const wBar = ctx.measureText('|').width
    return wSide + wSize + wSym + wBar * 2
  }
  let rowFontSize = L.row.fontSize
  let rowGap = L.row.gap
  while (measureRow(rowFontSize) + rowGap * 4 > maxRowWidth && rowFontSize > L.row.fontSize * 0.55) {
    rowFontSize -= 1
    rowGap = L.row.gap * (rowFontSize / L.row.fontSize)
  }

  ctx.textBaseline = 'middle'
  let rx = L.marginX

  ctx.font = `700 ${rowFontSize}px ${FONT}`
  ctx.fillStyle = isBuy ? GREEN : RED
  ctx.fillText(sideLabel, rx, L.row.yCenter)
  rx += ctx.measureText(sideLabel).width + rowGap

  ctx.font = `300 ${rowFontSize}px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillText('|', rx, L.row.yCenter)
  rx += ctx.measureText('|').width + rowGap

  ctx.font = `600 ${rowFontSize}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText(sizeLabel, rx, L.row.yCenter)
  rx += ctx.measureText(sizeLabel).width + rowGap

  ctx.font = `300 ${rowFontSize}px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillText('|', rx, L.row.yCenter)
  rx += ctx.measureText('|').width + rowGap

  ctx.font = `600 ${rowFontSize}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText(symbol, rx, L.row.yCenter)

  // ── Big P&L number ───────────────────────────────────────────────────
  const pnl = Number(trade.pnl) || 0
  const pnlText = fmtPnl(pnl)
  const maxPnlWidth = fmt.w - L.marginX * 2 - (L.watermark ? L.watermark.size + 40 : 0)
  const pnlSize = fitFontSize(ctx, `${pnlText} USD`, L.pnl.fontSize, 800, maxPnlWidth)
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${pnlSize}px ${FONT}`
  ctx.fillStyle = pnl >= 0 ? ACCENT : RED
  ctx.fillText(pnlText, L.pnl.x, L.pnl.yCenter)
  const pnlWidth = ctx.measureText(pnlText).width + Math.round(pnlSize * 0.16)
  ctx.font = `500 ${Math.round(pnlSize * 0.32)}px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('USD', L.pnl.x + pnlWidth, L.pnl.yCenter + pnlSize * 0.05)

  // ── Entry / Exit labels + values ────────────────────────────────────
  ctx.textBaseline = 'top'
  ctx.font = `600 ${L.labels.fontSize}px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.fillText('Entry Price', L.labels.xEntry, L.labels.y)
  ctx.fillText('Exit Price',  L.labels.xExit,  L.labels.y)

  ctx.font = `700 ${L.values.fontSize}px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText(fmtPrice(trade.entry_price), L.values.xEntry, L.values.yTop)
  ctx.fillText(fmtPrice(trade.exit_price),  L.values.xExit,  L.values.yTop)

  // ── Watermark logo (Landscape / Post only) ──────────────────────────
  if (L.watermark && logo) {
    ctx.save()
    ctx.globalAlpha = L.watermark.opacity
    ctx.drawImage(logo, L.watermark.x, L.watermark.y, L.watermark.size, L.watermark.size)
    ctx.restore()
  }

  // ── Bottom tagline card (Story only) ────────────────────────────────
  if (L.bottomCard) {
    const bc = L.bottomCard
    ctx.save()
    roundRect(ctx, bc.x, bc.y, bc.w, bc.h, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
    ctx.restore()

    const padY = bc.y + bc.h / 2
    const logoSize = 118
    const logoX = bc.x + 32
    const logoY = padY - logoSize / 2
    if (logo) ctx.drawImage(logo, logoX, logoY, logoSize, logoSize)

    const dividerX = logoX + logoSize + 34
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(dividerX, padY - 90)
    ctx.lineTo(dividerX, padY + 90)
    ctx.stroke()

    const textX = dividerX + 34
    const lines = ['Track Trades', 'Analyze Performance', 'Journal Emotions.']
    ctx.textBaseline = 'middle'
    ctx.font = `700 34px ${FONT}`
    ctx.fillStyle = WHITE
    const lineH = 64
    const startY = padY - lineH
    lines.forEach((line, i) => ctx.fillText(line, textX, startY + i * lineH))
  }
}

/** Renders at full native resolution and resolves with a PNG Blob. */
export async function tradeShareCardBlob(trade, formatKey) {
  const canvas = document.createElement('canvas')
  await renderTradeShareCard(canvas, trade, formatKey)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1))
}

export function shareCardFileName(trade, formatKey) {
  const sym = (trade?.symbol || 'trade').replace(/[^A-Za-z0-9]/g, '')
  const date = (trade?.closed_at || trade?.opened_at || '').slice(0, 10) || 'trado'
  return `trado_${sym}_${date}_${formatKey}.png`
}