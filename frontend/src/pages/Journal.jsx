import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Search, RotateCcw, FileText, BarChart3, ClipboardList, CheckCircle2,
  Swords, Smile, BookMarked, Tag, Star, Image as ImageIcon,
  Plus, X, BookOpen,
} from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'
import PairIcon from '../components/ui/PairIcon'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import { formatPnl } from '../lib/utils'
import { DEFAULT_EXECUTION_CHECKLIST } from '../data/executionChecklist'

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_CHECKLIST = DEFAULT_EXECUTION_CHECKLIST

function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' + new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function fmtShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildFormFromTrade(trade) {
  if (!trade) return null
  return {
    pre_trade_analysis: trade.pre_trade_analysis || '',
    post_trade_review:  trade.post_trade_review  || '',
    emotions:            trade.emotions           || '',
    lessons_learned:     trade.lessons_learned    || '',
    journal_tags:        (trade.journal_tags || []).join(', '),
    rating:               trade.rating ?? 5,
    rr_risk:               trade.rr_risk   ?? 1,
    rr_reward:              trade.rr_reward  ?? 2,
    execution_checklist: trade.execution_checklist?.length ? trade.execution_checklist : DEFAULT_CHECKLIST,
    screenshots:          trade.screenshots || [],
  }
}

// ── Small section header used throughout the form ────────────────────────────
function SectionLabel({ icon: Icon, children, right, iconColor }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
        <Icon size={13} style={{ color: iconColor || 'var(--accent-purple-light)' }} />
        {children}
      </div>
      {right}
    </div>
  )
}

export default function Journal() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { trades, account, syncing, syncTrades, isManualAccount, updateTrade, loading } = useTrades(user?.id)

  const closedTrades = useMemo(() =>
    trades
      .filter(t => t.status === 'closed')
      .sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)),
  [trades])

  const [tab, setTab]           = useState('all')      // all | journaled | pending
  const [search, setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState(location.state?.tradeId || null)
  const [form, setForm]         = useState(null)
  const [saving, setSaving]     = useState(false)
  const [customItem, setCustomItem] = useState('')

  // "New Journal Entry" from the Quick Actions menu / command palette lands
  // here with tab: 'pending' — switch to that tab and clear the state so a
  // refresh doesn't force it again.
  useEffect(() => {
    if (location.state?.tab) {
      setTab(location.state.tab)
      navigate(location.pathname, { replace: true, state: location.state.tradeId ? { tradeId: location.state.tradeId } : {} })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  const journaledCount = closedTrades.filter(t => t.journaled_at).length
  const pendingCount   = closedTrades.length - journaledCount

  const filtered = useMemo(() => {
    let list = closedTrades
    if (tab === 'journaled') list = list.filter(t => t.journaled_at)
    if (tab === 'pending')   list = list.filter(t => !t.journaled_at)
    if (search.trim()) list = list.filter(t => t.symbol.toLowerCase().includes(search.trim().toLowerCase()))
    return list
  }, [closedTrades, tab, search])

  const selectedTrade = closedTrades.find(t => t.id === selectedId) || null

  // Auto-select the first entry once trades load — prefers the first
  // not-yet-journaled trade when we arrived via "New Journal Entry".
  useEffect(() => {
    if (selectedId || closedTrades.length === 0) return
    if (tab === 'pending') {
      const firstPending = closedTrades.find(t => !t.journaled_at)
      setSelectedId(firstPending ? firstPending.id : closedTrades[0].id)
    } else {
      setSelectedId(closedTrades[0].id)
    }
  }, [closedTrades, selectedId, tab])

  // Rebuild the draft form whenever the selected trade changes
  useEffect(() => {
    setForm(buildFormFromTrade(selectedTrade))
  }, [selectedTrade?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function toggleChecklistItem(id) {
    setForm(f => ({
      ...f,
      execution_checklist: f.execution_checklist.map(c => c.id === id ? { ...c, checked: !c.checked } : c),
    }))
  }

  function addCustomChecklistItem() {
    const label = customItem.trim()
    if (!label) return
    setForm(f => ({
      ...f,
      execution_checklist: [...f.execution_checklist, { id: `custom_${Date.now()}`, label, checked: false }],
    }))
    setCustomItem('')
  }

  async function handleSave() {
    if (!selectedTrade || !form) return
    setSaving(true)
    const tags = form.journal_tags.split(',').map(t => t.trim()).filter(Boolean)
    await updateTrade(selectedTrade.id, {
      pre_trade_analysis:  form.pre_trade_analysis || null,
      post_trade_review:   form.post_trade_review  || null,
      emotions:             form.emotions           || null,
      lessons_learned:      form.lessons_learned    || null,
      journal_tags:         tags,
      rating:               form.rating,
      rr_risk:               form.rr_risk,
      rr_reward:              form.rr_reward,
      execution_checklist: form.execution_checklist,
      screenshots:          form.screenshots,
      journaled_at:         selectedTrade.journaled_at || new Date().toISOString(),
    }, { successMessage: `Journal saved — ${selectedTrade.symbol} updated` })
    setSaving(false)
  }

  function handleReset() {
    setForm(buildFormFromTrade(selectedTrade))
  }

  function handleReport() {
    if (!selectedTrade?.journaled_at) {
      toast.error('Journal and save the trade to generate a report.')
      return
    }
    window.print()
  }

  function handleAnalytics() {
    if (!selectedTrade) return
    navigate('/trade-dna', { state: { tradeId: selectedTrade.id } })
  }

  function handleScreenshotAdd(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setForm(f => ({ ...f, screenshots: [...f.screenshots, reader.result] }))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const isWin = (selectedTrade?.pnl || 0) >= 0
  const checkedCount = form?.execution_checklist?.filter(c => c.checked).length || 0

  return (
    <PageWrapper onSync={account && !isManualAccount ? syncTrades : undefined} syncing={syncing}>
      <style>{`
        .journal-report-print { display: none; }
        @media print {
          body * { visibility: hidden; }
          .journal-report-print { display: block !important; position: absolute; top: 0; left: 0; width: 100%; }
          .journal-report-print, .journal-report-print * { visibility: visible; }
        }
        .rating-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, #ef4444, #f59e0b, #6b7280, #3b82f6);
          outline: none;
          cursor: pointer;
        }
        .rating-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          border: none;
        }
        .rating-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          border: none;
        }
        .rating-slider::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, #ef4444, #f59e0b, #6b7280, #3b82f6);
        }
      `}</style>

      <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-112px)]">

        {/* ── LEFT: entry list ─────────────────────────────────────────────── */}
        <div className="w-full lg:w-[340px] lg:flex-shrink-0 glass-card p-4 flex flex-col max-h-[360px] lg:max-h-none overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Trade Journal</h1>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--accent-purple-light)' }}>
              {closedTrades.length} {closedTrades.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[
              ['all', 'All', closedTrades.length],
              ['journaled', 'Journaled', journaledCount],
              ['pending', 'Pending', pendingCount],
            ].map(([key, label, count]) => (
              <button key={key} onClick={() => setTab(key)}
                      className="text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                      style={tab === key
                        ? { background: 'var(--accent-purple)', color: '#fff' }
                        : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                {label}
                <span className="text-[10px] px-1.5 rounded-full"
                      style={{ background: tab === key ? 'rgba(255,255,255,0.2)' : 'var(--border-subtle)' }}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)', zIndex: 1 }} />
            <input className="input-dark text-sm py-2" style={{ paddingLeft: '2.25rem' }} placeholder="Search symbol…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 -mr-1 pr-1">
            {loading ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10">
                <BookOpen size={26} className="mx-auto mb-2" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No entries found</p>
              </div>
            ) : filtered.map(t => {
              const win = (t.pnl || 0) >= 0
              const active = t.id === selectedTrade?.id
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                        className="w-full text-left p-3 rounded-xl transition-colors"
                        style={{
                          background: active ? 'rgba(139,92,246,0.08)' : 'var(--bg-hover)',
                          border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : 'var(--border-subtle)'}`,
                        }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <PairIcon symbol={t.symbol} size={24} />
                      <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={t.journaled_at
                            ? { background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' }
                            : { background: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                      {t.journaled_at ? 'JOURNALED' : 'PENDING'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="font-semibold" style={{ color: t.side === 'long' ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                      {(t.side || '').toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>${t.entry_price}</span>
                    <span className="font-bold ml-auto" style={{ color: win ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                      {formatPnl(t.pnl)}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(t.closed_at)}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT: detail / journal form ─────────────────────────────────── */}
        <div className="flex-1 glass-card p-0 flex flex-col overflow-hidden">
          {!selectedTrade || !form ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <BookOpen size={32} className="mb-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {closedTrades.length === 0 ? 'No closed trades to journal yet' : 'Select a trade to journal'}
              </p>
            </div>
          ) : (
            <>
              {/* Sticky header */}
              <div className="flex-shrink-0 p-4 sm:p-5 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <PairIcon symbol={selectedTrade.symbol} size={28} />
                      <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedTrade.symbol}</h2>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={isWin
                              ? { background: 'rgba(34,197,94,0.12)', color: 'var(--positive-green)' }
                              : { background: 'rgba(239,68,68,0.12)', color: 'var(--negative-red)' }}>
                        {isWin ? 'WINNER' : 'LOSER'}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-semibold" style={{ color: selectedTrade.side === 'long' ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                        {(selectedTrade.side || '').toUpperCase()}
                      </span>
                      {' · '}Entry ${selectedTrade.entry_price} · Size {selectedTrade.size ?? selectedTrade.quantity ?? '—'} · {fmtDateTime(selectedTrade.closed_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                    <button onClick={handleReset} title="Reset changes"
                            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                      <RotateCcw size={14} />
                    </button>
                    <button onClick={handleReport} className="btn-outline text-xs px-3 py-2">
                      <FileText size={13} /> Report
                    </button>
                    <button onClick={handleAnalytics} className="btn-outline text-xs px-3 py-2">
                      <BarChart3 size={13} /> Analytics
                    </button>
                    <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-4 py-2 disabled:opacity-60">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable form body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">

                <div>
                  <SectionLabel icon={ClipboardList}>Pre-Trade Analysis</SectionLabel>
                  <textarea rows={3} className="input-dark resize-none text-sm"
                            placeholder="What did you see? Plan, thesis, levels, risk…"
                            value={form.pre_trade_analysis}
                            onChange={e => updateField('pre_trade_analysis', e.target.value)} />
                </div>

                <div>
                  <SectionLabel icon={CheckCircle2}>Post-Trade Review</SectionLabel>
                  <textarea rows={3} className="input-dark resize-none text-sm"
                            placeholder="What happened? Execution, slippage, improvements…"
                            value={form.post_trade_review}
                            onChange={e => updateField('post_trade_review', e.target.value)} />
                </div>

                <div className="rounded-xl p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <div className="flex items-center gap-2">
                    <Swords size={13} style={{ color: 'var(--accent-purple-light)' }} />
                    <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>Risk : Reward</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <input type="number" min="0" step="0.5" value={form.rr_risk}
                             onChange={e => updateField('rr_risk', parseFloat(e.target.value) || 0)}
                             className="input-dark w-16 text-center text-sm py-1.5" />
                      <span className="font-bold" style={{ color: 'var(--accent-purple-light)' }}>:</span>
                      <input type="number" min="0" step="0.5" value={form.rr_reward}
                             onChange={e => updateField('rr_reward', parseFloat(e.target.value) || 0)}
                             className="input-dark w-16 text-center text-sm py-1.5" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <SectionLabel icon={Smile}>Emotions</SectionLabel>
                    <textarea rows={3} className="input-dark resize-none text-sm"
                              placeholder="Calm, anxious, FOMO, confident…"
                              value={form.emotions}
                              onChange={e => updateField('emotions', e.target.value)} />
                  </div>
                  <div>
                    <SectionLabel icon={BookMarked}>Lessons Learned</SectionLabel>
                    <textarea rows={3} className="input-dark resize-none text-sm"
                              placeholder="Key takeaways to repeat or avoid…"
                              value={form.lessons_learned}
                              onChange={e => updateField('lessons_learned', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <SectionLabel icon={Tag}>Tags</SectionLabel>
                    <input className="input-dark text-sm" placeholder="breakout, trend, news (comma separated)"
                           value={form.journal_tags}
                           onChange={e => updateField('journal_tags', e.target.value)} />
                  </div>
                  <div>
                    <SectionLabel icon={Star} iconColor="#3b82f6" right={
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6' }}>
                        {form.rating}/10
                      </span>
                    }>
                      Rating
                    </SectionLabel>
                    <div className="rounded-xl px-3 pt-3 pb-2" style={{ border: '1px solid var(--border-subtle)' }}>
                      <input type="range" min={1} max={10} value={form.rating}
                             onChange={e => updateField('rating', parseInt(e.target.value))}
                             className="rating-slider" />
                      <div className="flex justify-between text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                        <span>1</span><span>5</span><span>10</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel icon={CheckCircle2} iconColor="#3b82f6" right={
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {checkedCount}/{form.execution_checklist.length}
                    </span>
                  }>
                    Execution Checklist
                  </SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {form.execution_checklist.map(item => (
                      <button key={item.id} onClick={() => toggleChecklistItem(item.id)}
                              className="flex items-center gap-2.5 p-3 rounded-lg text-left transition-colors"
                              style={item.checked
                                ? { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.5)' }
                                : { background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
                        <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                              style={item.checked
                                ? { background: '#3b82f6' }
                                : { border: '1.5px solid var(--text-muted)' }}>
                          {item.checked && <CheckCircle2 size={11} color="#fff" />}
                        </span>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                      </button>
                    ))}
                    <div className="flex items-center gap-2 p-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
                      <input value={customItem} onChange={e => setCustomItem(e.target.value)}
                             onKeyDown={e => e.key === 'Enter' && addCustomChecklistItem()}
                             placeholder="Add custom item…"
                             className="flex-1 bg-transparent text-xs px-2 py-2 outline-none" style={{ color: 'var(--text-primary)' }} />
                      <button onClick={addCustomChecklistItem}
                              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mr-1"
                              style={{ background: '#3b82f6' }}>
                        <Plus size={13} color="#fff" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionLabel icon={ImageIcon}>Screenshots</SectionLabel>
                  <div className="flex flex-wrap gap-3">
                    {form.screenshots.map((src, i) => (
                      <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border-subtle)' }}>
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setForm(f => ({ ...f, screenshots: f.screenshots.filter((_, si) => si !== i) }))}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.6)' }}>
                          <X size={11} color="#fff" />
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 rounded-lg flex flex-col items-center justify-center gap-1.5 cursor-pointer flex-shrink-0 transition-colors"
                           style={{ border: '1.5px dashed var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <Plus size={16} />
                      <span className="text-[10px] font-medium">Add Image</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleScreenshotAdd} />
                    </label>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Hidden printable report — shown only via window.print() ─────────── */}
      {selectedTrade && form && (
        <div className="journal-report-print">
          <div style={{ padding: 48, fontFamily: 'Poppins, sans-serif', color: '#111', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <img src="/trado-logo.png" alt="Trado" style={{ width: 36, height: 36 }} />
              <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>Trado</span>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', marginBottom: 20 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{selectedTrade.symbol}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: selectedTrade.side === 'long' ? '#dcfce7' : '#fee2e2', color: selectedTrade.side === 'long' ? '#15803d' : '#b91c1c' }}>
                {(selectedTrade.side || '').toUpperCase()}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: isWin ? '#dcfce7' : '#fee2e2', color: isWin ? '#15803d' : '#b91c1c' }}>
                {isWin ? 'WINNER' : 'LOSER'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 24 }}>
              Entry {fmtDateTime(selectedTrade.opened_at)} · Exit {fmtDateTime(selectedTrade.closed_at)}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
              {[
                ['Entry Price', `$${selectedTrade.entry_price}`],
                ['Exit Price',  `$${selectedTrade.exit_price}`],
                ['Position Size', selectedTrade.size ?? selectedTrade.quantity ?? '—'],
                ['Net P&L', formatPnl(selectedTrade.pnl)],
              ].map(([label, val]) => (
                <div key={label} style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: 12 }}>
                  <p style={{ fontSize: 9, textTransform: 'uppercase', color: '#999', fontWeight: 700, marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 15, fontWeight: 800 }}>{val}</p>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Journal Breakdown</p>
            {[
              ['Pre-Trade Analysis', form.pre_trade_analysis],
              ['Post-Trade Review',  form.post_trade_review],
              ['Emotions',            form.emotions],
              ['Lessons Learned',     form.lessons_learned],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 2 }}>{label}</p>
                <p style={{ fontSize: 12, lineHeight: 1.6 }}>{val}</p>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, marginBottom: 8 }}>Execution Checklist</p>
                {form.execution_checklist.map(item => (
                  <p key={item.id} style={{ fontSize: 11, marginBottom: 4, color: item.checked ? '#15803d' : '#999' }}>
                    {item.checked ? '✓' : '✗'} {item.label}
                  </p>
                ))}
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 800, marginBottom: 8 }}>Performance Score</p>
                <p style={{ fontSize: 14, letterSpacing: 2, color: '#f59e0b', marginBottom: 4 }}>
                  {'★'.repeat(form.rating)}{'☆'.repeat(10 - form.rating)}
                </p>
                <p style={{ fontSize: 10, color: '#999', marginBottom: 10 }}>{form.rating}/10</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Risk / Reward</p>
                <p style={{ fontSize: 16, fontWeight: 800 }}>1 : {form.rr_reward}</p>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '28px 0 10px' }} />
            <p style={{ fontSize: 9, color: '#999', textAlign: 'center' }}>
              Generated {new Date().toLocaleString('en-US')} from {closedTrades.length} trades
            </p>
            <p style={{ fontSize: 9, color: '#999', textAlign: 'center' }}>
              {user?.user_metadata?.full_name || user?.email || 'Trader'} · {selectedTrade.symbol} Journal Report · {fmtShort(selectedTrade.closed_at)}
            </p>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}