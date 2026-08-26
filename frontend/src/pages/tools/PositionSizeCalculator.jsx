import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Calculator, CreditCard, AlertTriangle, Crosshair, TrendingUp,
  ChevronDown, HelpCircle, RotateCcw, Shield, Check, LayoutGrid, Globe,
  DollarSign,
} from 'lucide-react'
import PageWrapper from '../../components/layout/PageWrapper'
import { INSTRUMENTS, INSTRUMENT_GROUPS, formatLots, formatCurrency } from '../../lib/positionSizeData'

const RISK_PRESETS = [0.5, 1, 2, 3, 5]
const DEFAULTS = { balance: '', risk: 1, stopLoss: '', symbol: 'XAUUSD', useCustomPip: false, customPip: '' }

// Strips anything that isn't a digit or a single decimal point, so the
// plain-text inputs behave like a numeric field without fighting the
// browser's native number-input quirks (leading zeros, stray "e", spinners).
function sanitizeDecimal(v) {
  let s = v.replace(/[^\d.]/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
  return s
}

function riskZone(pct) {
  if (pct < 1.5) return 'conservative'
  if (pct < 4) return 'moderate'
  return 'aggressive'
}

function StatTile({ icon: Icon, label, value, sub, danger }) {
  return (
    <div className="stat-tile p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
           style={{ background: danger ? 'rgba(244,63,94,0.14)' : 'rgba(139,92,246,0.14)' }}>
        <Icon size={15} style={{ color: danger ? 'var(--negative-red)' : 'var(--accent-purple-light)' }} />
      </div>
      <p className="text-[10px] font-semibold tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-lg font-bold" style={{ color: danger ? 'var(--negative-red)' : 'var(--text-primary)' }}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  )
}

function SummaryGrid({ rows }) {
  return (
    <div className="grid grid-cols-2">
      {rows.map(([label, value], i) => (
        <div key={label} className="py-2.5"
             style={{
               borderRight:  i % 2 === 0 ? '1px solid var(--border-subtle)' : 'none',
               borderBottom: i < rows.length - 2 ? '1px solid var(--border-subtle)' : 'none',
               paddingRight: i % 2 === 0 ? 12 : 0,
               paddingLeft:  i % 2 === 1 ? 12 : 0,
             }}>
          <p className="text-[10px] font-medium tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
        </div>
      ))}
    </div>
  )
}

// Native <select>/<optgroup> can't be themed — group labels and the
// selected-row highlight fall back to raw OS chrome (a white bar behind the
// group label, OS-blue selection) no matter what CSS is applied to the
// select itself. This is a fully custom dropdown instead, styled to match
// the rest of the app (same pattern as CountrySelect.jsx).
function InstrumentSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
              className="input-dark flex items-center justify-between w-full text-left"
              style={{ borderColor: open ? 'var(--accent-purple)' : 'var(--border-subtle)', boxShadow: open ? '0 0 0 3px rgba(139,92,246,0.15)' : 'none' }}>
        <span className="font-medium">{value}</span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease', flexShrink: 0 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 mt-2 z-30 rounded-xl overflow-hidden shadow-2xl"
            style={{ background: '#16151B', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="max-h-72 overflow-y-auto py-1.5">
              {INSTRUMENT_GROUPS.map(g => (
                <div key={g.label}>
                  <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {g.label}
                  </p>
                  {g.symbols.map(sym => {
                    const isSel = sym === value
                    return (
                      <button key={`${g.label}-${sym}`} type="button"
                              onClick={() => { onChange(sym); setOpen(false) }}
                              className="w-full flex items-center justify-between px-3.5 py-2 text-left text-sm transition-colors"
                              style={{ background: isSel ? 'rgba(139,92,246,0.14)' : 'transparent', color: isSel ? 'var(--accent-purple-light)' : 'var(--text-secondary)' }}
                              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}>
                        <span className="font-medium">{sym}</span>
                        {isSel && <Check size={13} style={{ flexShrink: 0 }} />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function PositionSizeCalculator() {
  const [balance, setBalance]         = useState(DEFAULTS.balance)
  const [risk, setRisk]               = useState(DEFAULTS.risk)
  const [stopLoss, setStopLoss]       = useState(DEFAULTS.stopLoss)
  const [symbol, setSymbol]           = useState(DEFAULTS.symbol)
  const [useCustomPip, setUseCustomPip] = useState(DEFAULTS.useCustomPip)
  const [customPip, setCustomPip]     = useState(DEFAULTS.customPip)
  const [showFormula, setShowFormula] = useState(true)
  const [attempted, setAttempted]     = useState(false)

  const balanceNum  = parseFloat(balance) || 0
  const stopLossNum = parseFloat(stopLoss) || 0
  const instrument   = INSTRUMENTS[symbol]
  const defaultPip    = instrument.pipValue
  const pipSize        = instrument.pipSize
  const pipValue       = useCustomPip ? (parseFloat(customPip) || 0) : defaultPip

  const riskAmount = balanceNum * (risk / 100)
  const isValid = balanceNum > 0 && stopLossNum > 0 && pipValue > 0

  const positionSizeRaw = useMemo(
    () => (isValid ? riskAmount / (stopLossNum * pipValue) : 0),
    [isValid, riskAmount, stopLossNum, pipValue]
  )

  const zone = riskZone(risk)

  function handleReset() {
    setBalance(DEFAULTS.balance)
    setRisk(DEFAULTS.risk)
    setStopLoss(DEFAULTS.stopLoss)
    setSymbol(DEFAULTS.symbol)
    setUseCustomPip(DEFAULTS.useCustomPip)
    setCustomPip(DEFAULTS.customPip)
    setAttempted(false)
  }

  return (
    <PageWrapper>
      <style>{`
        .risk-slider {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 6px; border-radius: 999px;
          background: rgba(255,255,255,0.1); outline: none; cursor: pointer;
        }
        .risk-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--accent-purple); box-shadow: 0 2px 8px rgba(139,92,246,0.55);
          border: none; cursor: pointer;
        }
        .risk-slider::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--accent-purple); box-shadow: 0 2px 8px rgba(139,92,246,0.55);
          border: none; cursor: pointer;
        }
        .risk-slider::-moz-range-track { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.1); }
        .psc-preset { transition: border-color 150ms ease, color 150ms ease, background 150ms ease; }
      `}</style>

      <Link to="/tools" className="inline-flex items-center gap-2 text-sm mb-4 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={15} /> Back to Tools
      </Link>

      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-primary)' }}>
          <Calculator size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Position Size Calculator</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Calculate optimal lot size based on risk tolerance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ───────── LEFT: inputs ───────── */}
        <div className="space-y-5">

          {/* Account Balance */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={14} style={{ color: 'var(--accent-purple-light)' }} />
              <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>ACCOUNT BALANCE</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg px-3.5 py-2.5"
                 style={{
                   background: 'rgba(255,255,255,0.04)',
                   border: `1px solid ${attempted && balanceNum <= 0 ? 'var(--negative-red)' : 'var(--border-subtle)'}`,
                 }}>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
              <input type="text" inputMode="decimal" placeholder="10,000" value={balance}
                     onChange={e => setBalance(sanitizeDecimal(e.target.value))}
                     className="bg-transparent flex-1 min-w-0 outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Enter your trading account balance</p>
          </div>

          {/* Risk Percentage */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} style={{ color: 'var(--accent-purple-light)' }} />
              <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>RISK PERCENTAGE</p>
            </div>
            <div className="flex items-end justify-between mb-3">
              <span className="text-3xl font-extrabold" style={{ color: 'var(--accent-purple-light)' }}>{risk}%</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(riskAmount)}</span>
            </div>
            <input type="range" min={0.1} max={10} step={0.1} value={risk}
                   onChange={e => setRisk(Number(e.target.value))} className="risk-slider" />
            <div className="flex items-center justify-between mt-1.5 mb-3.5">
              <span className="text-[10px] font-bold tracking-wide" style={{ color: zone === 'conservative' ? 'var(--accent-purple-light)' : 'var(--text-muted)' }}>CONSERVATIVE</span>
              <span className="text-[10px] font-bold tracking-wide" style={{ color: zone === 'moderate' ? 'var(--accent-purple-light)' : 'var(--text-muted)' }}>MODERATE</span>
              <span className="text-[10px] font-bold tracking-wide" style={{ color: zone === 'aggressive' ? 'var(--accent-purple-light)' : 'var(--text-muted)' }}>AGGRESSIVE</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {RISK_PRESETS.map(p => {
                const active = Math.abs(risk - p) < 0.001
                return (
                  <button key={p} onClick={() => setRisk(p)}
                          className="psc-preset rounded-lg py-2 text-xs font-semibold"
                          style={{
                            background: active ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${active ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                            color: active ? 'var(--accent-purple-light)' : 'var(--text-secondary)',
                          }}>
                    {p}%
                  </button>
                )
              })}
            </div>
          </div>

          {/* Stop Loss Distance */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Crosshair size={14} style={{ color: 'var(--accent-purple-light)' }} />
              <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>STOP LOSS DISTANCE</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg px-3.5 py-2.5"
                 style={{
                   background: 'rgba(255,255,255,0.04)',
                   border: `1px solid ${attempted && stopLossNum <= 0 ? 'var(--negative-red)' : 'var(--border-subtle)'}`,
                 }}>
              <input type="text" inputMode="decimal" placeholder="20" value={stopLoss}
                     onChange={e => setStopLoss(sanitizeDecimal(e.target.value))}
                     className="bg-transparent flex-1 min-w-0 outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
              <span style={{ width: 1, height: 16, background: 'var(--border-subtle)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>pips</span>
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Distance from entry to stop loss in pips</p>
          </div>

          {/* Trading Instrument */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} style={{ color: 'var(--accent-purple-light)' }} />
              <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>TRADING INSTRUMENT</p>
            </div>
            <InstrumentSelect value={symbol} onChange={setSymbol} />

            <div className="flex items-center gap-3 mt-3 rounded-lg px-4 py-2.5 text-xs font-medium"
                 style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Pip Value: <b style={{ color: 'var(--text-primary)' }}>${defaultPip}/lot</b></span>
              <span style={{ width: 1, height: 14, background: 'rgba(139,92,246,0.25)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Pip Size: <b style={{ color: 'var(--text-primary)' }}>{pipSize}</b></span>
            </div>

            <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={useCustomPip} onChange={e => setUseCustomPip(e.target.checked)}
                     className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--accent-purple)' }} />
              Use custom pip value
            </label>

            <AnimatePresence initial={false}>
              {useCustomPip && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                  <div className="mt-3">
                    <label className="text-[11px] font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Custom Pip Value ($ per lot)</label>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                      <DollarSign size={14} style={{ color: 'var(--text-muted)' }} />
                      <input type="text" inputMode="decimal" placeholder={String(defaultPip)} value={customPip}
                             onChange={e => setCustomPip(sanitizeDecimal(e.target.value))}
                             className="bg-transparent flex-1 min-w-0 outline-none text-sm" style={{ color: 'var(--text-primary)' }} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button onClick={() => setAttempted(true)} className="btn-primary flex-1 justify-center">
              <Calculator size={16} /> Calculate Position Size
            </button>
            <button onClick={handleReset} className="btn-outline">
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>

        {/* ───────── RIGHT: results ───────── */}
        <div>
          {!isValid ? (
            <div className="glass-card p-8 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(139,92,246,0.14)' }}>
                <Calculator size={26} style={{ color: 'var(--accent-purple-light)' }} />
              </div>
              <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>Enter Your Parameters</h3>
              <p className="text-xs leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                Fill in your account balance, risk percentage, and stop loss to calculate your optimal position size.
              </p>
              <div className="space-y-2 text-left">
                {[
                  'Most professionals risk 1-2% per trade',
                  'Always define your stop loss before entering',
                  'Position sizing is key to long-term survival',
                ].map(tip => (
                  <div key={tip} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs"
                       style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <Check size={13} style={{ color: 'var(--accent-purple-light)', flexShrink: 0 }} /> {tip}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl p-6 text-center"
                   style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.16), rgba(139,92,246,0.03))', border: '1px solid rgba(139,92,246,0.25)' }}>
                <p className="text-[11px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>RECOMMENDED POSITION SIZE</p>
                <p className="flex items-end justify-center gap-2">
                  <span className="text-5xl font-extrabold" style={{ color: 'var(--accent-purple-light)' }}>{formatLots(positionSizeRaw)}</span>
                  <span className="text-sm font-medium pb-1.5" style={{ color: 'var(--text-secondary)' }}>Standard Lots</span>
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Based on {risk}% risk ({formatCurrency(riskAmount)})</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatTile icon={LayoutGrid} label="MINI LOTS" value={formatLots(positionSizeRaw * 10)} sub="10,000 units" />
                <StatTile icon={Globe} label="MICRO LOTS" value={formatLots(positionSizeRaw * 100)} sub="1,000 units" />
                <StatTile icon={Shield} label="RISK AMOUNT" value={formatCurrency(riskAmount)} sub={`${risk}% of balance`} />
                <StatTile icon={AlertTriangle} label="LOSS AT STOP" value={formatCurrency(riskAmount)} sub="If SL is hit" danger />
              </div>

              <div className="glass-card p-5">
                <p className="text-xs font-semibold tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>TRADE SUMMARY</p>
                <SummaryGrid rows={[
                  ['ACCOUNT BALANCE', formatCurrency(balanceNum)],
                  ['SYMBOL', symbol],
                  ['STOP LOSS', `${stopLossNum} pips`],
                  ['PIP VALUE', `$${pipValue}/pip/lot`],
                ]} />
              </div>

              <div>
                <button onClick={() => setShowFormula(s => !s)}
                        className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  <HelpCircle size={13} /> How is this calculated?
                  <ChevronDown size={13} style={{ transform: showFormula ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }} />
                </button>
                <AnimatePresence initial={false}>
                  {showFormula && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                      <div className="rounded-xl p-4 mt-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                        <p className="text-sm font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>Forex Position Size Formula:</p>
                        <div className="rounded-lg px-3 py-2.5 mb-2.5" style={{ background: '#0A0A0F' }}>
                          <code className="text-xs" style={{ color: 'var(--accent-purple-light)', fontFamily: 'monospace' }}>
                            Position Size = Risk Amount ÷ (Stop Loss × Pip Value)
                          </code>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          = {formatCurrency(riskAmount)} ÷ ({stopLossNum} × ${pipValue}) = {formatLots(positionSizeRaw)} lots
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  )
}