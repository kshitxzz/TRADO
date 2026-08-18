import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Trash2, Loader2, CheckCircle2, AlertTriangle, Folder, Clock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useTrades } from '../../hooks/useTrades'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

const BROKERS = ['Exness', 'XM', 'Vantage', 'IC Markets', 'Pepperstone', 'OctaFX',
                 'FBS', 'FXTM', 'Tickmill', 'Deriv', 'HFM', 'Axiory', 'MetaTrader 5 (Other)', 'Other']

const FORMATS = [
  { value: 'html', label: 'HTML (MetaTrader Report History)' },
  { value: 'csv',  label: 'CSV (MetaTrader / Generic)' },
]

function FieldLabel({ icon: Icon, children }) {
  return (
    <label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5" style={{ color: 'var(--text-muted)' }}>
      <Icon size={12} /> {children}
    </label>
  )
}

/**
 * mode="onboarding" — creates a brand-new broker_account, then imports into it.
 * mode="existing"   — imports straight into an already-connected brokerAccountId.
 */
export default function ImportTradesPanel({ mode = 'existing', brokerAccountId, onImported, compact = false }) {
  const { user } = useAuth()
  const { parseImportFile, confirmImport, connectImportAccount } = useTrades(user?.id)

  const [broker, setBroker]     = useState('')
  const [format, setFormat]     = useState('html')
  const [timezones, setTimezones] = useState([])
  const [tz, setTz]             = useState(120) // default UTC+2 — most common MT5 broker time
  const [file, setFile]         = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing]   = useState(false)
  const [result, setResult]     = useState(null) // { trades, count, warnings, accountInfo }
  const [importing, setImporting] = useState(false)
  const [done, setDone]         = useState(null) // { imported, skipped }
  const inputRef = useRef(null)

  useEffect(() => {
    fetch(`${BACKEND}/api/broker/import/timezones`)
      .then(r => r.json()).then(list => { if (Array.isArray(list) && list.length) setTimezones(list) })
      .catch(() => setTimezones([
        { value: 0, label: 'UTC' }, { value: 120, label: 'UTC+2' }, { value: 180, label: 'UTC+3' },
      ]))
  }, [])

  async function handleFile(f) {
    if (!f) return
    setFile(f); setResult(null); setDone(null)
    setParsing(true)
    const { data, error } = await parseImportFile(f, format, tz)
    setParsing(false)
    if (!error) setResult(data)
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  async function handleImport() {
    if (!result?.trades?.length) return
    setImporting(true)
    let accountId = brokerAccountId

    if (mode === 'onboarding') {
      const { data, error } = await connectImportAccount({
        accountNumber: result.accountInfo?.accountNumber,
        broker:        broker || result.accountInfo?.broker,
        currency:      result.accountInfo?.currency,
        accountName:   result.accountInfo?.accountName,
      })
      if (error || !data) { setImporting(false); return }
      accountId = data.id
    }

    const { data } = await confirmImport(accountId, result.trades)
    setImporting(false)
    if (data) {
      setDone(data)
      onImported && onImported(data)
    }
  }

  function reset() {
    setFile(null); setResult(null); setDone(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={compact ? '' : 'glass-card p-6'}>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <FieldLabel icon={Folder}>Broker</FieldLabel>
          <select className="input-dark" value={broker} onChange={e => setBroker(e.target.value)}>
            <option value="">Select broker</option>
            {BROKERS.map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel icon={FileText}>File Format</FieldLabel>
          <select className="input-dark" value={format} onChange={e => setFormat(e.target.value)}>
            {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <FieldLabel icon={Clock}>Timezone (of the times in your report)</FieldLabel>
        <select className="input-dark" value={tz} onChange={e => setTz(Number(e.target.value))}>
          {timezones.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          MT5 shows times in your broker's server time, not your local time — check MT5: Tools → Options → Server tab if unsure.
        </p>
      </div>

      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-10 cursor-pointer transition-colors"
          style={{ borderColor: dragOver ? 'var(--accent-purple)' : 'var(--border-subtle)',
                   background: dragOver ? 'rgba(139,92,246,0.06)' : 'transparent' }}
        >
          <input ref={inputRef} type="file" accept=".html,.htm,.csv" className="hidden"
                 onChange={e => handleFile(e.target.files?.[0])} />
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
               style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Upload size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Drop your MT5 report here</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>or click to browse — .html or .csv</p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-6 text-center"
             style={{ borderColor: result?.count ? 'rgba(34,197,94,0.4)' : 'rgba(244,63,94,0.4)',
                      background: result?.count ? 'rgba(34,197,94,0.04)' : 'rgba(244,63,94,0.04)' }}>
          <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3"
               style={{ background: result?.count ? 'rgba(34,197,94,0.12)' : 'rgba(244,63,94,0.12)' }}>
            <FileText size={20} style={{ color: result?.count ? 'var(--positive-green)' : 'var(--negative-red)' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{file.name}</p>

          {parsing && (
            <p className="text-xs mt-2 flex items-center justify-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={12} className="animate-spin" /> Parsing file…
            </p>
          )}
          {!parsing && result && (
            <p className="text-xs mt-2 font-semibold" style={{ color: result.count ? 'var(--positive-green)' : 'var(--negative-red)' }}>
              {result.count ? `${result.count} trades found` : 'No trades found — check format & broker'}
            </p>
          )}

          <button onClick={reset} className="text-xs mt-3 flex items-center gap-1.5 mx-auto" style={{ color: 'var(--negative-red)' }}>
            <Trash2 size={12} /> Remove
          </button>
        </div>
      )}

      <AnimatePresence>
        {result?.warnings?.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-3 rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <div className="space-y-1">{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {result?.preview?.length > 0 && !done && (
        <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          {result.preview.map((t, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 text-xs"
                 style={{ borderBottom: i < result.preview.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</span>
              <span style={{ color: t.side === 'BUY' ? 'var(--positive-green)' : 'var(--negative-red)' }}>{t.side}</span>
              <span className="font-mono" style={{ color: t.pnl >= 0 ? 'var(--positive-green)' : 'var(--negative-red)' }}>
                {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}
              </span>
            </div>
          ))}
          {result.count > result.preview.length && (
            <p className="text-center text-[11px] py-1.5" style={{ color: 'var(--text-muted)' }}>
              +{result.count - result.preview.length} more
            </p>
          )}
        </div>
      )}

      {done ? (
        <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
             style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <CheckCircle2 size={16} style={{ color: 'var(--positive-green)' }} />
          <span style={{ color: 'var(--positive-green)' }}>
            {done.imported} trades imported{done.skipped ? `, ${done.skipped} duplicates skipped` : ''}
          </span>
        </div>
      ) : (
        <button onClick={handleImport} disabled={!result?.count || importing}
                className="btn-primary w-full justify-center py-2.5 text-sm mt-4 disabled:opacity-50">
          {importing ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : <><Upload size={14} /> Import Trades</>}
        </button>
      )}
    </div>
  )
}