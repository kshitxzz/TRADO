import { useMemo, useRef, useState } from 'react'
import { X, CandlestickChart, AlignLeft, Ruler, Pencil, TrendingUp, AlarmClock, CalendarDays, ChevronDown, Trash2 } from 'lucide-react'
import Popover from './Popover'
import { Section, Field, Hint, Check2, TvSelect, NumBox, TvSlider, Swatch } from './SettingsControls'
import {
  DEFAULT_SETTINGS, clone, sameSettings, mergeSettings, timezoneOptions, themeColors, TITLE_MODES, VISIBILITY, PLACEMENTS, SYMBOL_LABEL_MODES, LEVEL_MODES,
  INDICATOR_VALUE_MODES, WATERMARK_MODES, PNL_MODES, ALIGNMENTS, HOURS_FORMATS, FONT_SIZES, SOUND_KINDS, DATE_FORMATS, PRECISION_OPTIONS,
} from '../../lib/backtest/chartSettings'
import { playSound } from '../../lib/backtest/sound'

const TABS = [
  { id: 'symbol', label: 'Symbol', icon: CandlestickChart }, { id: 'status', label: 'Status line', icon: AlignLeft },
  { id: 'scales', label: 'Scales and lines', icon: Ruler }, { id: 'canvas', label: 'Canvas', icon: Pencil },
  { id: 'trading', label: 'Trading', icon: TrendingUp }, { id: 'alerts', label: 'Alerts', icon: AlarmClock },
  { id: 'events', label: 'Events', icon: CalendarDays },
]

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
      <button type="button" onClick={() => setOpen(o => !o)} className="h-[36px] px-3.5 rounded-lg flex items-center gap-2 text-[13px] hover:bg-white/5" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
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

export default function ChartSettingsDialog({
  settings, onPreview, onApply, onCancel, isDark, symbol, templates, onSaveTemplate, onDeleteTemplate, appHour12, getRatio,
}) {
  const [draft, setDraft] = useState(() => clone(settings))
  const [tab, setTab] = useState('symbol')
  const auto = useMemo(() => themeColors(isDark), [isDark])
  const tzOptions = useMemo(() => timezoneOptions(), [])

  const update = (section, patch) => {
    const next = { ...draft, [section]: { ...draft[section], ...patch } }
    setDraft(next); onPreview(next)
  }
  const replace = (next) => { setDraft(next); onPreview(next) }
  const d = draft
  const S = d.symbol, ST = d.status, SC = d.scales, C = d.canvas, T = d.trading, A = d.alerts, E = d.events
  const hoursNow = SC.hours ?? (appHour12 ? '12' : '24')
  const dateOptions = DATE_FORMATS.map(o => ({ ...o, label: SC.dayOfWeek ? `Mon ${o.label}` : o.label }))

  const candleRow = (key, label) => (
    <div className="flex items-center gap-3">
      <div style={{ width: 124 }}><Check2 checked={S[key].on} onChange={(on) => update('symbol', { [key]: { ...S[key], on } })} label={label} /></div>
      <Swatch value={S[key].up} onChange={(up) => update('symbol', { [key]: { ...S[key], up } })} title={`${label} — up candle`} />
      <Swatch value={S[key].down} onChange={(down) => update('symbol', { [key]: { ...S[key], down } })} title={`${label} — down candle`} />
    </div>
  )
  const levelRow = (label, modeKey, extra) => (
    <Field label={label}>
      <TvSelect value={SC[modeKey]} options={LEVEL_MODES} onChange={(v) => update('scales', { [modeKey]: v })} width={196} />
      {extra}
    </Field>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onPointerDown={onCancel}>
      <div className="w-full flex flex-col rounded-2xl overflow-hidden" onPointerDown={(e) => e.stopPropagation()}
           style={{ maxWidth: 760, height: 'min(660px, 90vh)', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', boxShadow: '0 30px 100px rgba(0,0,0,0.7)' }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="flex-shrink-0 px-4 pb-2 space-y-1 overflow-y-auto" style={{ width: 212 }}>
            {TABS.map(t => {
              const Icon = t.icon, on = tab === t.id
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} className="w-full flex items-center gap-3 px-3 h-[42px] rounded-lg text-[14px] text-left transition-colors hover:bg-white/5"
                        style={{ background: on ? 'rgba(255,255,255,0.07)' : undefined, color: 'var(--text-primary)', fontWeight: on ? 600 : 400 }}>
                  <Icon size={17} style={{ color: 'var(--text-secondary)' }} /> {t.label}
                </button>
              )
            })}
          </nav>

          <div className="flex-1 min-w-0 overflow-y-auto pl-4 pr-6 pb-4" style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: 24 }}>
            {/* ── Symbol ── */}
            {tab === 'symbol' && (<>
              <Section title="Candles">
                <Check2 checked={S.colorByPrevClose} onChange={(v) => update('symbol', { colorByPrevClose: v })} label="Color bars based on previous close" />
                {candleRow('body', 'Body')}
                {candleRow('borders', 'Borders')}
                {candleRow('wick', 'Wick')}
              </Section>
              <Section title="Data modification">
                <Field label="Precision" labelWidth={120}><TvSelect value={S.precision} options={PRECISION_OPTIONS} onChange={(v) => update('symbol', { precision: v === 'default' ? 'default' : Number(v) })} width={196} /></Field>
                <Field label="Timezone" labelWidth={120}><TvSelect value={S.timezone} options={[{ id: 'local', label: 'Browser time' }, ...tzOptions]} onChange={(v) => update('symbol', { timezone: v })} width={260} maxHeight={320} /></Field>
              </Section>
            </>)}

            {/* ── Status line ── */}
            {tab === 'status' && (<>
              <Section title="Instrument">
                <Check2 checked={ST.logo} onChange={(v) => update('status', { logo: v })} label="Logo" />
                <div className="flex items-center gap-4">
                  <Check2 checked={ST.title} onChange={(v) => update('status', { title: v })} label="Title" />
                  <TvSelect value={ST.titleMode} options={TITLE_MODES} onChange={(v) => update('status', { titleMode: v })} width={180} disabled={!ST.title} />
                </div>
                <Check2 checked={ST.marketStatus} onChange={(v) => update('status', { marketStatus: v })} label="Open market status" />
                <Check2 checked={ST.chartValues} onChange={(v) => update('status', { chartValues: v })} label="Chart values" />
                <Check2 checked={ST.barChange} onChange={(v) => update('status', { barChange: v })} label="Bar change values" />
                <Check2 checked={ST.volume} onChange={(v) => update('status', { volume: v })} label="Volume" />
                <Check2 checked={ST.lastDayChange} onChange={(v) => update('status', { lastDayChange: v })} label="Last day change values" />
                <Check2 checked={ST.buySell} onChange={(v) => { update('status', { buySell: v }); replace({ ...draft, status: { ...ST, buySell: v }, trading: { ...T, buySell: v } }) }} label="Buy/sell buttons" hint="Displays buy and sell buttons directly on the chart" />
              </Section>
              <Section title="Indicators">
                <Check2 checked={ST.indTitles} onChange={(v) => update('status', { indTitles: v })} label="Titles" />
                <Check2 checked={ST.indInputs} onChange={(v) => update('status', { indInputs: v })} label="Inputs" indent={1} disabled={!ST.indTitles} />
                <Check2 checked={ST.indValues} onChange={(v) => update('status', { indValues: v })} label="Values" />
                <div className="flex items-center gap-4">
                  <Check2 checked={ST.indBackground} onChange={(v) => update('status', { indBackground: v })} label="Background" />
                  <TvSlider value={ST.indBackgroundOpacity} onChange={(v) => update('status', { indBackgroundOpacity: v })} width={110} />
                </div>
              </Section>
            </>)}

            {/* ── Scales and lines ── */}
            {tab === 'scales' && (<>
              <Section title="Price scale">
                <Field label="Currency and Unit"><TvSelect value={SC.currencyUnit} options={VISIBILITY} onChange={(v) => update('scales', { currencyUnit: v })} width={224} /></Field>
                <Field label="Scale modes (A and L)"><TvSelect value={SC.scaleModes} options={VISIBILITY} onChange={(v) => update('scales', { scaleModes: v })} width={224} /></Field>
                <Field label={<Check2 checked={SC.lockRatio} onChange={(v) => update('scales', { lockRatio: v, ...(v && !SC.ratio ? { ratio: getRatio?.() || 0 } : {}) })} label="Lock price to bar ratio" />}>
                  <NumBox value={SC.ratio || ''} onChange={(v) => update('scales', { ratio: v })} min={0.000001} max={1000000} decimals={6} width={150} disabled={!SC.lockRatio} />
                </Field>
                <Field label="Scales placement"><TvSelect value={SC.placement} options={PLACEMENTS} onChange={(v) => update('scales', { placement: v })} width={196} /></Field>
              </Section>
              <Section title="Price labels & lines">
                <Check2 checked={SC.plusButton} onChange={(v) => update('scales', { plusButton: v })} label="Plus button" hint="A “+” on the price scale at the cursor to add an alert or an order at that price" />
                <Check2 checked={SC.countdown} onChange={(v) => update('scales', { countdown: v })} label="Countdown to bar close" />
                <Field label="Symbol">
                  <TvSelect value={SC.symbolLabel} options={SYMBOL_LABEL_MODES} onChange={(v) => update('scales', { symbolLabel: v })} width={196} />
                  <Swatch value={SC.symbolLineColor} auto="#9CA3AF" onChange={(v) => update('scales', { symbolLineColor: v })} style={SC.symbolLineStyle} onStyle={(v) => update('scales', { symbolLineStyle: v })} title="Last price line" />
                </Field>
                {levelRow('Previous day close', 'prevDayClose', <Swatch value={SC.prevDayColor} onChange={(v) => update('scales', { prevDayColor: v })} style={SC.prevDayStyle} onStyle={(v) => update('scales', { prevDayStyle: v })} />)}
                <Field label="Indicators"><TvSelect value={SC.indicatorValues} options={INDICATOR_VALUE_MODES} onChange={(v) => update('scales', { indicatorValues: v })} width={196} /></Field>
                {levelRow('High and low', 'highLow', <><Swatch value={SC.highColor} onChange={(v) => update('scales', { highColor: v })} title="High" /><Swatch value={SC.lowColor} onChange={(v) => update('scales', { lowColor: v })} title="Low" /></>)}
                {levelRow('Bid and ask', 'bidAsk', <><Swatch value={SC.bidColor} onChange={(v) => update('scales', { bidColor: v })} title="Bid" /><Swatch value={SC.askColor} onChange={(v) => update('scales', { askColor: v })} title="Ask" /></>)}
              </Section>
              <Section title="Time scale">
                <Check2 checked={SC.dayOfWeek} onChange={(v) => update('scales', { dayOfWeek: v })} label="Day of week on labels" />
                <Field label="Date format"><TvSelect value={SC.dateFormat} options={dateOptions} onChange={(v) => update('scales', { dateFormat: v })} width={196} /></Field>
                <Field label="Time hours format"><TvSelect value={hoursNow} options={HOURS_FORMATS} onChange={(v) => update('scales', { hours: v })} width={150} /></Field>
                <Check2 checked={SC.saveLeftEdge} onChange={(v) => update('scales', { saveLeftEdge: v })} label="Save chart left edge position when changing interval" />
              </Section>
            </>)}

            {/* ── Canvas ── */}
            {tab === 'canvas' && (<>
              <Section title="Chart basic styles">
                <Field label="Background" labelWidth={170}>
                  <TvSelect value={C.bgType} options={[{ id: 'solid', label: 'Solid' }, { id: 'gradient', label: 'Gradient' }]} onChange={(v) => update('canvas', { bgType: v })} width={140} />
                  <Swatch value={C.bg} auto={auto.bg} opacity={false} onChange={(v) => update('canvas', { bg: v })} title={C.bgType === 'gradient' ? 'Top colour' : 'Colour'} />
                  {C.bgType === 'gradient' && <Swatch value={C.bg2} auto={auto.bg2} opacity={false} onChange={(v) => update('canvas', { bg2: v })} title="Bottom colour" />}
                </Field>
                <Field label={<Check2 checked={C.vGrid.on} onChange={(on) => update('canvas', { vGrid: { ...C.vGrid, on } })} label="Vertical grid lines" />} labelWidth={170}>
                  <Swatch value={C.vGrid.color} auto={auto.grid} onChange={(color) => update('canvas', { vGrid: { ...C.vGrid, color } })} />
                </Field>
                <Field label={<Check2 checked={C.hGrid.on} onChange={(on) => update('canvas', { hGrid: { ...C.hGrid, on } })} label="Horizontal grid lines" />} labelWidth={170}>
                  <Swatch value={C.hGrid.color} auto={auto.grid} onChange={(color) => update('canvas', { hGrid: { ...C.hGrid, color } })} />
                </Field>
                <Field label="Crosshair" labelWidth={170}>
                  <Swatch value={C.crosshair.color} auto={auto.crosshair} style={C.crosshair.style} onStyle={(style) => update('canvas', { crosshair: { ...C.crosshair, style } })} onChange={(color) => update('canvas', { crosshair: { ...C.crosshair, color } })} />
                </Field>
                <Field label="Watermark" labelWidth={170}>
                  <TvSelect value={C.watermark.mode} options={WATERMARK_MODES} onChange={(mode) => update('canvas', { watermark: { ...C.watermark, mode } })} width={236} />
                  <Swatch value={C.watermark.color} auto={auto.watermark} onChange={(color) => update('canvas', { watermark: { ...C.watermark, color } })} />
                </Field>
              </Section>
              <Section title="Scales">
                <Field label="Text" labelWidth={170}>
                  <Swatch value={C.scaleText.color} auto={auto.scaleText} opacity={false} onChange={(color) => update('canvas', { scaleText: { ...C.scaleText, color } })} />
                  <TvSelect value={C.scaleText.size} options={FONT_SIZES} onChange={(size) => update('canvas', { scaleText: { ...C.scaleText, size: Number(size) } })} width={96} />
                </Field>
                <Field label="Lines" labelWidth={170}><Swatch value={C.scaleLines.color} auto={auto.scaleLine} onChange={(color) => update('canvas', { scaleLines: { color } })} /></Field>
              </Section>
              <Section title="Buttons">
                <Field label="Navigation" labelWidth={170}><TvSelect value={C.navButtons} options={VISIBILITY} onChange={(v) => update('canvas', { navButtons: v })} width={224} /></Field>
                <Field label="Pane" labelWidth={170}><TvSelect value={C.paneButtons} options={VISIBILITY} onChange={(v) => update('canvas', { paneButtons: v })} width={224} /></Field>
              </Section>
              <Section title="Margins">
                <Field label="Top" labelWidth={170}><NumBox value={C.margins.top} min={0} max={45} unit="%" onChange={(top) => update('canvas', { margins: { ...C.margins, top } })} /></Field>
                <Field label="Bottom" labelWidth={170}><NumBox value={C.margins.bottom} min={0} max={45} unit="%" onChange={(bottom) => update('canvas', { margins: { ...C.margins, bottom } })} /></Field>
                <Field label="Right" labelWidth={170}><NumBox value={C.margins.right} min={0} max={100} unit="bars" onChange={(right) => update('canvas', { margins: { ...C.margins, right } })} /></Field>
              </Section>
            </>)}

            {/* ── Trading ── */}
            {tab === 'trading' && (<>
              <Section title="General">
                <Check2 checked={T.buySell} onChange={(v) => replace({ ...draft, trading: { ...T, buySell: v }, status: { ...ST, buySell: v } })} label="Buy/sell buttons" hint="Displays buy and sell buttons directly on the chart" />
                <Check2 checked={T.oneClick} onChange={(v) => update('trading', { oneClick: v })} label="One-click trading" hint="Instantly place, edit, cancel orders, or close positions without confirmation" />
                <div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <Check2 checked={T.sound.on} onChange={(on) => { update('trading', { sound: { ...T.sound, on } }); if (on) playSound(T.sound.kind, T.sound.volume) }} label="Execution sound" />
                    <TvSlider value={T.sound.volume} onChange={(volume) => update('trading', { sound: { ...T.sound, volume } })} width={130} />
                  </div>
                  <div className="mt-2.5" style={{ paddingLeft: 28 }}>
                    <TvSelect value={T.sound.kind} options={SOUND_KINDS} onChange={(kind) => { update('trading', { sound: { ...T.sound, kind } }); playSound(kind, T.sound.volume) }} width={190} disabled={!T.sound.on} />
                  </div>
                </div>
                <Check2 checked={T.onlyRejections} onChange={(v) => update('trading', { onlyRejections: v })} label="Show only rejection notifications" />
              </Section>
              <Section title="Appearance">
                <Check2 checked={T.positionsAndOrders} onChange={(v) => update('trading', { positionsAndOrders: v })} label="Positions and orders" hint="Lines, labels and close / cancel buttons for your open trades" />
                <Check2 checked={T.reverseButton} onChange={(v) => update('trading', { reverseButton: v })} label="Reverse position button" indent={1} disabled={!T.positionsAndOrders} hint="Adds the reverse button next to the open position on the chart" />
                <Check2 checked={T.projectOrder} onChange={(v) => update('trading', { projectOrder: v })} label="Project order for market orders" hint="Shows a project order on the chart before sending a market order" />
                <Check2 checked={T.pnl.on} onChange={(on) => update('trading', { pnl: { ...T.pnl, on } })} label="Profit and loss value" />
                <div className="flex items-center gap-4" style={{ paddingLeft: 28 }}>
                  <div style={{ width: 120 }}><Check2 checked={T.pnl.positionsOn} onChange={(positionsOn) => update('trading', { pnl: { ...T.pnl, positionsOn } })} label="Positions" disabled={!T.pnl.on} /></div>
                  <TvSelect value={T.pnl.positions} options={PNL_MODES} onChange={(positions) => update('trading', { pnl: { ...T.pnl, positions } })} width={160} disabled={!T.pnl.on} />
                </div>
                <div className="flex items-center gap-4" style={{ paddingLeft: 28 }}>
                  <div style={{ width: 120 }}><Check2 checked={T.pnl.bracketsOn} onChange={(bracketsOn) => update('trading', { pnl: { ...T.pnl, bracketsOn } })} label="Brackets" disabled={!T.pnl.on} /></div>
                  <TvSelect value={T.pnl.brackets} options={PNL_MODES} onChange={(brackets) => update('trading', { pnl: { ...T.pnl, brackets } })} width={160} disabled={!T.pnl.on} />
                </div>
                <Check2 checked={T.executionMarks} onChange={(v) => update('trading', { executionMarks: v })} label="Execution marks" hint="Arrows on the candles where trades opened and closed" />
                <Check2 checked={T.executionLabels} onChange={(v) => update('trading', { executionLabels: v })} label="Execution labels" indent={1} disabled={!T.executionMarks} />
                <Check2 checked={T.extendedLines} onChange={(v) => update('trading', { extendedLines: v })} label="Extended price lines across the entire chart width" />
                <Field label="Order and position alignment" labelWidth={230}><TvSelect value={T.alignment} options={ALIGNMENTS} onChange={(v) => update('trading', { alignment: v })} width={150} /></Field>
                <Check2 checked={T.snapshots} onChange={(v) => update('trading', { snapshots: v })} label="Orders, executions, and positions in chart snapshots" hint="Shows your trades on the chart in snapshots" />
              </Section>
            </>)}

            {/* ── Alerts ── */}
            {tab === 'alerts' && (<>
              <Section title="Chart line visibility">
                <div className="flex items-center gap-3">
                  <Check2 checked={A.lines} onChange={(v) => update('alerts', { lines: v })} label="Alert lines" />
                  <Swatch value={A.color} onChange={(v) => update('alerts', { color: v })} opacity={false} />
                </div>
                <Check2 checked={A.onlyActive} onChange={(v) => update('alerts', { onlyActive: v })} label="Only active alerts" hint="Hide the line of an alert once it has triggered" />
              </Section>
              <Section title="Notifications">
                <Check2 checked={A.autoHideToasts} onChange={(v) => update('alerts', { autoHideToasts: v })} label="Automatically hide toasts" hint="Alert notifications disappear after a few seconds; turn off to keep them until you close them" />
              </Section>
            </>)}

            {/* ── Events ── */}
            {tab === 'events' && (
              <Section title="Session markers">
                <div className="flex items-center gap-3">
                  <Check2 checked={E.daySeparators} onChange={(v) => update('events', { daySeparators: v })} label="Day separators" />
                  <Swatch value={E.separatorColor} auto={auto.separator} onChange={(v) => update('events', { separatorColor: v })} />
                </div>
                <Hint>A vertical line at the start of each day (in the timezone you chose) on intraday charts. Economic-calendar events can’t be shown on a historical replay.</Hint>
              </Section>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <TemplateMenu templates={templates} onApply={(s) => replace(mergeSettings(s))} onSave={(n) => onSaveTemplate(n, draft)} onDelete={onDeleteTemplate}
                        onReset={() => replace(clone(DEFAULT_SETTINGS))} />
          <div className="flex gap-2.5">
            <button type="button" onClick={onCancel} className="h-[38px] px-5 rounded-lg text-[13.5px] font-semibold hover:bg-white/5" style={{ border: '1px solid var(--text-muted)', color: 'var(--text-primary)' }}>Cancel</button>
            <button type="button" onClick={() => onApply(draft)} className="h-[38px] px-6 rounded-lg text-[13.5px] font-bold" style={{ background: '#F3F4F6', color: '#111' }}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  )
}