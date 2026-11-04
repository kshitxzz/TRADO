import React, { useRef, useState } from 'react';
import { Bold, Ellipsis, Italic, Lock, LockOpen, Pencil, PaintBucket, Trash2, Type } from 'lucide-react';
import { ColorPicker, Popover, Select } from './ui';
import { dashArray } from './tools';

const Grip = () => <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="3" r="1" /><circle cx="2" cy="8" r="1" /><circle cx="2" cy="13" r="1" /><circle cx="7" cy="3" r="1" /><circle cx="7" cy="8" r="1" /><circle cx="7" cy="13" r="1" /></svg>;
const TemplateIc = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><path d="M17 14v6M14 17h6" /></svg>;
const GearIc = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z" /><circle cx="12" cy="12" r="3" /></svg>;

const LINE_TYPES = ['trendline', 'ray', 'extline', 'arrow', 'hline', 'hray', 'vline', 'channel', 'fib'];
const SHAPE_TYPES = ['rect', 'ellipse', 'circle', 'triangle', 'polyline', 'priceRange', 'dateRange', 'dateAndPriceRange'];

/** Contextual toolbar shown above the selected drawing (draggable, like TradingView). */
export default function FloatingToolbar({ drawing: d, store, onOpenSettings, onApplyTemplate, containerRef, settings }) {
  const [pos, setPos] = useState(null);
  const [pop, setPop] = useState(null);
  const bar = useRef(null);
  const s = d.style;
  const set = (patch) => store.update(d.id, (o) => ({ ...o, style: { ...o.style, ...patch } }));
  const isPos = d.type === 'long' || d.type === 'short';
  const hasText = [...LINE_TYPES.filter((t) => !['vline', 'fib', 'channel'].includes(t)), ...SHAPE_TYPES].includes(d.type) || d.type === 'text';

  const startDrag = (e) => {
    e.preventDefault();
    const c = containerRef.current.getBoundingClientRect(), b = bar.current.getBoundingClientRect();
    const dx = e.clientX - b.left, dy = e.clientY - b.top;
    const mv = (ev) => setPos({ x: Math.min(Math.max(0, ev.clientX - c.left - dx), c.width - b.width), y: Math.min(Math.max(0, ev.clientY - c.top - dy), c.height - b.height) });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const B = ({ id, tip, children, onClick, active, bar: colorBar, style }) => (
    <span className="td-fbwrap">
      <button type="button" className={`td-fb td-tip ${active || pop === id ? 'is-active' : ''}`} data-tip={tip} aria-label={tip} style={style} onClick={onClick || (() => setPop(pop === id ? null : id))}>
        {children}{colorBar && <i className="td-fb-bar" style={{ background: colorBar }} />}
      </button>
    </span>
  );
  const colorPop = (id, key, opKey, opts = {}) => pop === id && (
    <ColorPicker value={s[key]} opacity={opKey ? s[opKey] : undefined} onChange={(c) => set({ [key]: c, ...(opts.also || {}) })} onOpacity={opKey ? (a) => set({ [opKey]: a }) : undefined} onClose={() => setPop(null)} style={{ top: 40, left: 0 }} />
  );
  const lineSample = (w, dash) => <svg width="46" height="12"><line x1="2" y1="6" x2="44" y2="6" stroke="currentColor" strokeWidth={w} strokeDasharray={dashArray(dash, w)} strokeLinecap="round" /></svg>;
  const ws = s.width ?? 1;

  const items = [];
  items.push(<span key="tpl" className="td-fbwrap"><B id="tpl" tip="Templates"><TemplateIc /></B>
    {pop === 'tpl' && <Popover onClose={() => setPop(null)} className="td-menu" style={{ top: 40, left: 0 }}>
      <div className="td-mi" onClick={() => { onApplyTemplate('save'); setPop(null); }}>Save drawing template as…</div>
      <div className="td-mi" onClick={() => { onApplyTemplate('apply'); setPop(null); }}>Apply default template</div></Popover>}</span>);

  if (d.type === 'text') {
    items.push(<span key="tc" className="td-fbwrap"><B id="tc" tip="Text color" bar={s.textColor}><Type size={22} strokeWidth={1.5} /></B>{colorPop('tc', 'textColor')}</span>);
    items.push(<Select key="fs" className="td-fs" value={s.fontSize} width={62} options={[10, 12, 14, 16, 20, 24, 32, 40].map((v) => ({ v, l: String(v) }))} onChange={(v) => set({ fontSize: v })} />);
    items.push(<B key="b" id="b" tip="Bold" active={s.bold} onClick={() => set({ bold: !s.bold })}><Bold size={20} strokeWidth={2} /></B>);
    items.push(<B key="i" id="i" tip="Italic" active={s.italic} onClick={() => set({ italic: !s.italic })}><Italic size={20} strokeWidth={1.8} /></B>);
  } else if (isPos) {
    items.push(<span key="tc" className="td-fbwrap"><B id="tc" tip="Text color" bar={s.textColor}><Type size={22} strokeWidth={1.5} /></B>{colorPop('tc', 'textColor')}</span>);
    items.push(<span key="tg" className="td-fbwrap"><B id="tg" tip="Target color" bar={s.targetColor}><PaintBucket size={22} strokeWidth={1.5} /></B>{colorPop('tg', 'targetColor', 'fillOpacity')}</span>);
    items.push(<span key="st" className="td-fbwrap"><B id="st" tip="Stop color" bar={s.stopColor}><PaintBucket size={22} strokeWidth={1.5} /></B>{colorPop('st', 'stopColor', 'fillOpacity')}</span>);
  } else {
    items.push(<span key="lc" className="td-fbwrap"><B id="lc" tip="Line tool colors" bar={s.color}><Pencil size={22} strokeWidth={1.5} /></B>{colorPop('lc', 'color', d.type === 'highlighter' ? 'opacity' : null)}</span>);
    if (SHAPE_TYPES.includes(d.type) || d.type === 'polyline' || d.type === 'brush' || d.type === 'channel' || d.type === 'fib')
      if (d.type !== 'brush' && !d.type.endsWith('Range')) items.push(<span key="fc" className="td-fbwrap"><B id="fc" tip="Background color" bar={s.fill}><PaintBucket size={22} strokeWidth={1.5} /></B>{colorPop('fc', 'fill', 'fillOpacity', { also: { showFill: true } })}</span>);
    if (hasText && d.type !== 'text') items.push(<span key="tc" className="td-fbwrap"><B id="tc" tip="Text color" bar={s.textColor}><Type size={22} strokeWidth={1.5} /></B>{colorPop('tc', 'textColor')}</span>);
    if (!['arrowUp', 'arrowDown', 'emoji', 'fib'].includes(d.type)) {
      items.push(<span key="w" className="td-fbwrap"><button type="button" className={`td-fb td-fb-wide td-tip ${pop === 'w' ? 'is-active' : ''}`} data-tip="Line width" onClick={() => setPop(pop === 'w' ? null : 'w')}>{lineSample(Math.min(ws, 4), 'solid')}<b>{ws}px</b></button>
        {pop === 'w' && <Popover onClose={() => setPop(null)} className="td-menu" style={{ top: 40, left: 0 }}>{[1, 2, 3, 4].map((v) => <div key={v} className={`td-mi ${ws === v ? 'on' : ''}`} onClick={() => { set({ width: v }); setPop(null); }}>{lineSample(v, 'solid')}<span>{v}px</span></div>)}</Popover>}</span>);
      items.push(<span key="ds" className="td-fbwrap"><button type="button" className={`td-fb td-tip ${pop === 'ds' ? 'is-active' : ''}`} data-tip="Line style" style={{ width: 54 }} onClick={() => setPop(pop === 'ds' ? null : 'ds')}>{lineSample(1.5, s.dash)}</button>
        {pop === 'ds' && <Popover onClose={() => setPop(null)} className="td-menu" style={{ top: 40, left: 0 }}>{[['solid', 'Line'], ['dashed', 'Dashed line'], ['dotted', 'Dotted line']].map(([v, l]) => <div key={v} className={`td-mi ${s.dash === v ? 'on' : ''}`} onClick={() => { set({ dash: v }); setPop(null); }}>{lineSample(1.5, v)}<span>{l}</span></div>)}</Popover>}</span>);
    }
  }

  items.push(<B key="set" id="set" tip="Settings" onClick={() => onOpenSettings(d.id)}><GearIc /></B>);
  items.push(<B key="lock" id="lock" tip={d.locked ? 'Unlock' : 'Lock'} active={d.locked} onClick={() => store.update(d.id, { locked: !d.locked })}>{d.locked ? <Lock size={22} strokeWidth={1.5} /> : <LockOpen size={22} strokeWidth={1.5} />}</B>);
  items.push(<B key="del" id="del" tip="Remove" onClick={() => store.remove(d.id)}><Trash2 size={22} strokeWidth={1.5} /></B>);
  items.push(<span key="more" className="td-fbwrap"><B id="more" tip="More"><Ellipsis size={22} strokeWidth={1.5} /></B>
    {pop === 'more' && <Popover onClose={() => setPop(null)} className="td-menu td-menu-right" style={{ top: 40, right: 0 }}>
      <div className="td-mi" onClick={() => { store.clone(d.id); setPop(null); }}>Clone</div>
      <div className="td-mi" onClick={() => { store.bringToFront(d.id); setPop(null); }}>Bring to front</div>
      <div className="td-mi" onClick={() => { store.sendToBack(d.id); setPop(null); }}>Send to back</div>
      <div className="td-mi" onClick={() => { store.update(d.id, { hidden: true }); store.setSelectedId(null); setPop(null); }}>Hide</div></Popover>}</span>);

  const style = pos ? { left: pos.x, top: pos.y } : { left: '50%', top: 12, transform: 'translateX(-50%)' };
  return (
    <div ref={bar} className="td-floating" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <span className="td-grip" onPointerDown={startDrag} aria-label="Drag toolbar"><Grip /></span>
      {items}
    </div>
  );
}