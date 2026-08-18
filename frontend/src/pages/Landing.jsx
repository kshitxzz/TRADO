import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, BarChart2, Zap, Shield, TrendingUp, CheckCircle, ChevronRight, Trophy, LineChart } from 'lucide-react'
import Logo from '../components/ui/Logo'
import AnimatedCounter from '../components/landing/AnimatedCounter'
import PlatformShowcase from '../components/landing/PlatformShowcase'
import FeatureRows from '../components/landing/FeatureRows'
import HowItWorks from '../components/landing/HowItWorks'

const TICKERS = [
  { symbol:'XAUUSD', val:'+$342.50', pct:'+1.82%', up:true },
  { symbol:'EURUSD', val:'+$124.00', pct:'+0.91%', up:true },
  { symbol:'GBPJPY', val:'-$86.20',  pct:'-0.44%', up:false },
  { symbol:'NAS100', val:'+$612.80', pct:'+3.61%', up:true  },
  { symbol:'USDJPY', val:'+$54.30',  pct:'+0.36%', up:true  },
  { symbol:'GBPUSD', val:'-$43.10',  pct:'-0.34%', up:false },
  { symbol:'US30',   val:'+$418.00', pct:'+1.08%', up:true  },
  { symbol:'XAGUSD', val:'+$27.80',  pct:'+0.97%', up:true  },
]

const GLYPHS = [
  { x:'8%',  y:'20%', char:'✕' }, { x:'82%', y:'15%', char:'✕' }, { x:'92%', y:'40%', char:'✕' },
  { x:'4%',  y:'55%', char:'+' }, { x:'78%', y:'70%', char:'+' }, { x:'60%', y:'85%', char:'✕' },
  { x:'20%', y:'75%', char:'+' }, { x:'50%', y:'10%', char:'✕' }, { x:'95%', y:'80%', char:'+' },
]

// "Everything else" — the rest of the real feature set not already given
// its own big showcase section above (Journal / Trado AI / Trade DNA /
// Trade Replay each have their own row; equity curve, behavioral score,
// session breakdown and auto-sync each have their own bento card).
const MORE_FEATURES = [
  { icon: BarChart2,  title: 'Advanced Reports',       desc: 'Deep-dive breakdowns by symbol, strategy, and time — every angle of your performance, exportable.', to: '/analytics/advanced-reports' },
  { icon: TrendingUp, title: 'Progress Tracker',       desc: 'Weekly goals, streaks, and a leaderboard to keep you accountable and see how you stack up.', to: '/progress' },
  { icon: Trophy,     title: 'Share Cards',            desc: 'Turn your stats into a clean, professional card you can post or send — no screenshots needed.', to: '/share-cards' },
  { icon: LineChart,  title: 'Calendar Heatmap',       desc: 'A day-by-day view of your trading — spot your best days and your worst habits at a glance.', to: '/analytics/day-view' },
  { icon: Shield,     title: 'Multi-Broker Accounts',  desc: 'Connect more than one MT5 account and switch between them without losing your history.', to: '/accounts' },
  { icon: Zap,        title: 'Live P&L Ticking',       desc: 'Open positions update in real time, right down to the digit — no refresh, no delay.', to: '/dashboard' },
]

const PRICING = [
  {
    name: 'Starter', price: 'Free', sub: 'Forever',
    features: ['Up to 50 trades/month', 'Basic analytics', 'MT5 sync (manual)', 'Trade journal'],
    cta: 'Get Started', highlight: false,
  },
  {
    name: 'Pro', price: '₹999', sub: '/month',
    features: ['Unlimited trades', 'Full AI analytics', 'Auto MT5 sync', 'Behavioral scoring', 'All analytics pages', 'Priority support'],
    cta: 'Start Free Trial', highlight: true,
  },
  {
    name: 'Lifetime', price: '₹4,999', sub: 'one-time',
    features: ['Everything in Pro', 'Lifetime access', 'Future updates free', 'API access'],
    cta: 'Get Lifetime', highlight: false,
  },
]

const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } } }
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } }

function Navbar({ onSignIn, onGetStarted }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <motion.nav
      initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{ background: scrolled ? 'rgba(11,8,20,0.92)' : 'transparent', backdropFilter: scrolled ? 'blur(20px)' : 'none',
               borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo height={26} />
        </div>
        <div className="hidden md:flex items-center gap-7 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {['Home','Features','Pricing','About'].map(l => (
            <a key={l} href={l==='Pricing'?'#pricing':l==='Features'?'#features':'#'}
               className="hover:text-white transition-colors cursor-pointer">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onSignIn} className="btn-outline text-sm px-4 py-2">Sign in</button>
          <button onClick={onGetStarted} className="btn-primary text-sm px-4 py-2">Get Started <ArrowRight size={14} /></button>
        </div>
      </div>
    </motion.nav>
  )
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto rounded-2xl overflow-hidden shadow-2xl border max-w-3xl"
         style={{ background:'var(--bg-card)', borderColor:'rgba(139,92,246,0.2)',
                  boxShadow:'0 40px 100px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.1)' }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background:'rgba(0,0,0,0.3)', borderColor:'rgba(255,255,255,0.06)' }}>
        <div className="flex gap-1.5">
          {['#F43F5E','#F59E0B','#22C55E'].map(c=><div key={c} className="w-2.5 h-2.5 rounded-full" style={{background:c}} />)}
        </div>
        <div className="flex-1 mx-3 rounded-md px-3 py-1 text-[11px] text-center" style={{ background:'rgba(255,255,255,0.05)', color:'var(--text-muted)' }}>
          trado.app/dashboard
        </div>
      </div>
      <div className="flex" style={{ height: 260 }}>
        <div className="w-36 border-r py-3 px-2 space-y-1" style={{ background:'var(--bg-sidebar)', borderColor:'rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2 px-3 py-1 mb-3">
            <Logo variant="icon" height={16} />
            <span className="text-[10px] font-bold text-white">Trado</span>
          </div>
          {['Dashboard','Analytics','Trades','Journal','Trado AI'].map((l,i)=>(
            <div key={l} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px]"
                 style={{ background:i===0?'rgba(139,92,246,0.12)':'transparent',
                          color:i===0?'var(--accent-purple-light)':'var(--text-muted)',
                          borderLeft:`2px solid ${i===0?'var(--accent-purple)':'transparent'}` }}>
              {l}
            </div>
          ))}
        </div>
        <div className="flex-1 p-4">
          <p className="text-sm font-bold text-white mb-1">Good morning, <span style={{color:'var(--accent-purple-light)'}}>Trader</span></p>
          <p className="text-[10px] mb-3" style={{color:'var(--text-muted)'}}>Here's your trading performance overview</p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              {l:'Today',v:'+$847.20',c:'var(--positive-green)'},{l:'Balance',v:'$24,248'},{l:'Total P&L',v:'+$4,248',c:'var(--positive-green)'},{l:'Win Rate',v:'67%'},
            ].map(s=>(
              <div key={s.l} className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <p className="text-[9px] mb-1" style={{color:'var(--text-muted)'}}>{s.l}</p>
                <p className="text-[11px] font-bold" style={{color:s.c||'white'}}>{s.v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg p-2" style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)',height:64}}>
            <p className="text-[9px] mb-1" style={{color:'var(--text-muted)'}}>Equity Curve</p>
            <svg width="100%" height="40" viewBox="0 0 200 40">
              <polyline points="0,30 20,28 40,20 60,22 80,15 100,18 120,10 140,12 160,6 180,8 200,4"
                        fill="none" stroke="url(#landGrad)" strokeWidth="2" />
              <defs><linearGradient id="landGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8B5CF6" /><stop offset="100%" stopColor="#6D28D9" />
              </linearGradient></defs>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

function Sparkles({ size, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
    </svg>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const heroRef  = useRef(null)
  const [mousePos, setMousePos] = useState({ x:0, y:0 })

  // The landing page is a fixed dark brand surface — it shouldn't flip to
  // the light palette just because a returning visitor previously toggled
  // light mode inside the app. This only affects the classes visually
  // while this page is mounted; it never touches localStorage or the
  // ThemeProvider's own state, so the visitor's real preference is exactly
  // as they left it the moment they navigate into the app.
  useEffect(() => {
    const root = document.documentElement
    const hadLight = root.classList.contains('light')
    root.classList.remove('light')
    root.classList.add('dark')
    return () => {
      if (hadLight) {
        root.classList.add('light')
        root.classList.remove('dark')
      }
    }
  }, [])

  useEffect(() => {
    const fn = e => setMousePos({ x: e.clientX/window.innerWidth, y: e.clientY/window.innerHeight })
    window.addEventListener('mousemove', fn)
    return () => window.removeEventListener('mousemove', fn)
  }, [])

  const glyphOffset = (base) => `translateX(${mousePos.x * base}px) translateY(${mousePos.y * base}px)`

  const heroStagger = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }
  const heroItem = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } }

  return (
    <div style={{ background:'var(--bg-landing)', minHeight:'100vh', overflowX: 'hidden' }}>
      <Navbar onSignIn={() => navigate('/login')} onGetStarted={() => navigate('/signup')} />

      {/* === HERO === */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-24 pb-16 px-4">
        {GLYPHS.map((g,i) => (
          <span key={i} className="landing-glyph" style={{ left:g.x, top:g.y, transform:glyphOffset((i%2===0?4:-4)) }}>{g.char}</span>
        ))}

        <div className="absolute inset-0 pointer-events-none" style={{
          background:'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(139,92,246,0.12) 0%, transparent 70%)'
        }} />

        <motion.div initial="hidden" animate="show" variants={heroStagger} className="flex flex-col items-center">
          <motion.div variants={heroItem} className="flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-xs font-semibold border"
               style={{ background:'rgba(139,92,246,0.08)', borderColor:'rgba(139,92,246,0.25)', color:'var(--text-secondary)' }}>
            <Sparkles size={12} style={{ color:'var(--accent-purple)' }} />
            AI-POWERED TRADING JOURNAL
          </motion.div>

          <motion.h1 variants={heroItem} className="text-5xl md:text-7xl font-black text-center leading-tight mb-6 max-w-4xl">
            Your Trades,{' '}
            <span className="gradient-text">Analyzed.</span>
            <br />Your Edge,{' '}
            <span className="gradient-text">Discovered.</span>
          </motion.h1>

          <motion.p variants={heroItem} className="text-base md:text-lg text-center max-w-xl mb-8 leading-relaxed" style={{ color:'var(--text-secondary)' }}>
            The trading journal that uses AI to find patterns in your behavior, detect
            emotional leaks, and turn your trade data into a{' '}
            <strong className="text-white font-semibold">real edge</strong>.
          </motion.p>

          <motion.div variants={heroItem} className="flex flex-col sm:flex-row items-center gap-4 mb-16">
            <button onClick={() => navigate('/signup')} className="btn-primary text-base px-7 py-3.5">
              GET STARTED FREE <ArrowRight size={16} />
            </button>
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="btn-outline text-base px-7 py-3.5">
              See It In Action <ChevronRight size={16} />
            </button>
          </motion.div>

          <motion.div
            variants={heroItem}
            animate={{ y: [0, -8, 0] }}
            transition={{ y: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <DashboardPreview />
          </motion.div>
        </motion.div>
      </section>

      {/* === TICKER === */}
      <section className="py-4 border-y overflow-hidden" style={{ borderColor:'rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.3)' }}>
        <div className="marquee-container">
          <div className="marquee-inner">
            {[...TICKERS, ...TICKERS].map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm px-6 border-r" style={{ borderColor:'rgba(255,255,255,0.05)' }}>
                <span className="font-bold text-white">{t.symbol}</span>
                <span className="font-semibold" style={{ color: t.up ? 'var(--positive-green)' : 'var(--negative-red)' }}>{t.val}</span>
                <span style={{ color: t.up ? 'var(--positive-green)' : 'var(--negative-red)' }}>{t.pct}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === PLATFORM SHOWCASE (bento grid) === */}
      <PlatformShowcase />

      {/* === STATS === */}
      <section className="py-16 px-4">
        <motion.div
          className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center"
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={stagger}
        >
          {[
            { value: 50,  suffix: '+', label: 'Metrics Per Trade' },
            { value: 6,   suffix: '',  label: 'Behavioral Dimensions' },
            { value: null, text: 'Real-time', label: 'MT5 Auto-sync' },
            { value: null, text: 'AI-First', label: 'Analysis Engine' },
          ].map(s => (
            <motion.div key={s.label} variants={fadeUp} className="glass-card p-6">
              <p className="text-3xl font-black gradient-text mb-2">
                {s.value !== null ? <AnimatedCounter value={s.value} suffix={s.suffix} /> : s.text}
              </p>
              <p className="text-sm" style={{ color:'var(--text-muted)' }}>{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* === TRADES FLOW === */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-12" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }} variants={stagger}>
            <motion.div variants={fadeUp} className="stat-chip inline-flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background:'var(--positive-green)' }} />
              LIVE EXPERIENCE
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-4xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>
              Watch trades <span className="gradient-text">flow in</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-base max-w-lg mx-auto" style={{ color:'var(--text-muted)' }}>
              Every trade auto-logged by the Trado EA, categorized, and scored in real time. No manual entry — just connect and trade.
            </motion.p>
          </motion.div>

          <motion.div className="glass-card overflow-hidden" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }}>
            <div className="px-4 py-2 border-b text-center text-xs" style={{ borderColor:'rgba(255,255,255,0.05)', color:'var(--text-muted)', background:'rgba(0,0,0,0.2)' }}>
              trado.app/trades
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                    {['PAIR','STRATEGY','SIZE','DURATION','SESSION','P&L','TIME'].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs" style={{ color:'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <motion.tbody variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  {[
                    ['USDCHF','SELL','Pullback','0.32','35m 28s','Asian','+$93.29','00:02 UTC'],
                    ['GBPJPY','SELL','Breakout','0.05','18m 22s','New York','+$226.56','16:31 UTC'],
                    ['GBPUSD','BUY', 'Scalp',   '0.09','1h 12m', 'New York','+$259.37','19:12 UTC'],
                    ['XAUUSD','BUY', 'Reversal','0.10','44m 10s','London', '+$418.00','10:41 UTC'],
                  ].map(([pair,side,strat,sz,dur,sess,pnl,time],i) => (
                    <motion.tr key={i} variants={fadeUp} className="table-row-hover" style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                      <td className="px-5 py-3.5 font-bold text-sm text-white">{pair}</td>
                      <td className="px-5 py-3.5"><span className={side==='BUY'?'pill-buy':'pill-sell'}>{side}</span></td>
                      <td className="px-5 py-3.5 text-sm" style={{color:'var(--text-secondary)'}}>{strat}</td>
                      <td className="px-5 py-3.5 text-sm" style={{color:'var(--text-secondary)'}}>{sz}</td>
                      <td className="px-5 py-3.5 text-sm" style={{color:'var(--text-secondary)'}}>{dur}</td>
                      <td className="px-5 py-3.5"><span className="text-[11px] px-2 py-0.5 rounded" style={{background:'rgba(139,92,246,0.1)',color:'var(--accent-purple-light)'}}>{sess}</span></td>
                      <td className="px-5 py-3.5 text-sm font-bold" style={{color:'var(--positive-green)'}}>{pnl}</td>
                      <td className="px-5 py-3.5 text-xs" style={{color:'var(--text-muted)'}}>{time}</td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* === FEATURE ROWS (Journal / Trado AI / Trade DNA / Trade Replay) === */}
      <div id="features">
        <FeatureRows />
      </div>

      {/* === HOW IT WORKS === */}
      <HowItWorks />

      {/* === MORE FEATURES (compact grid) === */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-12" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-4xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>
              And <span className="gradient-text">everything else</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-base max-w-lg mx-auto" style={{ color:'var(--text-muted)' }}>
              The rest of the toolkit — because your edge is more than one feature.
            </motion.p>
          </motion.div>
          <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            {MORE_FEATURES.map(f => (
              <motion.button key={f.title} variants={fadeUp} onClick={() => navigate(f.to)} className="glass-card p-6 text-left">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                     style={{ background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.2)' }}>
                  <f.icon size={18} style={{ color:'var(--accent-purple)' }} />
                </div>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color:'var(--text-muted)' }}>{f.desc}</p>
              </motion.button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === PRICING === */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div className="text-center mb-12" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-100px' }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="text-4xl font-black mb-4" style={{ color: 'var(--text-primary)' }}>Simple, transparent pricing</motion.h2>
            <motion.p variants={fadeUp} className="text-base" style={{ color:'var(--text-muted)' }}>Start free, upgrade when you're ready</motion.p>
          </motion.div>
          <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-5" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={stagger}>
            {PRICING.map(p => (
              <motion.div key={p.name} variants={fadeUp} className="glass-card p-7 flex flex-col relative"
                   style={{ border: p.highlight ? '1px solid var(--border-glow)' : undefined,
                            boxShadow: p.highlight ? '0 0 40px rgba(139,92,246,0.15)' : undefined }}>
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white"
                       style={{ background:'var(--gradient-primary)' }}>Most Popular</div>
                )}
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color:'var(--accent-purple)' }}>{p.name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">{p.price}</span>
                    <span className="text-sm" style={{ color:'var(--text-muted)' }}>{p.sub}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color:'var(--text-secondary)' }}>
                      <CheckCircle size={14} style={{ color:'var(--positive-green)', flexShrink:0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate('/signup')}
                        className={p.highlight ? 'btn-primary justify-center' : 'btn-outline justify-center'}>
                  {p.cta}
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* === CTA === */}
      <section className="py-20 px-4">
        <motion.div className="max-w-2xl mx-auto text-center" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 0.6 }}>
          <div className="glass-card p-12 relative overflow-hidden" style={{ border:'1px solid rgba(139,92,246,0.2)', boxShadow:'0 0 60px rgba(139,92,246,0.1)' }}>
            {GLYPHS.slice(0,4).map((g,i) => (
              <span key={i} className="landing-glyph" style={{ left:`${10+i*25}%`, top:`${20+i*15}%` }}>{g.char}</span>
            ))}
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
              Ready to find your <span className="gradient-text">edge?</span>
            </h2>
            <p className="text-base mb-7" style={{ color:'var(--text-muted)' }}>
              Stop guessing. Start journaling with AI that turns your trade data into actionable insights.
            </p>
            <button onClick={() => navigate('/signup')} className="btn-primary text-base px-8 py-3.5">
              Get Started Free <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t text-center" style={{ borderColor:'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-center gap-2 mb-4">
          <Logo height={24} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-4 text-xs">
          <a href="/terms" className="hover:underline" style={{ color:'var(--text-muted)' }}>Terms of Service</a>
          <a href="/privacy" className="hover:underline" style={{ color:'var(--text-muted)' }}>Privacy Policy</a>
          <a href="/refund-policy" className="hover:underline" style={{ color:'var(--text-muted)' }}>Refund Policy</a>
        </div>
        <p className="text-xs" style={{ color:'var(--text-muted)' }}>© 2026 Trado. Built for retail traders in India &amp; globally.</p>
      </footer>
    </div>
  )
}