// ─── Circular ring gauge ───────────────────────────────────────────────
// Used for the Win/Loss Distribution donut and the Key Metrics circles on
// the Smart Insights report. Pure SVG, no chart library needed for a
// single-ring gauge — keeps this cheap to render several at once.
export default function CircularGauge({ pct = 0, size = 110, stroke = 8, color = 'var(--positive-green)', trackColor = 'rgba(255,255,255,0.06)', label, sub }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1">
        <span className="font-bold" style={{ color, fontSize: size >= 100 ? 20 : 14, lineHeight: 1.1 }}>{label}</span>
        {sub && <span className="text-[9px] uppercase tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
    </div>
  )
}