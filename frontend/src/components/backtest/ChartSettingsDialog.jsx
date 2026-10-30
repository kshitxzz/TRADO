import { useEffect, useMemo, useRef, useState } from 'react'
import { X, CandlestickChart, AlignLeft, TrendingUp, Pencil, AlarmClock, CalendarDays, ChevronDown, Trash2 } from 'lucide-react'
import Popover from './Popover'
import { Section, Field, Check2, TvSelect, MultiSelect, LineStyleSelect, NumBox, Swatch } from './SettingsControls'
import { useTheme } from '../../hooks/useTheme'
import {
  DEFAULT_SETTINGS, clone, mergeSettings, timezoneOptions, resolveTimezone, themeColors, TITLE_MODES, VISIBILITY, SYMBOL_LABEL_MODES, LEVEL_MODES,
  INDICATOR_VALUE_MODES, WATERMARK_PARTS, HOURS_FORMATS, FONT_SIZES, DATE_FORMATS, PRECISION_OPTIONS,
} from '../../lib/backtest/chartSettings'

const TABS = [
  { id: 'symbol', label: 'Symbol', icon: CandlestickChart }, { id: 'status', label: 'Status line', icon: AlignLeft },
  { id: 'scales', label: 'Scales and lines', icon: TrendingUp }, { id: 'canvas', label: 'Canvas', icon: Pencil },
  { id: 'alerts', label: 'Alerts', icon: AlarmClock }, { id: 'events', label: 'Events', icon: CalendarDays },
]
const THEMES = [{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]
const BG_TYPES = [{ id: 'solid', label: 'Solid' }, { id: 'gradient', label: 'Gradient' }]

/** Template menu in the footer: reset, save the current look, apply or delete saved ones. */
function TemplateMenu({ templates, onApply, onSave, onDelete, onReset }) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef(null)
  const close = () => { setOpen(false); setNaming(false); setName('') }
  const save = () => { const n = name.trim(); if (n) { onSave(n); close() } }
  return (
    <div ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="h-[36px] px-3.5 rounded-lg flex items-center gap-2 text-[13px] font-semibold hover:bg-white/5" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
        Template <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={close} placement="top" style={{ width: 250 }}>
        <div className="py-1.5">
          <button type="button" onClick={() => { onReset(); close() }} className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>Reset settings</button>
          {naming ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Template name" onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); e.stopPropagation() }}
                     className="flex-1 min-w-0 h-8 rounded-md px-2.5 text-[13px] outline-none" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <button type="button" onClick={save} className="btn-primary h-8 px-3 rounded-md text-[12px] font-semibold text-white">Save</button>
            </div>
          ) : (
            <button type="button" onClick={() => setNaming(true)} className="w-full px-3.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>Save as…</button>
          )}
          {templates.length > 0 && <div className="my-1 mx-3 h-px" style={{ background: 'var(--border-subtle)' }} />}
          {templates.map(t => (
            <div key={t.name} className="group flex items-center">
              <button type="button" onClick={() => { onApply(t.settings); close() }} className="flex-1 min-w-0 truncate px-3.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: 'var(--text-primary)' }}>{t.name}</button>
              <button type="button" onClick={() => onDelete(t.name)} title="Delete template" className="p-2 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10"><Trash2 size={13} style={{ color: 'var(--negative-red)' }} /></button>
            </div>
          ))}
        </div>
      </Popover>
    </div>
  )
}

export default function ChartSettingsDialog({ settings, onPreview, onApply, onCancel, templates, onSaveTemplate, onDeleteTemplate, appHour12 }) {
  const { theme, setTheme, isDark } = useTheme()
  const startTheme = useRef(theme)                      // the colour theme previews live; Cancel puts it back
  const [draft, setDraft] = useState(() => clone(settings))
  const [tab, setTab] = useState('symbol')
  const auto = useMemo(() => themeColors(isDark), [isDark])
  const tzOptions = useMemo(() => timezoneOptions(), [])

  const cancel = () => { setTheme(startTheme.current); onCancel() }
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  useEffect(() => {
    // Esc first closes an open dropdown; only when none is open does it cancel the dialog
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-bt-popover]')) cancelRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const update = (section, patch) => {
    const next = { ...draft, [section]: { ...draft[section], ...patch } }
    setDraft(next); onPreview(next)
  }
  const replace = (next) => { setDraft(next); onPreview(next) }
  const S = draft.symbol, ST = draft.status, SC = draft.scales, C = draft.canvas, A = draft.alerts, E = draft.events
  const hoursNow = SC.hours ?? (appHour12 ? '12' : '24')
  const dateOptions = DATE_FORMATS.map(o => ({ ...o, label: SC.dayOfWeek ? `Mon ${o.label}` : o.label }))
  const candleUp = S.body.on ? S.body.up : S.borders.up

  // ── draggable title bar ────────────────────────────────────────────────
  const boxRef = useRef(null)
  const drag = useRef(null)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const onDown = (e) => {
    if (e.target.closest('button')) return
    drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y, r: boxRef.current.getBoundingClientRect() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
    const dx = clamp(d.r.left + e.clientX - d.sx, 120 - d.r.width, window.innerWidth - 120) - d.r.left
    const dy = clamp(d.r.top + e.clientY - d.sy, 0, window.innerHeight - 56) - d.r.top
    setOff({ x: d.ox + dx, y: d.oy + dy })
  }
  const onUp = () => { drag.current = null }

  const candleRow = (key, label) => (
    <div className="flex items-center justify-between min-h-[36px]">
      <Check2 checked={S[key].on} onChange={(on) => update('symbol', { [key]: { ...S[key], on } })} label={label} />
      <div className="flex gap-2">
        <Swatch value={S[key].up} onChange={(up) => update('symbol', { [key]: { ...S[key], up } })} title={`${label} — up candle`} />
        <Swatch value={S[key].down} onChange={(down) => update('symbol', { [key]: { ...S[key], down } })} title={`${label} — down candle`} />
      </div>
    </div>
  )
  const lineRow = (label, node) => <div className="flex items-center justify-between min-h-[36px]">{label}<div className="flex items-center gap-2">{node}</div></div>

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
      <div ref={boxRef} role="dialog" aria-label="Chart Settings" className="pointer-events-auto w-full flex flex-col rounded-xl overflow-hidden"
           style={{ maxWidth: 735, maxHeight: 'min(650px, 92vh)', transform: `translate(${off.x}px, ${off.y}px)`, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-6 h-[66px] flex-shrink-0 cursor-move select-none touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
             style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>Chart Settings</h2>
          <button type="button" onClick={cancel} aria-label="Close" className="p-1.5 -mr-1.5 rounded-md hover:bg-white/10 cursor-pointer" style={{ color: 'var(--text-secondary)' }}><X size={19} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="flex-shrink-0 p-2.5 space-y-1 overflow-y-auto" style={{ width: 194, borderRight: '1px solid var(--border-subtle)' }}>
            {TABS.map(t => {
              const Icon = t.icon, on = tab === t.id
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} className="w-full flex items-center gap-2.5 px-3 h-[36px] rounded-lg text-[13px] text-left whitespace-nowrap transition-colors hover:bg-white/5"
                        style={{ background: on ? 'rgba(255,255,255,0.08)' : undefined, color: 'var(--text-primary)', fontWeight: on ? 600 : 400 }}>
                  <Icon size={15} style={{ color: on ? 'var(--accent-purple-light, var(--accent-purple))' : 'var(--text-secondary)' }} /> {t.label}
                </button>
              )
            })}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
            {/* ── Symbol ── */}
            {tab === 'symbol' && (<>
              <Section title="Theme">
                <Field label="Color theme"><TvSelect value={theme} options={THEMES} onChange={setTheme} width={150} /></Field>
              </Section>
              <Section title="Candles">
                <Check2 checked={S.colorByPrevClose} onChange={(v) => update('symbol', { colorByPrevClose: v })} label="Color bars based on previous close" />
                {candleRow('body', 'Body')}
                {candleRow('borders', 'Borders')}
                {candleRow('wick', 'Wick')}
              </Section>
              <Section title="Data modification">
                <Field label="Precision"><TvSelect value={S.precision} options={PRECISION_OPTIONS} onChange={(v) => update('symbol', { precision: v === 'default' ? 'default' : Number(v) })} width={150} /></Field>
                <Field label="Timezone"><TvSelect value={resolveTimezone(S.timezone)} options={tzOptions} onChange={(v) => update('symbol', { timezone: v })} width={210} maxHeight={320} /></Field>
              </Section>
            </>)}

            {/* ── Status line ── */}
            {tab === 'status' && (<>
              <Section title="Instrument">
                {lineRow(<Check2 checked={ST.title} onChange={(v) => update('status', { title: v })} label="Title" />,
                  <TvSelect value={ST.titleMode} options={TITLE_MODES} onChange={(v) => update('status', { titleMode: v })} width={190} disabled={!ST.title} />)}
                <Check2 checked={ST.marketStatus} onChange={(v) => update('status', { marketStatus: v })} label="Open market status" />
                <Check2 checked={ST.chartValues} onChange={(v) => update('status', { chartValues: v })} label="Chart values" />
                <Check2 checked={ST.barChange} onChange={(v) => update('status', { barChange: v })} label="Bar change values" />
                <Check2 checked={ST.volume} onChange={(v) => update('status', { volume: v })} label="Volume" />
              </Section>
              <Section title="Indicators">
                <Check2 checked={ST.indTitles} onChange={(v) => update('status', { indTitles: v })} label="Titles" />
                <Check2 checked={ST.indInputs} onChange={(v) => update('status', { indInputs: v })} label="Inputs" indent={1} disabled={!ST.indTitles} />
                <Check2 checked={ST.indValues} onChange={(v) => update('status', { indValues: v })} label="Values" />
                {lineRow(<Check2 checked={ST.indBackground} onChange={(v) => update('status', { indBackground: v })} label="Background" />,
                  <Swatch value={ST.indBackgroundColor} onChange={(v) => update('status', { indBackgroundColor: v ?? DEFAULT_SETTINGS.status.indBackgroundColor })} title="Background colour" />)}
              </Section>
            </>)}

            {/* ── Scales and lines ── */}
            {tab === 'scales' && (<>
              <Section title="Price scale and lines">
                <Check2 checked={SC.noOverlap} onChange={(v) => update('scales', { noOverlap: v })} label="No overlapping labels" />
                <Check2 checked={SC.plusButton} onChange={(v) => update('scales', { plusButton: v })} label="Plus button" />
                <Check2 checked={SC.invert} onChange={(v) => update('scales', { invert: v })} label="Invert scale" />
                <Check2 checked={SC.countdown} onChange={(v) => update('scales', { countdown: v })} label="Countdown to bar close" />
                <Field label="Symbol">
                  <TvSelect value={SC.symbolLabel} options={SYMBOL_LABEL_MODES} onChange={(v) => update('scales', { symbolLabel: v })} width={160} />
                  <Swatch value={SC.symbolLineColor} auto="#9CA3AF" onChange={(v) => update('scales', { symbolLineColor: v })} title="Last price line" />
                </Field>
                <Field label="Symbol label color">
                  <Swatch value={SC.labelBg} auto={candleUp} opacity={false} onChange={(v) => update('scales', { labelBg: v })} title="Label background" />
                  <Swatch value={SC.labelText} auto="#FFFFFF" opacity={false} onChange={(v) => update('scales', { labelText: v })} title="Label text" />
                </Field>
                <Field label="Indicators and financials"><TvSelect value={SC.indicatorValues} options={INDICATOR_VALUE_MODES} onChange={(v) => update('scales', { indicatorValues: v })} width={150} /></Field>
                <Field label="High and low">
                  <TvSelect value={SC.highLow} options={LEVEL_MODES} onChange={(v) => update('scales', { highLow: v })} width={160} />
                  <Swatch value={SC.highLowColor} onChange={(v) => update('scales', { highLowColor: v ?? DEFAULT_SETTINGS.scales.highLowColor })} title="High and low lines" />
                </Field>
              </Section>
              <Section title="Time scale">
                <Check2 checked={SC.dayOfWeek} onChange={(v) => update('scales', { dayOfWeek: v })} label="Day of week on labels" />
                <Field label="Date format"><TvSelect value={SC.dateFormat} options={dateOptions} onChange={(v) => update('scales', { dateFormat: v })} width={160} /></Field>
                <Field label="Time hours format"><TvSelect value={hoursNow} options={HOURS_FORMATS} onChange={(v) => update('scales', { hours: v })} width={160} /></Field>
              </Section>
            </>)}

            {/* ── Canvas ── */}
            {tab === 'canvas' && (<>
              <Section title="Chart basic styles">
                <Field label="Background">
                  <TvSelect value={C.bgType} options={BG_TYPES} onChange={(v) => update('canvas', { bgType: v })} width={150} />
                  <Swatch value={C.bg} auto={auto.bg} opacity={false} onChange={(v) => update('canvas', { bg: v })} title={C.bgType === 'gradient' ? 'Top colour' : 'Colour'} />
                  {C.bgType === 'gradient' && <Swatch value={C.bg2} auto={auto.bg2} opacity={false} onChange={(v) => update('canvas', { bg2: v })} title="Bottom colour" />}
                </Field>
                {lineRow(<Check2 checked={C.vGrid.on} onChange={(on) => update('canvas', { vGrid: { ...C.vGrid, on } })} label="Vertical grid lines" />, <>
                  <Swatch value={C.vGrid.color} auto={auto.grid} onChange={(color) => update('canvas', { vGrid: { ...C.vGrid, color } })} />
                  <LineStyleSelect value={C.vGrid.style} onChange={(style) => update('canvas', { vGrid: { ...C.vGrid, style } })} />
                </>)}
                {lineRow(<Check2 checked={C.hGrid.on} onChange={(on) => update('canvas', { hGrid: { ...C.hGrid, on } })} label="Horizontal grid lines" />, <>
                  <Swatch value={C.hGrid.color} auto={auto.grid} onChange={(color) => update('canvas', { hGrid: { ...C.hGrid, color } })} />
                  <LineStyleSelect value={C.hGrid.style} onChange={(style) => update('canvas', { hGrid: { ...C.hGrid, style } })} />
                </>)}
                <Field label="Crosshair">
                  <Swatch value={C.crosshair.color} auto={auto.crosshair} onChange={(color) => update('canvas', { crosshair: { ...C.crosshair, color } })} />
                  <LineStyleSelect value={C.crosshair.style} onChange={(style) => update('canvas', { crosshair: { ...C.crosshair, style } })} />
                </Field>
                <Field label="Watermark">
                  <MultiSelect options={WATERMARK_PARTS} value={C.watermark} onChange={(w) => update('canvas', { watermark: { ...C.watermark, ...w } })} width={160} />
                  <Swatch value={C.watermark.color} auto={auto.watermark} onChange={(color) => update('canvas', { watermark: { ...C.watermark, color } })} />
                </Field>
              </Section>
              <Section title="Scales">
                <Field label="Text">
                  <Swatch value={C.scaleText.color} auto={auto.scaleText} opacity={false} onChange={(color) => update('canvas', { scaleText: { ...C.scaleText, color } })} />
                  <TvSelect value={C.scaleText.size} options={FONT_SIZES} onChange={(size) => update('canvas', { scaleText: { ...C.scaleText, size: Number(size) } })} width={120} />
                </Field>
                <Field label="Lines"><Swatch value={C.scaleLines.color} auto={auto.scaleLine} onChange={(color) => update('canvas', { scaleLines: { color } })} /></Field>
              </Section>
              <Section title="Buttons">
                <Field label="Navigation"><TvSelect value={C.navButtons} options={VISIBILITY} onChange={(v) => update('canvas', { navButtons: v })} width={190} /></Field>
                <Field label="Pane"><TvSelect value={C.paneButtons} options={VISIBILITY} onChange={(v) => update('canvas', { paneButtons: v })} width={190} /></Field>
              </Section>
              <Section title="Margins">
                <Field label="Top"><NumBox value={C.margins.top} min={0} max={45} unit="%" onChange={(top) => update('canvas', { margins: { ...C.margins, top } })} /></Field>
                <Field label="Bottom"><NumBox value={C.margins.bottom} min={0} max={45} unit="%" onChange={(bottom) => update('canvas', { margins: { ...C.margins, bottom } })} /></Field>
                <Field label="Right"><NumBox value={C.margins.right} min={0} max={100} unit="bars" onChange={(right) => update('canvas', { margins: { ...C.margins, right } })} /></Field>
              </Section>
            </>)}

            {/* ── Alerts ── */}
            {tab === 'alerts' && (
              <Section title="Alerts">
                <Check2 checked={A.lines} onChange={(v) => update('alerts', { lines: v })} label="Alert lines" />
              </Section>
            )}

            {/* ── Events ── */}
            {tab === 'events' && (
              <Section title="Events">
                {lineRow(<Check2 checked={E.sessionBreaks} onChange={(v) => update('events', { sessionBreaks: v })} label="Session breaks" />, <>
                  <Swatch value={E.color} onChange={(v) => update('events', { color: v ?? DEFAULT_SETTINGS.events.color })} title="Session break colour" />
                  <LineStyleSelect value={E.style} onChange={(style) => update('events', { style })} />
                </>)}
              </Section>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 h-[68px] flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <TemplateMenu templates={templates} onApply={(s) => replace(mergeSettings(s))} onSave={(n) => onSaveTemplate(n, draft)} onDelete={onDeleteTemplate} onReset={() => replace(clone(DEFAULT_SETTINGS))} />
          <div className="flex gap-2.5">
            <button type="button" onClick={cancel} className="h-[36px] px-5 rounded-lg text-[13px] font-semibold hover:bg-white/5" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>Cancel</button>
            <button type="button" onClick={() => onApply(draft)} className="btn-primary h-[36px] px-6 rounded-lg text-[13px] font-bold text-white">OK</button>
          </div>
        </div>
      </div>
    </div>
  )
}