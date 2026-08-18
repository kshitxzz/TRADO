import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, Plug, RefreshCw, Link2Off,
         Wallet, Clock, PenLine, ArrowLeft, Trophy, TrendingUp, ChevronDown,
         Plus, Minus, ArrowDownToLine, ArrowUpFromLine, Copy, Download,
         FileUp, Zap, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import PageWrapper from '../components/layout/PageWrapper'
import { useAuth } from '../hooks/useAuth'
import { useTrades } from '../hooks/useTrades'
import ImportTradesPanel from '../components/ui/ImportTradesPanel'
import toast from 'react-hot-toast'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

// Standalone (not routed through useTrades) so polling this from N account
// cards doesn't spin up N redundant trades-fetches + realtime channels —
// it's just a status ping and doesn't need anything else that hook does.
async function fetchEAStatus(brokerAccountId) {
  try {
    const res = await fetch(`${BACKEND}/api/broker/ea/status/${brokerAccountId}`)
    if (!res.ok) return null
    return await res.json()
  } catch (_) {
    return null
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COMMON_SERVERS = [
  'Exness-Real 5','Exness-Real 4','Exness-Real 3','Exness-Real 2','Exness-Real','Exness-Demo',
  'ICMarketsSC-Live01','ICMarketsSC-Live02','ICMarketsSC-Demo',
  'XMGlobal-Real 3','XMGlobal-Real 8','XMGlobal-Demo',
  'Vantage-Live 1','Vantage-Live 2','Vantage-Demo',
  'Pepperstone-Edge01','Pepperstone-Edge02','Pepperstone-Demo',
  'OctaFX-Real2','OctaFX-Real3','OctaFX-Demo',
  'FBS-Real','FBS-Real4','FBS-Demo',
  'FXTM-Real 14','FXTM-Real 20','FXTM-Demo',
  'Tickmill-Live','Tickmill-Demo',
  'Deriv-Server','Deriv-Demo',
  'HFMarketsGlobal-Real 4','HFMarketsGlobal-Demo',
  'Axiory-Live','Axiory-Demo',
  'RoboForex-Real','RoboForex-Demo',
  'InstaForex-Real','InstaForex-Demo',
  'AvaTrade-Real','AvaTrade-Demo',
  'FPMarketsLLC-Live','FPMarketsLLC-Demo',
  'Eightcap-Real','Eightcap-Demo',
  'BlackBullMarkets-Live','BlackBullMarkets-Demo',
  'AdmiralsGroup-Live','AdmiralsGroup-Demo',
  'GOMarkets-Live','GOMarkets-Demo',
  'ThinkMarkets-Live','ThinkMarkets-Demo',
  'Alpari-Standard-Live','Alpari-Demo',
  'JustMarkets-Live','JustMarkets-Demo',
  'Weltrade-Real','Weltrade-Demo',
]

const PROP_FIRMS = [
  'FTMO','MyForexFunds','The5ers','FundedNext','E8 Markets',
  'True Forex Funds','SurgeTrader','Fidelcrest','Funded Engineer',
  'City Traders Imperium','Instant Funding','Alpha Capital Group','Other',
]

const ACCOUNT_SIZES = [5000, 10000, 25000, 50000, 100000, 200000]

const BROKERS = [
  'Exness','XM','Vantage','IC Markets','Pepperstone','OctaFX',
  'FBS','FXTM','Tickmill','Deriv','HFM','Axiory','Other',
]

const LEVERAGES = ['1:10','1:20','1:30','1:50','1:100','1:200','1:500','1:1000','1:2000','Unlimited']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function PhaseLabel({ phase }) {
  const map = {
    phase_1: { label: 'Phase 1', color: '#F59E0B' },
    phase_2: { label: 'Phase 2', color: '#3B82F6' },
    funded:  { label: 'Funded',  color: '#22C55E' },
  }
  const cfg = map[phase] || map.phase_1
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  )
}

function InfoTile({ label, value }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

// ─── MT5 Connect Form (EA real-time sync — no password required) ──────────────
// MT5 accounts don't let a server verify a login remotely without a paid
// service like MetaAPI, so this connects a different way: a small Expert
// Advisor runs inside your already-logged-in MT5 terminal and pushes your
// trades out over HTTPS using a one-time Sync Key. Nothing ever leaves your
// terminal except trade data.
// Reusable — shown right after "Generate Sync Key", and again any time later
// from the connected-account card (so a crashed download or a page refresh
// never strands the user without a way back to their Sync Key + EA file).
function EASetupPanel({ token, brokerAccountId, embedded }) {
  const [copied, setCopied] = useState(false)
  const [eaStatus, setEaStatus] = useState(null)

  const eaUrl = `${BACKEND}/ea/TradoSync.mq5`
  // MT5's "Allow WebRequest for listed URL" field can silently reject a
  // bare "localhost" (some builds' validation expects something that looks
  // like a real host, i.e. contains a dot) — 127.0.0.1 means the exact same
  // thing but passes that check, so we show that form specifically for the
  // two places you paste into MT5.
  const mt5Base     = BACKEND.replace('//localhost', '//127.0.0.1')
  const webhookUrl  = `${mt5Base}/api/broker/ea/sync`

  function copyToken() {
    navigator.clipboard.writeText(token)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    if (!brokerAccountId) return
    let cancelled = false
    async function poll() { const s = await fetchEAStatus(brokerAccountId); if (!cancelled) setEaStatus(s) }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [brokerAccountId])

  return (
    <div className={embedded ? '' : 'glass-card p-7'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Set up real-time sync</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>3 steps, takes about 2 minutes</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm mb-5"
           style={{ background: eaStatus?.error ? 'rgba(239,68,68,0.08)' : eaStatus?.connected ? 'rgba(34,197,94,0.08)' : 'rgba(139,92,246,0.08)',
                    border: `1px solid ${eaStatus?.error ? 'rgba(239,68,68,0.25)' : eaStatus?.connected ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.2)'}` }}>
        {eaStatus?.error
          ? <span style={{ color: '#EF4444' }} className="font-semibold">⚠ {eaStatus.error}</span>
          : eaStatus?.connected
            ? <><CheckCircle2 size={15} style={{ color: 'var(--positive-green)' }} /><span style={{ color: 'var(--positive-green)' }} className="font-semibold">EA connected — trades are syncing</span></>
            : <><Loader2 size={15} className="animate-spin" style={{ color: 'var(--accent-purple)' }} /><span style={{ color: 'var(--text-secondary)' }}>Not connected yet — follow the steps below</span></>}
      </div>

      <div className="space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <div>
          <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>1. Your Sync Key</p>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg font-mono text-xs" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}>
            <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{token}</span>
            <button onClick={copyToken} style={{ color: 'var(--accent-purple-light)' }}>
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div>
          <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>2. Download the EA and attach it</p>
          <a href={eaUrl} download target="_blank" rel="noopener noreferrer"
             className="btn-outline w-full justify-center py-2.5 text-sm mb-2">
            <Download size={14} /> Download TradoSync.mq5
          </a>
          <ol className="text-xs space-y-1.5 pl-4 list-decimal" style={{ color: 'var(--text-muted)' }}>
            <li>In MT5: <strong style={{ color: 'var(--text-secondary)' }}>File → Open Data Folder</strong> → open <strong style={{ color: 'var(--text-secondary)' }}>MQL5 → Experts</strong>, and drop the downloaded file in there.</li>
            <li>In MT5, open <strong style={{ color: 'var(--text-secondary)' }}>MetaEditor</strong> (F4), find TradoSync.mq5 in Experts, and press <strong style={{ color: 'var(--text-secondary)' }}>F7</strong> to compile it.</li>
            <li>Back in MT5: <strong style={{ color: 'var(--text-secondary)' }}>Tools → Options → Expert Advisors</strong> tab → tick "Allow WebRequest for listed URL" → click into the "add new URL" row, paste this, then <strong style={{ color: 'var(--text-secondary)' }}>press Enter</strong> to commit it (typing alone isn't enough — it has to turn into its own saved row before you click OK):
              <code className="font-mono break-all block mt-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)' }}>{mt5Base}</code>
              {mt5Base.includes('127.0.0.1') && (
                <span className="block mt-1" style={{ color: 'var(--text-muted)' }}>
                  (using 127.0.0.1 instead of localhost — MT5's URL field sometimes rejects bare "localhost")
                </span>
              )}
            </li>
            <li>Drag TradoSync from the Navigator panel onto any chart. In the Inputs tab, paste your Sync Key above into <strong style={{ color: 'var(--text-secondary)' }}>InpApiKey</strong>, and set <strong style={{ color: 'var(--text-secondary)' }}>InpServerUrl</strong> to: <code className="font-mono break-all block mt-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)' }}>{webhookUrl}</code></li>
            <li>Make sure "Allow Algo Trading" is enabled (top toolbar, should be green) — trades start syncing within seconds.</li>
          </ol>
        </div>
      </div>

      <div className="mt-5 px-4 py-3 rounded-xl text-xs leading-relaxed"
           style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)', color: 'var(--text-muted)' }}>
        Prefer not to install anything right now? You can also{' '}
        <span style={{ color: 'var(--accent-purple-light)' }}>import a CSV/HTML report</span> from the Accounts page any time to backfill history.
      </div>
    </div>
  )
}

function MT5Form({ onBack, onConnected }) {
  const [form, setForm] = useState({ login: '', server: '' })
  const [setup, setSetup]   = useState(null) // { account, token }
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { setupEA } = useTrades(user?.id)

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleGenerate() {
    if (!form.login || !form.server) { toast.error('Enter your account number and server'); return }
    setLoading(true)
    // Broker company name is inferred from the server string (e.g.
    // "Exness-Real 5" → "Exness") purely for display — no separate field
    // needed, one less thing to fill in and one less way to get confused.
    const inferredBroker = form.server.split(/[-\s]/)[0] || 'MT5'
    const { data, error } = await setupEA({ accountNumber: form.login, server: form.server, broker: inferredBroker })
    setLoading(false)
    if (!error) { setSetup(data); onConnected() }
  }

  if (setup) {
    return <EASetupPanel token={setup.token} brokerAccountId={setup.account?.id} />
  }

  return (
    <div className="glass-card p-7">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
          <Plug size={18} className="text-white" />
        </div>
        <div>
          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Connect MT5 Account</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Real-time sync via a small EA — no password needed</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            MT5 Account Number <span style={{ color: 'var(--negative-red)' }}>*</span>
          </label>
          <input className="input-dark font-mono" placeholder="e.g. 60906124"
                 value={form.login} onChange={e => update('login', e.target.value)} />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>5–9 digit number shown in MT5 terminal</p>
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Broker Server <span style={{ color: 'var(--negative-red)' }}>*</span>
          </label>
          <input className="input-dark" list="mt5-server-suggestions" placeholder="e.g. Exness-Real5"
                 value={form.server} onChange={e => update('server', e.target.value)} />
          <datalist id="mt5-server-suggestions">
            {COMMON_SERVERS.map(s => <option key={s} value={s} />)}
          </datalist>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Find the exact name in MT5: File → Login to Trade Account → Server field. Start typing for suggestions, or enter it exactly as shown there.
          </p>
        </div>

        <button onClick={handleGenerate} disabled={loading || !form.login || !form.server}
                className="btn-teal w-full justify-center py-2.5 text-sm disabled:opacity-50">
          {loading ? <><Loader2 size={14} className="animate-spin" /> Setting up…</> : <><Zap size={14} /> Generate Sync Key</>}
        </button>
      </div>

      <div className="mt-5 px-4 py-3 rounded-xl text-xs leading-relaxed"
           style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)', color: 'var(--text-muted)' }}>
        <p><strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong> A small Expert Advisor runs inside your MT5 terminal (which is already logged into your account) and pushes your trades to Trado in real time. Your password is never entered here or sent anywhere.</p>
      </div>
    </div>
  )
}

// ─── Prop Firm Form ───────────────────────────────────────────────────────────
function PropFirmForm({ onBack, onSave, saving }) {
  const [form, setForm] = useState({
    label: '', firm: '', phase: 'phase_1', accountSize: 25000,
    customSize: '', dailyDrawdown: 5, maxDrawdown: 10, profitTarget: 10,
  })
  const [customSize, setCustomSize] = useState(false)
  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const sizeValue = customSize ? (parseFloat(form.customSize) || 0) : form.accountSize

  async function handleSave() {
    if (!form.firm) { toast.error('Select a prop firm'); return }
    await onSave({
      accountType: 'prop_firm',
      accountName: form.label || `${form.firm} — ${form.phase === 'phase_1' ? 'Phase 1' : form.phase === 'phase_2' ? 'Phase 2' : 'Funded'}`,
      settings: {
        firm: form.firm, phase: form.phase, account_size: sizeValue,
        daily_drawdown: parseFloat(form.dailyDrawdown),
        max_drawdown:   parseFloat(form.maxDrawdown),
        profit_target:  parseFloat(form.profitTarget),
        currency: 'USD',
      },
    })
  }

  return (
    <div className="glass-card p-7">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Trophy size={18} style={{ color: '#F59E0B' }} />
        </div>
        <div>
          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Prop Firm Account</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Track your challenge or funded account</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Account label */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>ACCOUNT LABEL</label>
          <input className="input-dark" placeholder="e.g. FTMO Challenge #1"
                 value={form.label} onChange={e => update('label', e.target.value)} />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Optional — we'll auto-name it from your firm + phase</p>
        </div>

        {/* Firm */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
            PROP FIRM <span style={{ color: 'var(--negative-red)' }}>*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PROP_FIRMS.map(f => (
              <button key={f} onClick={() => update('firm', f)}
                      className="py-2 px-3 rounded-xl text-xs font-medium transition-all text-center"
                      style={{
                        background: form.firm === f ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${form.firm === f ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                        color: form.firm === f ? 'var(--accent-purple-light)' : 'var(--text-muted)',
                      }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Phase */}
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>STAGE</label>
          <div className="grid grid-cols-3 gap-2">
            {[['phase_1', 'Phase 1', '#F59E0B'], ['phase_2', 'Phase 2', '#3B82F6'], ['funded', 'Funded', '#22C55E']].map(([v, l, c]) => (
              <button key={v} onClick={() => update('phase', v)}
                      className="py-2.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: form.phase === v ? `${c}18` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${form.phase === v ? c : 'var(--border-subtle)'}`,
                        color: form.phase === v ? c : 'var(--text-muted)',
                      }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Account size */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>ACCOUNT SIZE</label>
            <button onClick={() => setCustomSize(c => !c)} className="text-[11px]"
                    style={{ color: 'var(--accent-purple-light)' }}>
              {customSize ? '← Pick preset' : 'Custom size →'}
            </button>
          </div>
          {customSize
            ? <input className="input-dark font-mono" placeholder="e.g. 150000" type="number"
                     value={form.customSize} onChange={e => update('customSize', e.target.value)} />
            : <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_SIZES.map(s => (
                  <button key={s} onClick={() => update('accountSize', s)}
                          className="py-2 rounded-xl text-xs font-mono font-medium transition-all"
                          style={{
                            background: form.accountSize === s ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${form.accountSize === s ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                            color: form.accountSize === s ? 'var(--accent-purple-light)' : 'var(--text-muted)',
                          }}>
                    ${s.toLocaleString()}
                  </button>
                ))}
              </div>
          }
        </div>

        {/* Drawdown + Target */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Risk Parameters</p>
          <div className="grid grid-cols-3 gap-3">
            {[['DAILY DRAWDOWN %', 'dailyDrawdown', '#EF4444'], ['MAX DRAWDOWN %', 'maxDrawdown', '#F97316'], ['PROFIT TARGET %', 'profitTarget', '#22C55E']].map(([l, k, c]) => (
              <div key={k}>
                <label className="text-[10px] font-semibold block mb-1.5" style={{ color: c }}>{l}</label>
                <div className="relative">
                  <input className="input-dark font-mono pr-6 text-center" type="number" min="0" max="100" step="0.5"
                         value={form[k]} onChange={e => update(k, e.target.value)} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving || !form.firm}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-50">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Creating Account…</> : <><Trophy size={14} /> Create Prop Firm Account</>}
        </button>
      </div>
    </div>
  )
}

// ─── Live Account Form ────────────────────────────────────────────────────────
function LiveAccountForm({ onBack, onSave, saving }) {
  const [form, setForm] = useState({
    label: '', broker: '', initialDeposit: '', currency: 'USD', leverage: '1:100',
  })
  const [isCustomBroker, setIsCustomBroker] = useState(false)
  const [customBrokerName, setCustomBrokerName] = useState('')

  function update(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleBrokerClick(b) {
    if (b === 'Other') {
      setIsCustomBroker(true)
      update('broker', customBrokerName || '')
    } else {
      setIsCustomBroker(false)
      setCustomBrokerName('')
      update('broker', b)
    }
  }

  async function handleSave() {
    if (!form.broker) { toast.error('Select a broker'); return }
    await onSave({
      accountType: 'live',
      accountName: form.label || `${form.broker} Live`,
      settings: {
        broker: form.broker, initial_deposit: parseFloat(form.initialDeposit) || 0,
        currency: form.currency, leverage: form.leverage,
      },
    })
  }

  return (
    <div className="glass-card p-7">
      <button onClick={onBack} className="flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
             style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <TrendingUp size={18} style={{ color: '#22C55E' }} />
        </div>
        <div>
          <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Live Trading Account</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Track your real money account manually</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>ACCOUNT LABEL</label>
          <input className="input-dark" placeholder="e.g. Exness Main Account"
                 value={form.label} onChange={e => update('label', e.target.value)} />
        </div>

        <div>
          <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-muted)' }}>
            BROKER <span style={{ color: 'var(--negative-red)' }}>*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {BROKERS.map(b => (
              <button key={b} onClick={() => handleBrokerClick(b)}
                      className="py-2 px-3 rounded-xl text-xs font-medium transition-all text-center"
                      style={{
                        background: (b === 'Other' ? isCustomBroker : form.broker === b) ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${(b === 'Other' ? isCustomBroker : form.broker === b) ? 'rgba(34,197,94,0.5)' : 'var(--border-subtle)'}`,
                        color: (b === 'Other' ? isCustomBroker : form.broker === b) ? '#22C55E' : 'var(--text-muted)',
                      }}>
                {b}
              </button>
            ))}
          </div>
          {isCustomBroker && (
            <div className="mt-2">
              <input className="input-dark w-full" placeholder="Type your broker name…"
                     autoFocus value={customBrokerName}
                     onChange={e => { setCustomBrokerName(e.target.value); update('broker', e.target.value) }} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Enter the name of your broker</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>INITIAL DEPOSIT</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-muted)', zIndex: 1 }}>$</span>
              <input className="input-dark font-mono" style={{ paddingLeft: '2.25rem' }} placeholder="0.00" type="number" step="any" min="0"
                     value={form.initialDeposit} onChange={e => update('initialDeposit', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>CURRENCY</label>
            <select className="input-dark" value={form.currency} onChange={e => update('currency', e.target.value)}>
              {['USD','EUR','GBP','AUD','CAD','JPY','CHF'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>LEVERAGE</label>
          <div className="grid grid-cols-5 gap-2">
            {LEVERAGES.map(l => (
              <button key={l} onClick={() => update('leverage', l)}
                      className="py-2 rounded-xl text-xs font-mono font-medium transition-all"
                      style={{
                        background: form.leverage === l ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${form.leverage === l ? 'rgba(34,197,94,0.5)' : 'var(--border-subtle)'}`,
                        color: form.leverage === l ? '#22C55E' : 'var(--text-muted)',
                      }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving || !form.broker}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Creating Account…</> : <><TrendingUp size={14} /> Create Live Account</>}
        </button>
      </div>
    </div>
  )
}

// ─── Live Account Card (with deposit/withdrawal tracking) ─────────────────────
function LiveAccountCard({ account, onDisconnect, userId }) {
  const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
  const [deposits, setDeposits]       = useState([])
  const [showForm, setShowForm]       = useState(false)
  const [txType, setTxType]           = useState('deposit')
  const [txAmount, setTxAmount]       = useState('')
  const [txNotes, setTxNotes]         = useState('')
  const [txDate, setTxDate]           = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving]           = useState(false)

  async function fetchDeposits() {
    try {
      const res  = await fetch(`${BACKEND}/api/broker/${account.id}/deposits`)
      const data = await res.json()
      setDeposits(Array.isArray(data) ? data : [])
    } catch (_) { setDeposits([]) }
  }

  useEffect(() => { fetchDeposits() }, [account.id])

  // Calculate balances
  const initial      = parseFloat(account.settings?.initial_deposit || 0)
  const totalDep     = deposits.filter(d => d.type === 'deposit').reduce((s, d) => s + parseFloat(d.amount), 0)
  const totalWith    = deposits.filter(d => d.type === 'withdrawal').reduce((s, d) => s + parseFloat(d.amount), 0)
  const currentBal   = initial + totalDep - totalWith
  const currency     = account.currency || 'USD'
  const fmt          = n => `${currency} ${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  async function handleAddTx() {
    if (!txAmount || parseFloat(txAmount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch(`${BACKEND}/api/broker/${account.id}/deposits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: txType, amount: parseFloat(txAmount), notes: txNotes, date: txDate }),
      })
      if (!res.ok) throw new Error()
      toast.success(txType === 'deposit' ? 'Deposit recorded' : 'Withdrawal recorded')
      setTxAmount(''); setTxNotes(''); setShowForm(false)
      await fetchDeposits()
    } catch (_) {
      toast.error('Failed to save transaction')
    }
    setSaving(false)
  }

  return (
    <div className="glass-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <TrendingUp size={20} style={{ color: '#22C55E' }} />
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{account.account_name}</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Live Trading Account</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
          <span className="text-xs font-medium" style={{ color: '#22C55E' }}>Manual</span>
        </div>
      </div>

      {/* Balance summary */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>CURRENT BALANCE</p>
        <p className="text-2xl font-bold" style={{ color: '#22C55E' }}>{fmt(currentBal)}</p>
        <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Starting: {fmt(initial)}</span>
          <span>↑ Deposited: {fmt(totalDep)}</span>
          <span>↓ Withdrawn: {fmt(totalWith)}</span>
        </div>
      </div>

      {/* Info tiles */}
      <div className="grid grid-cols-2 gap-3">
        <InfoTile label="Broker"    value={account.settings?.broker || account.broker_name} />
        <InfoTile label="Leverage"  value={account.settings?.leverage || '—'} />
        <InfoTile label="Currency"  value={currency} />
        <InfoTile label="Transactions" value={deposits.length} />
      </div>

      {/* Add deposit / withdrawal buttons */}
      <div className="flex gap-2">
        <button onClick={() => { setTxType('deposit');    setShowForm(true) }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
          <ArrowDownToLine size={14} /> Add Deposit
        </button>
        <button onClick={() => { setTxType('withdrawal'); setShowForm(true) }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
          <ArrowUpFromLine size={14} /> Add Withdrawal
        </button>
      </div>

      {/* Inline form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden rounded-xl p-4 space-y-3"
                      style={{ background: txType === 'deposit' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                               border: `1px solid ${txType === 'deposit' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <p className="text-sm font-semibold" style={{ color: txType === 'deposit' ? '#22C55E' : '#EF4444' }}>
              {txType === 'deposit' ? '↓ Add Deposit' : '↑ Add Withdrawal'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>AMOUNT ({currency})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: 'var(--text-muted)', zIndex: 1 }}>$</span>
                  <input className="input-dark font-mono" style={{ paddingLeft: '2.25rem' }} type="number" step="any" min="0" placeholder="0.00"
                         value={txAmount} onChange={e => setTxAmount(e.target.value)} autoFocus />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>DATE</label>
                <input className="input-dark" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>NOTES (OPTIONAL)</label>
              <input className="input-dark" placeholder="e.g. Monthly top-up" value={txNotes} onChange={e => setTxNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="btn-outline flex-1 justify-center py-2 text-sm">Cancel</button>
              <button onClick={handleAddTx} disabled={saving || !txAmount}
                      className="flex-1 justify-center py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
                      style={{ background: txType === 'deposit' ? '#22C55E' : '#EF4444', color: 'white' }}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction history */}
      {deposits.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>RECENT TRANSACTIONS</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deposits.slice(0, 8).map(d => (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                   style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2">
                  {d.type === 'deposit'
                    ? <ArrowDownToLine size={13} style={{ color: '#22C55E' }} />
                    : <ArrowUpFromLine size={13} style={{ color: '#EF4444' }} />}
                  <div>
                    <p className="text-xs font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{d.type}</p>
                    {d.notes && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{d.notes}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: d.type === 'deposit' ? '#22C55E' : '#EF4444' }}>
                    {d.type === 'deposit' ? '+' : '-'}{fmt(d.amount)}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onDisconnect} className="btn-outline w-full justify-center text-sm py-2.5">
        <Link2Off size={14} /> Remove Account
      </button>
    </div>
  )
}

// ─── MT5 Account Card ──────────────────────────────────────────────────────────
// Self-contained (own EA-status polling) so each connected MT5 account gets
// its own live "Awaiting EA / EA Connected" badge when there's more than one.
function MT5AccountCard({ account, syncing, onSync, onDisconnect }) {
  const [eaCardStatus, setEaCardStatus] = useState(null)
  const [showEaInstructions, setShowEaInstructions] = useState(false)
  const [showImportMore, setShowImportMore] = useState(false)

  useEffect(() => {
    if (account.sync_method !== 'ea' || !account.id) return
    let cancelled = false
    async function poll() { const s = await fetchEAStatus(account.id); if (!cancelled) setEaCardStatus(s) }
    poll()
    const id = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [account.id, account.sync_method])

  return (
    <div className="glass-card p-6">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Plug size={20} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              {account.account_name || 'MT5 Account'}
            </p>
            <p className="text-sm font-mono" style={{ color: 'var(--accent-purple-light)' }}>
              Login #{account.account_number}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {account.sync_method === 'ea' ? (
            <>
              <span className={`w-2 h-2 rounded-full ${eaCardStatus?.connected ? 'animate-pulse' : ''}`}
                    style={{ background: eaCardStatus?.error ? '#EF4444' : eaCardStatus?.connected ? 'var(--positive-green)' : '#F59E0B' }} />
              <span className="text-xs font-medium" style={{ color: eaCardStatus?.error ? '#EF4444' : eaCardStatus?.connected ? 'var(--positive-green)' : '#F59E0B' }}>
                {eaCardStatus?.error ? 'Sync Error' : eaCardStatus?.connected ? 'EA Connected' : 'Awaiting EA'}
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--positive-green)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--positive-green)' }}>
                {account.sync_method === 'import' ? 'Imported' : 'Connected'}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <InfoTile label="Broker" value={account.broker_name || 'MT5'} />
        <InfoTile label="Server" value={account.server || '—'} />
        <InfoTile label="Balance" value={account.balance != null ? `${account.currency||'USD'} ${parseFloat(account.balance).toLocaleString()}` : '—'} />
        <InfoTile label="Last Synced" value={account.last_synced_at ? new Date(account.last_synced_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Never'} />
      </div>

      {account.sync_method === 'ea' ? (
        <div className="mb-3">
          {eaCardStatus?.error ? (
            <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl text-sm mb-3"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <span style={{ color: '#EF4444' }}>⚠ {eaCardStatus.error}</span>
            </div>
          ) : !eaCardStatus?.connected && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm mb-3"
                 style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <Loader2 size={14} className="animate-spin" style={{ color: '#F59E0B' }} />
              <span style={{ color: '#F59E0B' }}>Not receiving trades yet — the EA needs to be installed and attached in MT5.</span>
            </div>
          )}
          <button onClick={() => setShowEaInstructions(s => !s)}
                  className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent-purple-light)' }}>
            <Zap size={12} /> {showEaInstructions ? 'Hide setup instructions' : (eaCardStatus?.connected ? 'View Sync Key & EA download' : 'Show setup instructions')}
          </button>
          <AnimatePresence>
            {showEaInstructions && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-3">
                <EASetupPanel token={account.ea_token} brokerAccountId={account.id} embedded />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : account.sync_method === 'import' ? (
        <AnimatePresence>
          {showImportMore && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden">
              <ImportTradesPanel mode="existing" brokerAccountId={account.id} compact
                                  onImported={() => setShowImportMore(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      ) : null}

      <div className="flex gap-3">
        {account.sync_method === 'import' && (
          <button onClick={() => setShowImportMore(s => !s)} className="btn-primary flex-1 justify-center text-sm py-2.5">
            <FileUp size={14} /> {showImportMore ? 'Hide Import' : 'Import More Trades'}
          </button>
        )}
        {account.sync_method !== 'ea' && account.sync_method !== 'import' && (
          <button onClick={onSync} disabled={syncing} className="btn-primary flex-1 justify-center text-sm py-2.5 disabled:opacity-60">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Trades Now'}
          </button>
        )}
        <button onClick={onDisconnect} className={`btn-outline px-4 py-2.5 text-sm ${account.sync_method === 'ea' ? 'flex-1 justify-center' : ''}`}>
          <Link2Off size={14} /> Disconnect
        </button>
      </div>
    </div>
  )
}

// ─── Main Accounts Page ───────────────────────────────────────────────────────
export default function Accounts() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { accounts, loading, syncing, syncTrades, connectManualAccount, disconnectAccount } = useTrades(user?.id)

  const [view, setView] = useState('choose') // 'choose' | 'mt5' | 'import' | 'manual-type' | 'prop-form' | 'live-form'
  const [saving, setSaving] = useState(false)
  // The connect flow starts open for a brand-new user (no accounts yet), and
  // otherwise only opens via "+ Add another account". It deliberately does
  // NOT auto-close just because `accounts` changes — a freshly generated EA
  // Sync Key needs to stay on screen even after the new account shows up in
  // the list above.
  const [showConnectFlow, setShowConnectFlow] = useState(accounts.length === 0)
  useEffect(() => { if (!loading && accounts.length === 0) setShowConnectFlow(true) }, [loading, accounts.length])

  // "Sync MT5 Account" from the Quick Actions menu / command palette lands
  // here with this flag — fire the sync once account data has loaded (the
  // hook itself already handles the "no account" / "manual account" cases
  // with the right toast), then clear the flag.
  useEffect(() => {
    if (location.state?.triggerSync && !loading) {
      syncTrades()
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleManualSave(data) {
    setSaving(true)
    const { error } = await connectManualAccount(data)
    setSaving(false)
    if (!error) { setShowConnectFlow(false); setView('choose') }
  }

  async function handleDisconnect(accountId) {
    if (!window.confirm('Disconnect this account? All associated trades will be removed.')) return
    await disconnectAccount(accountId)
    setView('choose')
  }

  if (loading) return (
    <PageWrapper>
      <div className="space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
    </PageWrapper>
  )

  return (
    <PageWrapper syncing={syncing}>
      <div className="max-w-xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Broker Hub</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Connect your MT5 or create a manual journal
            </p>
          </div>
          {accounts.length > 0 && !showConnectFlow && (
            <button onClick={() => { setShowConnectFlow(true); setView('choose') }}
                    className="btn-primary text-xs px-3 py-2 flex-shrink-0">
              <Plus size={14} /> Add Account
            </button>
          )}
        </div>

        {/* ── Connected accounts ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {accounts.map(acc => (
            <motion.div key={acc.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        className="mb-4">

              {/* MT5 Account card */}
              {(acc.account_type === 'mt5' || (!acc.account_type && acc.meta_api_id)) && (
                <MT5AccountCard account={acc} syncing={syncing}
                                onSync={() => syncTrades(acc)}
                                onDisconnect={() => handleDisconnect(acc.id)} />
              )}

              {/* Prop Firm account card */}
              {acc.account_type === 'prop_firm' && (
                <div className="glass-card p-6">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                           style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <Trophy size={20} style={{ color: '#F59E0B' }} />
                      </div>
                      <div>
                        <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                          {acc.account_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {acc.settings?.firm || acc.broker_name}
                          </span>
                          {acc.settings?.phase && <PhaseLabel phase={acc.settings.phase} />}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: '#F59E0B' }} />
                      <span className="text-xs font-medium" style={{ color: '#F59E0B' }}>Manual</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <InfoTile label="Account Size" value={`$${(acc.settings?.account_size || 0).toLocaleString()}`} />
                    <InfoTile label="Daily Drawdown" value={`${acc.settings?.daily_drawdown || 0}%`} />
                    <InfoTile label="Max Drawdown" value={`${acc.settings?.max_drawdown || 0}%`} />
                    <InfoTile label="Profit Target" value={`${acc.settings?.profit_target || 0}%`} />
                    <InfoTile label="Currency" value={acc.currency || 'USD'} />
                    <InfoTile label="Profit $ Target" value={`$${((acc.settings?.account_size || 0) * (acc.settings?.profit_target || 0) / 100).toLocaleString()}`} />
                  </div>
                  <button onClick={() => handleDisconnect(acc.id)} className="btn-outline w-full justify-center text-sm py-2.5">
                    <Link2Off size={14} /> Remove Account
                  </button>
                </div>
              )}

              {/* Live account card */}
              {acc.account_type === 'live' && (
                <LiveAccountCard account={acc} onDisconnect={() => handleDisconnect(acc.id)} userId={user?.id} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Connect flow — onboarding for a new user, or "+ Add Account" ───── */}
        {showConnectFlow && (
          <AnimatePresence mode="wait">
            {accounts.length > 0 && (
              <button onClick={() => { setShowConnectFlow(false); setView('choose') }}
                      className="flex items-center gap-2 text-sm mb-4 hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--text-muted)' }}>
                <ArrowLeft size={15} /> Back to my accounts
              </button>
            )}

            {/* Choose view — two big option cards */}
            {view === 'choose' && (
              <motion.div key="choose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                          className="space-y-4">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Choose how to add your account</p>

                {/* Connect MT5 */}
                <button onClick={() => setView('mt5')}
                        className="w-full glass-card p-6 text-left transition-all hover:scale-[1.01] group"
                        style={{ cursor: 'pointer' }}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                         style={{ background: 'var(--gradient-primary)' }}>
                      <Plug size={20} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Connect MT5 Account</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple-light)' }}>RECOMMENDED</span>
                      </div>
                      <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                        Enter your MT5 credentials and we'll sync all your trades automatically.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {['Auto trade sync', 'Full history', 'Real-time data'].map(f => (
                          <span key={f} className="text-xs px-2 py-1 rounded-lg"
                                style={{ background: 'rgba(139,92,246,0.08)', color: 'var(--accent-purple-light)' }}>✓ {f}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown size={16} className="-rotate-90 flex-shrink-0 mt-1 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-primary)' }} />
                  </div>
                </button>

                {/* Create manually */}
                <button onClick={() => setView('manual-type')}
                        className="w-full glass-card p-6 text-left transition-all hover:scale-[1.01] group"
                        style={{ cursor: 'pointer' }}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                         style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}>
                      <PenLine size={20} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Create Account Manually</p>
                      <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                        Log your own trades. Great for prop firm challenges and live accounts.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {['Prop firm tracking', 'Live accounts', 'Full control'].map(f => (
                          <span key={f} className="text-xs px-2 py-1 rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>✓ {f}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown size={16} className="-rotate-90 flex-shrink-0 mt-1 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-primary)' }} />
                  </div>
                </button>

                {/* Import CSV/HTML */}
                <button onClick={() => setView('import')}
                        className="w-full glass-card p-6 text-left transition-all hover:scale-[1.01] group"
                        style={{ cursor: 'pointer' }}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                         style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.2)' }}>
                      <FileUp size={20} style={{ color: '#14B8A6' }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Import from CSV/HTML</p>
                      <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                        Upload your MT5 trade history report to backfill your journal instantly.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {['One-time upload', 'Full history', 'No install needed'].map(f => (
                          <span key={f} className="text-xs px-2 py-1 rounded-lg"
                                style={{ background: 'rgba(20,184,166,0.08)', color: '#14B8A6' }}>✓ {f}</span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown size={16} className="-rotate-90 flex-shrink-0 mt-1 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-primary)' }} />
                  </div>
                </button>
              </motion.div>
            )}

            {/* MT5 form */}
            {view === 'mt5' && (
              <motion.div key="mt5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <MT5Form onBack={() => setView('choose')} onConnected={() => {}} />
              </motion.div>
            )}

            {/* CSV/HTML import form */}
            {view === 'import' && (
              <motion.div key="import" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                          className="space-y-4">
                <button onClick={() => setView('choose')} className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}>
                  <ArrowLeft size={15} /> Back
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(20,184,166,0.12)' }}>
                    <FileUp size={18} style={{ color: '#14B8A6' }} />
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Import from CSV/HTML</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>From MT5: right-click History tab → Report → HTML (or CSV)</p>
                  </div>
                </div>
                <ImportTradesPanel mode="onboarding" onImported={() => { setShowConnectFlow(false); setView('choose') }} />
              </motion.div>
            )}

            {/* Manual type picker */}
            {view === 'manual-type' && (
              <motion.div key="manual-type" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                          className="space-y-4">
                <button onClick={() => setView('choose')} className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}>
                  <ArrowLeft size={15} /> Back
                </button>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>What type of account?</p>

                <button onClick={() => setView('prop-form')}
                        className="w-full glass-card p-6 text-left transition-all hover:scale-[1.01] group" style={{ cursor: 'pointer' }}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                         style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <Trophy size={20} style={{ color: '#F59E0B' }} />
                    </div>
                    <div>
                      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Prop Firm Account</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Track FTMO, MyForexFunds, The5ers, FundedNext, and more — with drawdown and profit target monitoring.
                      </p>
                    </div>
                    <ChevronDown size={16} className="-rotate-90 flex-shrink-0 mt-1 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-primary)' }} />
                  </div>
                </button>

                <button onClick={() => setView('live-form')}
                        className="w-full glass-card p-6 text-left transition-all hover:scale-[1.01] group" style={{ cursor: 'pointer' }}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                         style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <TrendingUp size={20} style={{ color: '#22C55E' }} />
                    </div>
                    <div>
                      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Live Trading Account</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Track your real money broker account. Log trades manually, track deposits and withdrawals.
                      </p>
                    </div>
                    <ChevronDown size={16} className="-rotate-90 flex-shrink-0 mt-1 opacity-40 group-hover:opacity-70 transition-opacity" style={{ color: 'var(--text-primary)' }} />
                  </div>
                </button>
              </motion.div>
            )}

            {/* Prop firm form */}
            {view === 'prop-form' && (
              <motion.div key="prop" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <PropFirmForm onBack={() => setView('manual-type')} onSave={handleManualSave} saving={saving} />
              </motion.div>
            )}

            {/* Live account form */}
            {view === 'live-form' && (
              <motion.div key="live" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <LiveAccountForm onBack={() => setView('manual-type')} onSave={handleManualSave} saving={saving} />
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </div>
    </PageWrapper>
  )
}