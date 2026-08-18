import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

const BG   = '#13131f'
const BG2  = '#1c1c2e'
const BDR  = 'rgba(255,255,255,0.09)'
const TXT  = 'rgba(255,255,255,0.85)'
const MUTE = 'rgba(255,255,255,0.32)'
const PUR  = '#8B5CF6'
const PUR2 = '#C4B5FD'

function pad(n) { return String(n).padStart(2, '0') }

function toLocalISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 24h → {h12, isPm}
function to12(h24) {
  const isPm = h24 >= 12
  const h12  = h24 % 12 || 12
  return { h12, isPm }
}
// 12h + isPm → 24h
function to24(h12, isPm) {
  if (isPm)  return h12 === 12 ? 12 : h12 + 12
  return h12 === 12 ? 0 : h12
}

function formatDisplay(d) {
  if (!d) return null
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

// ── Custom scroll-wheel column ────────────────────────────────────────────────
function Wheel({ value, min, max, step = 1, format, onChange, label }) {
  function inc() {
    const next = value + step > max ? min : value + step
    onChange(next)
  }
  function dec() {
    const prev = value - step < min ? max : value - step
    onChange(prev)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <button type="button" onClick={inc}
              style={{ padding:'6px 10px', borderRadius:8, border:'none', cursor:'pointer',
                       background:'transparent', color: MUTE, lineHeight:1 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <ChevronUp size={15} />
      </button>

      <div style={{
        width: 52, height: 48, display:'flex', alignItems:'center', justifyContent:'center',
        borderRadius: 10, background: BG2, border: `1px solid ${BDR}`,
        fontSize: 22, fontWeight: 700, fontFamily: "'Poppins', sans-serif", color: TXT,
        letterSpacing: '-0.5px', userSelect: 'none',
      }}>
        {format ? format(value) : value}
      </div>

      <button type="button" onClick={dec}
              style={{ padding:'6px 10px', borderRadius:8, border:'none', cursor:'pointer',
                       background:'transparent', color: MUTE, lineHeight:1 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <ChevronDown size={15} />
      </button>

      {label && (
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em',
                       textTransform:'uppercase', color: MUTE, marginTop:2 }}>
          {label}
        </span>
      )}
    </div>
  )
}

// ── AM / PM pill toggle ───────────────────────────────────────────────────────
function AmPmToggle({ isPm, onToggle }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:20 }}>
      {['AM','PM'].map(p => {
        const active = p === 'AM' ? !isPm : isPm
        return (
          <button key={p} type="button" onClick={() => {
            if (p === 'AM' && isPm)  onToggle()
            if (p === 'PM' && !isPm) onToggle()
          }}
          style={{
            width: 46, padding: '7px 0', borderRadius: 8, border: 'none',
            cursor: 'pointer', fontWeight: 700, fontSize: 12,
            background: active ? PUR : BG2,
            color: active ? '#fff' : MUTE,
            transition: 'all 0.15s',
            outline: active ? `1px solid ${PUR}` : `1px solid ${BDR}`,
          }}>
            {p}
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DateTimePicker({ value, onChange, label, placeholder, optional }) {
  const [open, setOpen]     = useState(false)
  const [viewMo, setViewMo] = useState(() => {
    const d = value ? new Date(value) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const selected = value ? new Date(value) : null
  const yr  = viewMo.getFullYear()
  const mo  = viewMo.getMonth()

  const daysInMo = new Date(yr, mo + 1, 0).getDate()
  const firstDy  = new Date(yr, mo, 1).getDay()
  const today    = new Date()

  // Current time values
  const h24 = selected ? selected.getHours()   : today.getHours()
  const min  = selected ? selected.getMinutes() : 0
  const { h12, isPm } = to12(h24)

  function base() { return selected ? new Date(selected) : (() => { const d = new Date(); return d })() }

  function pickDay(day) {
    const d = base(); d.setFullYear(yr, mo, day); onChange(toLocalISO(d))
  }

  function setH(newH12) {
    const d = base(); d.setHours(to24(newH12, isPm), d.getMinutes()); onChange(toLocalISO(d))
  }

  function setM(newMin) {
    const d = base(); d.setMinutes(newMin); onChange(toLocalISO(d))
  }

  function toggleAmPm() {
    const d = base(); d.setHours(to24(h12, !isPm), d.getMinutes()); onChange(toLocalISO(d))
  }

  return (
    <div ref={ref} style={{ position:'relative', width:'100%' }}>
      {label && (
        <label style={{ fontSize:11, fontWeight:600, display:'block', marginBottom:6, color: MUTE, textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {label}
          {!optional && <span style={{ color:'#F87171', marginLeft:2 }}>*</span>}
          {optional  && <span style={{ opacity:0.45, fontWeight:400, marginLeft:4 }}>(optional)</span>}
        </label>
      )}

      {/* Trigger */}
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display:'flex', alignItems:'center', gap:10,
        padding:'10px 14px', borderRadius:12, cursor:'pointer',
        background: BG2, border: `1px solid ${open ? PUR : BDR}`,
        boxShadow: open ? `0 0 0 2px rgba(139,92,246,0.2)` : 'none',
        color: selected ? TXT : MUTE, transition:'all 0.15s', textAlign:'left',
      }}>
        <Calendar size={14} style={{ color: open ? PUR : MUTE, flexShrink:0 }} />
        <span style={{ flex:1, fontSize:13, fontWeight:500 }}>
          {selected ? formatDisplay(selected) : (placeholder || 'Pick date & time')}
        </span>
        {selected && (
          <span style={{ fontSize:10, fontFamily:"'Poppins', sans-serif", padding:'2px 8px',
                         borderRadius:6, background:'rgba(139,92,246,0.18)', color: PUR2 }}>
            {pad(h24)}:{pad(min)}
          </span>
        )}
      </button>

      {/* Floating panel */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity:0, y:-6, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }}
                      exit={{ opacity:0, y:-6, scale:0.97 }} transition={{ duration:0.14 }}
                      style={{
                        position:'absolute', top:'calc(100% + 8px)', left:0, zIndex:9999,
                        width:310, borderRadius:18, overflow:'hidden',
                        background: BG, border:`1px solid ${BDR}`,
                        boxShadow:'0 28px 72px rgba(0,0,0,0.75)',
                      }}>

            {/* ── Month nav ── */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'12px 16px', borderBottom:`1px solid ${BDR}` }}>
              <button type="button" onClick={() => setViewMo(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
                      style={{ padding:'6px 8px', borderRadius:8, border:'none', cursor:'pointer',
                               background:'transparent', color: MUTE }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize:14, fontWeight:600, color: TXT }}>
                {MONTHS[mo]} {yr}
              </span>
              <button type="button" onClick={() => setViewMo(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
                      style={{ padding:'6px 8px', borderRadius:8, border:'none', cursor:'pointer',
                               background:'transparent', color: MUTE }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* ── Calendar ── */}
            <div style={{ padding:'12px 14px 8px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700,
                                        padding:'4px 0', color: MUTE }}>{d}</div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {Array.from({ length: firstDy }, (_,i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMo }, (_,i) => {
                  const day  = i + 1
                  const isSel = selected && selected.getDate()===day && selected.getMonth()===mo && selected.getFullYear()===yr
                  const isTod = today.getDate()===day && today.getMonth()===mo && today.getFullYear()===yr
                  return (
                    <button key={day} type="button" onClick={() => pickDay(day)} style={{
                      aspectRatio:'1', width:'100%', display:'flex', alignItems:'center',
                      justifyContent:'center', borderRadius:8, border:'none', cursor:'pointer',
                      fontSize:12, fontWeight: isSel||isTod ? 700 : 400, transition:'all 0.12s',
                      background: isSel ? PUR : isTod ? 'rgba(139,92,246,0.22)' : 'transparent',
                      color: isSel ? '#fff' : isTod ? PUR2 : TXT,
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background= isTod ? 'rgba(139,92,246,0.22)' : 'transparent' }}>
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Time wheels ── */}
            <div style={{ padding:'14px 16px 8px', borderTop:`1px solid ${BDR}` }}>
              <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase',
                           color: MUTE, marginBottom:12 }}>Time</p>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <Wheel value={h12} min={1} max={12} format={pad} onChange={setH} label="HR" />
                <span style={{ fontSize:26, fontWeight:700, color: MUTE, marginBottom:20 }}>:</span>
                <Wheel value={min} min={0} max={59} format={pad} onChange={setM} label="MIN" />
                <AmPmToggle isPm={isPm} onToggle={toggleAmPm} />
              </div>
            </div>

            {/* ── Footer ── */}
            <div style={{ display:'flex', gap:8, padding:'0 14px 14px' }}>
              {optional && (
                <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{
                  flex:1, padding:'8px 0', borderRadius:10, border:`1px solid ${BDR}`,
                  background:'transparent', color: MUTE, fontSize:12, fontWeight:600, cursor:'pointer',
                }}>Clear</button>
              )}
              <button type="button" onClick={() => { onChange(toLocalISO(new Date())); setOpen(false) }} style={{
                flex:1, padding:'8px 0', borderRadius:10, border:`1px solid rgba(139,92,246,0.35)`,
                background:'rgba(139,92,246,0.12)', color: PUR2, fontSize:12, fontWeight:600, cursor:'pointer',
              }}>Now</button>
              <button type="button" onClick={() => setOpen(false)} style={{
                flex:1, padding:'8px 0', borderRadius:10, border:'none',
                background: PUR, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer',
              }}>Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}