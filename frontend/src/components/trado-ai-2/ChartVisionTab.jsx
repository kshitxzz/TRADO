import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Eye, Upload, X, Loader2, Sparkles, ShieldCheck, ShieldX, ShieldQuestion,
  TrendingUp, AlertTriangle, History, ChevronDown, ChevronUp, ImageIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { computeSymbolBreakdown } from '../../lib/analytics'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const MAX_BYTES = 8 * 1024 * 1024
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W']
const DEFAULT_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD']

const VERDICT_STYLE = {
  'STRONG BUY':  { color: 'var(--positive-green)', Icon: ShieldCheck },
  'BUY':         { color: 'var(--positive-green)', Icon: ShieldCheck },
  'SKIP':        { color: 'var(--negative-red)',   Icon: ShieldX },
  'STRONG SKIP': { color: 'var(--negative-red)',   Icon: ShieldX },
}

function ResultPanel({ result, symbol }) {
  if (!result) return null
  if (result.aiUnavailable) {
    return (
      <div className="rounded-xl p-5 text-sm" style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)', color: 'var(--text-secondary)' }}>
        {result.aiMessage || 'Chart Vision is unavailable right now.'}
      </div>
    )
  }
  const vStyle = VERDICT_STYLE[result.verdict] || { color: 'var(--warning-orange)', Icon: ShieldQuestion }
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background: `${vStyle.color}0F`, border: `1px solid ${vStyle.color}40` }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <vStyle.Icon size={16} style={{ color: vStyle.color }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Verdict</p>
              <p className="text-xl font-black" style={{ color: vStyle.color }}>{result.verdict}</p>
            </div>
          </div>
          {result.verdictNote && <p className="text-xs max-w-md text-right" style={{ color: 'var(--text-secondary)' }}>{result.verdictNote}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t" style={{ borderColor: `${vStyle.color}25` }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Bias</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{result.bias}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Setup Type</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{result.setupType}</p>
          </div>
        </div>
      </div>

      {result.riskPlan && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--accent-purple)' }}>
            <Sparkles size={11} /> Risk Plan
          </p>
          <div className="space-y-2">
            {['entry', 'stop', 'target', 'rr'].map(k => result.riskPlan[k] && (
              <div key={k} className="flex gap-3 text-xs">
                <span className="font-bold uppercase w-14 flex-shrink-0" style={{ color: 'var(--accent-purple-light)' }}>{k === 'rr' ? 'R:R' : k}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{result.riskPlan[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.edgeOnSymbol && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--positive-green)' }}>
            <TrendingUp size={11} /> Your Edge on This Symbol
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.edgeOnSymbol}</p>
        </div>
      )}

      {result.whyCouldFail && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--negative-red)' }}>
            <AlertTriangle size={11} /> Why This Could Fail
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{result.whyCouldFail}</p>
        </div>
      )}

      {result.keyInsights?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Key Insights</p>
          <div className="flex flex-wrap gap-2">
            {result.keyInsights.map((k, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1.5 rounded-lg leading-snug" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning-orange)' }}>
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ChartVisionTab({ user, trades }) {
  const [image, setImage] = useState(null) // data URL
  const [dragOver, setDragOver] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [timeframe, setTimeframe] = useState('1H')
  const [question, setQuestion] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [past, setPast] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const fileInputRef = useRef(null)

  const symbolStats = computeSymbolBreakdown(trades)
  const chipSymbols = symbolStats.length ? symbolStats.slice(0, 6).map(s => s.symbol) : DEFAULT_SYMBOLS

  const loadPast = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('ai_chart_analyses').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(20)
    setPast(data || [])
  }, [user?.id])

  useEffect(() => { loadPast() }, [loadPast])

  function handleFile(file) {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { alert('Please upload a PNG, JPG, or WEBP image.'); return }
    if (file.size > MAX_BYTES) { alert('Image must be under 8MB.'); return }
    const reader = new FileReader()
    reader.onload = () => { setImage(reader.result); setResult(null) }
    reader.readAsDataURL(file)
  }

  async function analyze() {
    if (!image || analyzing) return
    setAnalyzing(true)
    setResult(null)
    const symbolEdge = symbolStats.find(s => s.symbol?.toUpperCase() === symbol.trim().toUpperCase()) || null

    try {
      const res = await fetch(`${BACKEND}/api/ai/chart-vision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, symbol: symbol.trim(), timeframe, question: question.trim(), symbolEdge }),
      })
      const data = await res.json()
      const parsedResult = data.aiAvailable
        ? { verdict: data.verdict, verdictNote: data.verdictNote, bias: data.bias, setupType: data.setupType, riskPlan: data.riskPlan, edgeOnSymbol: data.edgeOnSymbol, whyCouldFail: data.whyCouldFail, keyInsights: data.keyInsights }
        : { aiUnavailable: true, aiMessage: data.message }
      setResult(parsedResult)

      if (user?.id && data.aiAvailable) {
        await supabase.from('ai_chart_analyses').insert({
          user_id: user.id, symbol: symbol.trim() || null, timeframe, question: question.trim() || null,
          image_data: image, result: parsedResult,
        })
        loadPast()
      }
    } catch (err) {
      setResult({ aiUnavailable: true, aiMessage: 'Could not reach the AI service — check your connection.' })
    }
    setAnalyzing(false)
  }

  return (
    <div className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.14)' }}>
            <Eye size={16} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Chart Vision</h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Upload a chart — get a verdict tied to your trading edge on that symbol.</p>
          </div>
        </div>

        <div className="rounded-lg px-4 py-3 mb-4 text-xs leading-relaxed" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning-orange)' }}>
          <strong>For educational purposes only.</strong> AI can be wrong — verdicts and price levels are a second opinion, not a signal. Always validate against your own analysis and your risk plan before taking a trade.
        </div>

        {!image ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
            className="rounded-xl flex flex-col items-center justify-center gap-2 py-14 cursor-pointer transition-colors"
            style={{ border: `1.5px dashed ${dragOver ? 'var(--accent-purple)' : 'var(--border-subtle)'}`, background: dragOver ? 'rgba(139,92,246,0.05)' : 'transparent' }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
              <Upload size={18} style={{ color: 'var(--accent-purple)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Drop a chart screenshot here</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>or click to browse — PNG/JPG up to 8MB</p>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                   onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden mb-1" style={{ border: '1px solid var(--border-subtle)' }}>
            <img src={image} alt="Chart to analyze" className="w-full max-h-[420px] object-contain bg-black" />
            <button onClick={() => { setImage(null); setResult(null) }}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <X size={14} className="text-white" />
            </button>
          </div>
        )}
        {image && (
          <p className="text-xs flex items-center gap-1.5 mt-2 mb-1" style={{ color: 'var(--positive-green)' }}>
            <ImageIcon size={12} /> Chart ready to analyze
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Symbol (optional but improves accuracy)</label>
            <input className="input-dark w-full mb-2" placeholder="e.g. XAUUSD, EURUSD" value={symbol} onChange={e => setSymbol(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {chipSymbols.map(s => (
                <button key={s} onClick={() => setSymbol(s)}
                        className="text-[10px] px-2 py-1 rounded-md font-medium transition-opacity hover:opacity-80"
                        style={{ background: symbol.toUpperCase() === s.toUpperCase() ? 'var(--accent-purple)' : 'var(--bg-hover, rgba(255,255,255,0.04))', color: symbol.toUpperCase() === s.toUpperCase() ? 'white' : 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Timeframe</label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)}
                        className="text-xs py-1.5 rounded-md font-medium transition-opacity hover:opacity-80"
                        style={{ background: timeframe === tf ? 'var(--accent-purple)' : 'var(--bg-hover, rgba(255,255,255,0.04))', color: timeframe === tf ? 'white' : 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Question (optional)</label>
          <textarea className="input-dark w-full resize-none" rows={2} placeholder="e.g. Is this a clean entry? Where would the stop go?"
                    value={question} onChange={e => setQuestion(e.target.value)} />
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={analyze} disabled={!image || analyzing}
                  className="btn-primary text-xs px-5 py-2.5 flex items-center gap-1.5 disabled:opacity-40">
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {analyzing ? 'Analyzing…' : 'Analyze chart'}
          </button>
        </div>
      </div>

      {result && (
        <div className="glass-card p-5">
          <ResultPanel result={result} symbol={symbol} />
        </div>
      )}

      {/* Past analyses */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <History size={15} style={{ color: 'var(--text-muted)' }} />
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Past analyses</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Saved on this device · last 20 kept</p>
          </div>
        </div>
        {past.length === 0 ? (
          <p className="text-xs p-5" style={{ color: 'var(--text-muted)' }}>No analyses yet.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {past.map(p => {
              const isOpen = expandedId === p.id
              return (
                <div key={p.id}>
                  <button onClick={() => setExpandedId(isOpen ? null : p.id)}
                          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:opacity-90">
                    {p.image_data && <img src={p.image_data} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" style={{ border: '1px solid var(--border-subtle)' }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.symbol || 'Unlabeled'} · {p.timeframe}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleString()}</p>
                    </div>
                    {isOpen ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5">
                      <ResultPanel result={p.result} symbol={p.symbol} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}