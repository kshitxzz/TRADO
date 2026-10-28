import { X, Eye, EyeOff, Lock, Unlock, Trash2, Settings2, Activity, PenLine, Bell } from 'lucide-react'
import { TOOLS } from '../../lib/backtest/drawings'
import { indicatorLabel } from '../../lib/backtest/indicators'

const Row = ({ selected, onClick, icon: Icon, color, title, sub, children }) => (
  <div onClick={onClick} className="group flex items-center gap-2 pl-3 pr-1.5 h-9 cursor-pointer transition-colors hover:bg-white/5"
       style={{ background: selected ? 'rgba(139,92,246,0.14)' : undefined }}>
    <Icon size={14} style={{ color: color || 'var(--text-secondary)' }} className="flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-[12.5px] truncate" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {sub && <p className="text-[10.5px] truncate -mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
    <div className="flex items-center opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
)
const Mini = ({ title, onClick, children }) => <button type="button" title={title} onClick={onClick} className="p-1.5 rounded hover:bg-white/10" style={{ color: 'var(--text-secondary)' }}>{children}</button>

/** Everything on the chart in one list: indicators, drawings and alerts. */
export default function ObjectTree({
  drawings, indicators, selectedId, digits, onSelect, onChangeDrawing, onDeleteDrawing, onToggleIndicator, onRemoveIndicator, onIndicatorSettings, onClose,
}) {
  const draw = drawings.filter(d => d.type !== 'alert'), alerts = drawings.filter(d => d.type === 'alert')
  const Head = ({ children, n }) => <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{children} <span className="font-normal">· {n}</span></p>
  const none = (t) => <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{t}</p>

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 flex flex-col" style={{ width: 290, background: 'var(--bg-card)', borderLeft: '1px solid var(--border-subtle)', boxShadow: '-12px 0 40px rgba(0,0,0,0.3)' }}
         onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 h-11 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Object tree</p>
        <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto pb-3">
        <Head n={indicators.length}>Indicators</Head>
        {indicators.length === 0 && none('No indicators on the chart.')}
        {indicators.map(ind => (
          <Row key={ind.id} icon={Activity} color={ind.color} title={indicatorLabel(ind)}>
            <Mini title={ind.visible === false ? 'Show' : 'Hide'} onClick={() => onToggleIndicator(ind.id)}>{ind.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}</Mini>
            <Mini title="Settings" onClick={onIndicatorSettings}><Settings2 size={13} /></Mini>
            <Mini title="Remove" onClick={() => onRemoveIndicator(ind.id)}><Trash2 size={13} style={{ color: 'var(--negative-red)' }} /></Mini>
          </Row>
        ))}

        <Head n={draw.length}>Drawings</Head>
        {draw.length === 0 && none('No drawings yet.')}
        {[...draw].reverse().map(d => (
          <Row key={d.id} icon={PenLine} color={d.style?.color} selected={selectedId === d.id} onClick={() => onSelect(d.id)}
               title={TOOLS[d.type]?.label || d.type} sub={d.text || d.emoji || (d.points[0] ? Number(d.points[0].price).toFixed(digits) : '')}>
            <Mini title={d.visible === false ? 'Show' : 'Hide'} onClick={() => onChangeDrawing({ ...d, visible: d.visible === false })}>{d.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}</Mini>
            <Mini title={d.locked ? 'Unlock' : 'Lock'} onClick={() => onChangeDrawing({ ...d, locked: !d.locked })}>{d.locked ? <Lock size={13} /> : <Unlock size={13} />}</Mini>
            <Mini title="Delete" onClick={() => onDeleteDrawing(d.id)}><Trash2 size={13} style={{ color: 'var(--negative-red)' }} /></Mini>
          </Row>
        ))}

        <Head n={alerts.length}>Alerts</Head>
        {alerts.length === 0 && none('Right-click the chart to add one.')}
        {alerts.map(d => (
          <Row key={d.id} icon={Bell} color={d.active === false ? '#6B7280' : '#E11D48'} selected={selectedId === d.id} onClick={() => onSelect(d.id)}
               title={`${Number(d.points[0].price).toFixed(digits)}`} sub={d.active === false ? 'Triggered' : 'Active'}>
            <Mini title="Delete" onClick={() => onDeleteDrawing(d.id)}><Trash2 size={13} style={{ color: 'var(--negative-red)' }} /></Mini>
          </Row>
        ))}
      </div>
    </div>
  )
}