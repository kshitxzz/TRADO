import React, { useMemo, useState } from 'react';
import { Bold, ChevronDown, Italic, Pencil, X } from 'lucide-react';
import { Check, ColorField, DualRange, NumInput, Popover, Select } from './ui';
import { TOOLS } from './tools';
import { decimals } from './shapes';

const LINE_TYPES = ['trendline', 'ray', 'extline', 'arrow'];
const SHAPES = ['rect', 'ellipse', 'circle', 'triangle'];
const toLocal = (t) => new Date(t * 1000).toISOString().slice(0, 16);
const fromLocal = (s) => Date.parse(s + ':00Z') / 1000;
const tplKey = (type) => 'trado.drawingTemplate.' + type;
const WIDTHS = [1, 2, 3, 4].map((v) => ({ v, l: `${v}px` }));
const DASHES = [{ v: 'solid', l: 'Line' }, { v: 'dashed', l: 'Dashed' }, { v: 'dotted', l: 'Dotted' }];

function tabsFor(type) {
  if (type === 'long' || type === 'short') return ['Inputs', 'Style', 'Visibility'];
  if (['brush', 'highlighter', 'emoji', 'path', 'polyline'].includes(type)) return ['Style', 'Coordinates', 'Visibility'].filter((t) => !(['brush', 'highlighter', 'emoji'].includes(type) && t === 'Coordinates'));
  if (type === 'text') return ['Text', 'Coordinates', 'Visibility'];
  if (['fib', 'channel', 'vline'].includes(type) || type.endsWith('Range')) return ['Style', 'Coordinates', 'Visibility'];
  return ['Style', 'Text', 'Coordinates', 'Visibility'];
}

export default function SettingsDialog({ drawing, store, A, onClose, containerRef }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(drawing)));
  const tabs = tabsFor(drawing.type);
  const [tab, setTab] = useState(tabs[0]);
  const [pos, setPos] = useState(null);
  const [tplOpen, setTplOpen] = useState(false);
  const def = TOOLS[drawing.type];
  const s = draft.style;
  const setS = (patch) => setDraft((d) => ({ ...d, style: { ...d.style, ...patch } }));
  const setPts = (pts) => setDraft((d) => ({ ...d, points: pts }));
  const dp = decimals(A), tick = A.tickSize || 0.00001;

  const startDrag = (e) => {
    if (e.target.closest('button')) return;
    const c = containerRef.current.getBoundingClientRect(), b = e.currentTarget.parentElement.getBoundingClientRect();
    const dx = e.clientX - b.left, dy = e.clientY - b.top;
    const mv = (ev) => setPos({ x: ev.clientX - c.left - dx, y: ev.clientY - c.top - dy });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const ok = () => { store.update(drawing.id, () => draft); onClose(); };
  const saveTpl = () => { try { localStorage.setItem(tplKey(drawing.type), JSON.stringify(s)); } catch { /* storage unavailable */ } setTplOpen(false); };
  const applyTpl = () => { try { const t = JSON.parse(localStorage.getItem(tplKey(drawing.type)) || 'null'); if (t) setS(t); else setS(JSON.parse(JSON.stringify(def.style))); } catch { setS(JSON.parse(JSON.stringify(def.style))); } setTplOpen(false); };

  const Row = ({ label, children, hint }) => <div className="td-row"><label>{label}</label><div className="td-ctl">{children}</div>{hint}</div>;
  const Sec = ({ children }) => <div className="td-sec">{children}</div>;

  /* ---------- tabs ---------- */
  const lineStyle = (key = 'color', withArrows) => (
    <Row label="Line"><ColorField value={s[key]} onChange={(c) => setS({ [key]: c })} withOpacity={false} />
      <Select value={s.width} options={WIDTHS} width={70} onChange={(v) => setS({ width: v })} />
      <Select value={s.dash} options={DASHES} width={86} onChange={(v) => setS({ dash: v })} />
      {withArrows && <><button type="button" className={`td-tog ${s.arrowStart ? 'on' : ''}`} aria-label="Arrow at start" onClick={() => setS({ arrowStart: !s.arrowStart })}>←</button>
        <button type="button" className={`td-tog ${s.arrowEnd ? 'on' : ''}`} aria-label="Arrow at end" onClick={() => setS({ arrowEnd: !s.arrowEnd })}>→</button></>}
    </Row>
  );
  const bgRow = (label = 'Background') => (
    <Row label=""><Check checked={s.showFill} onChange={(v) => setS({ showFill: v })} label={label} />
      <ColorField value={s.fill} opacity={s.fillOpacity} onChange={(c) => setS({ fill: c, showFill: true })} onOpacity={(a) => setS({ fillOpacity: a })} /></Row>
  );

  const StyleTab = () => {
    const t = drawing.type;
    if (LINE_TYPES.includes(t) || t === 'hline' || t === 'hray' || t === 'vline') return (<>
      {lineStyle('color', LINE_TYPES.includes(t))}
      {(LINE_TYPES.includes(t)) && <Row label="Extend"><Select value={s.extend} width={150} options={[{ v: 'none', l: "Don't extend" }, { v: 'left', l: 'Left' }, { v: 'right', l: 'Right' }, { v: 'both', l: 'Both' }]} onChange={(v) => setS({ extend: v })} /></Row>}
      {LINE_TYPES.includes(t) && <Row label=""><Check checked={s.middlePoint} onChange={(v) => setS({ middlePoint: v })} label="Middle point" /></Row>}
      {t !== 'vline' && <Row label=""><Check checked={s.priceLabels} onChange={(v) => setS({ priceLabels: v })} label="Price labels" /></Row>}
      {LINE_TYPES.includes(t) && <><Sec>INFO</Sec>
        <Row label="Stats"><Select value={s.stats} width={150} options={[{ v: 'hidden', l: 'Hidden' }, { v: 'compact', l: 'Compact' }, { v: 'values', l: 'Values' }]} onChange={(v) => setS({ stats: v })} /></Row>
        <Row label="Stats position"><Select value={s.statsPos} width={150} options={[{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }]} onChange={(v) => setS({ statsPos: v })} /></Row>
        <Row label=""><Check checked={s.alwaysStats} onChange={(v) => setS({ alwaysStats: v })} label="Always show stats" /></Row></>}
    </>);
    if (t === 'channel') return (<>{lineStyle()}<Row label="Extend"><Select value={s.extend} width={150} options={[{ v: 'none', l: "Don't extend" }, { v: 'left', l: 'Left' }, { v: 'right', l: 'Right' }, { v: 'both', l: 'Both' }]} onChange={(v) => setS({ extend: v })} /></Row>
      <Row label=""><Check checked={s.middleLine} onChange={(v) => setS({ middleLine: v })} label="Middle line" /></Row>{bgRow()}</>);
    if (t === 'fib') return (<>{lineStyle()}
      {(s.levels || []).map((l, i) => (<Row key={i} label=""><Check checked={l.on !== false} onChange={(v) => setS({ levels: s.levels.map((x, j) => (j === i ? { ...x, on: v } : x)) })} />
        <NumInput width={64} step={0.001} value={l.v} onChange={(v) => setS({ levels: s.levels.map((x, j) => (j === i ? { ...x, v } : x)) })} />
        <ColorField value={l.color} onChange={(c) => setS({ levels: s.levels.map((x, j) => (j === i ? { ...x, color: c } : x)) })} withOpacity={false} /></Row>))}
      <Row label=""><Check checked={s.showPrices} onChange={(v) => setS({ showPrices: v })} label="Prices" /></Row>
      <Row label=""><Check checked={s.showFill} onChange={(v) => setS({ showFill: v })} label="Background" /><NumInput width={64} step={0.05} min={0} max={1} value={s.fillOpacity} onChange={(v) => setS({ fillOpacity: v })} /></Row></>);
    if (SHAPES.includes(t)) return (<>{lineStyle()}{bgRow()}</>);
    if (t.endsWith('Range')) return (<><Row label="Background"><ColorField value={s.fill} opacity={s.fillOpacity} onChange={(c) => setS({ fill: c })} onOpacity={(a) => setS({ fillOpacity: a })} /></Row><Row label=""><Check checked={s.showFill !== false} onChange={(v) => setS({ showFill: v })} label="Show background" /></Row></>);
    if (t === 'polyline' || t === 'path') return (<>{lineStyle('color', true)}{bgRow()}</>);
    if (t === 'brush') return (<>{lineStyle('color', true)}{bgRow()}</>);
    if (t === 'highlighter') return (<><Row label="Line"><ColorField value={s.color} onChange={(c) => setS({ color: c })} withOpacity={false} /><Select value={s.width} width={80} options={[10, 15, 20, 30, 40].map((v) => ({ v, l: `${v}px` }))} onChange={(v) => setS({ width: v })} /></Row>
      <Row label="Opacity"><NumInput width={64} step={0.1} min={0.1} max={1} value={s.opacity} onChange={(v) => setS({ opacity: v })} /></Row></>);
    if (t === 'arrowUp' || t === 'arrowDown') return <Row label="Color"><ColorField value={s.color} onChange={(c) => setS({ color: c })} withOpacity={false} /></Row>;
    if (t === 'emoji') return <Row label="Size"><NumInput width={70} min={12} max={120} value={s.size} onChange={(v) => setS({ size: v })} /></Row>;
    if (t === 'long' || t === 'short') return (<>
      <Row label="Lines"><ColorField value={s.lineColor} onChange={(c) => setS({ lineColor: c })} withOpacity={false} /></Row>
      <Row label="Stop color"><ColorField value={s.stopColor} opacity={s.fillOpacity} onChange={(c) => setS({ stopColor: c })} onOpacity={(a) => setS({ fillOpacity: a })} /></Row>
      <Row label="Target color"><ColorField value={s.targetColor} opacity={s.fillOpacity} onChange={(c) => setS({ targetColor: c })} onOpacity={(a) => setS({ fillOpacity: a })} /></Row>
      <Row label="Text"><ColorField value={s.textColor} onChange={(c) => setS({ textColor: c })} withOpacity={false} /><Select value={s.fontSize} width={70} options={[10, 11, 12, 14, 16].map((v) => ({ v, l: String(v) }))} onChange={(v) => setS({ fontSize: v })} /></Row>
      <Row label=""><Check checked={s.priceLabels} onChange={(v) => setS({ priceLabels: v })} label="Price labels" /></Row>
      <Sec>INFO</Sec>
      <Row label="Stats"><Select value={s.stats} width={150} options={[{ v: 'values', l: 'Values' }, { v: 'hidden', l: 'Hidden' }]} onChange={(v) => setS({ stats: v })} /></Row>
      <Row label=""><Check checked={s.compact} onChange={(v) => setS({ compact: v })} label="Compact stats mode" /></Row>
      <Row label=""><Check checked={s.alwaysStats} onChange={(v) => setS({ alwaysStats: v })} label="Always show stats" /></Row></>);
    return null;
  };

  const TextTab = () => (<>
    <div className="td-textbar">
      <ColorField value={s.textColor} onChange={(c) => setS({ textColor: c })} withOpacity={false} />
      <Select value={s.fontSize} width={86} options={[10, 11, 12, 14, 16, 20, 24, 32].map((v) => ({ v, l: String(v) }))} onChange={(v) => setS({ fontSize: v })} />
      <button type="button" className={`td-tog sq ${s.bold ? 'on' : ''}`} aria-label="Bold" onClick={() => setS({ bold: !s.bold })}><Bold size={16} /></button>
      <button type="button" className={`td-tog sq ${s.italic ? 'on' : ''}`} aria-label="Italic" onClick={() => setS({ italic: !s.italic })}><Italic size={16} /></button>
    </div>
    <textarea className="td-textarea" placeholder="Add text" value={s.text || ''} autoFocus onChange={(e) => setS({ text: e.target.value })} />
    {drawing.type !== 'text' && <Row label="Text alignment"><Select value={s.vAlign} width={92} options={[{ v: 'top', l: 'Top' }, { v: 'middle', l: 'Middle' }, { v: 'bottom', l: 'Bottom' }]} onChange={(v) => setS({ vAlign: v })} />
      <Select value={s.hAlign} width={92} options={[{ v: 'left', l: 'Left' }, { v: 'center', l: 'Center' }, { v: 'right', l: 'Right' }]} onChange={(v) => setS({ hAlign: v })} /></Row>}
    {drawing.type === 'text' && <><Row label=""><Check checked={s.showBg} onChange={(v) => setS({ showBg: v })} label="Background" /><ColorField value={s.bg} onChange={(c) => setS({ bg: c, showBg: true })} withOpacity={false} /></Row>
      <Row label=""><Check checked={s.showBorder} onChange={(v) => setS({ showBorder: v })} label="Border" /><ColorField value={s.color} onChange={(c) => setS({ color: c, showBorder: true })} withOpacity={false} /></Row></>}
  </>);

  const CoordTab = () => (<>
    {draft.points.map((p, i) => (
      <div key={i} className="td-coord">
        <div className="td-coord-h">{draft.points.length > 1 ? `Point ${i + 1}` : 'Point'}</div>
        <Row label="Price"><NumInput width={120} step={tick} value={+p.p.toFixed(dp)} onChange={(v) => v !== '' && setPts(draft.points.map((q, j) => (j === i ? { ...q, p: v } : q)))} /></Row>
        <Row label="Time (UTC)"><input className="td-input" type="datetime-local" value={toLocal(p.t)} onChange={(e) => { const t = fromLocal(e.target.value); if (!isNaN(t)) setPts(draft.points.map((q, j) => (j === i ? { ...q, t } : q))); }} style={{ width: 190 }} /></Row>
      </div>))}
  </>);

  const InputsTab = () => {
    const isLong = drawing.type === 'long', [e, tg, st] = draft.points.map((p) => p.p);
    const setLvl = (which, price) => setPts(draft.points.map((q, j) => (j === (which === 'target' ? 1 : 2) ? { ...q, p: price } : q)));
    const entryChange = (v) => { if (v === '') return; const dv = v - e; setPts(draft.points.map((q) => ({ ...q, p: q.p + dv }))); };
    const tgTicks = Math.round(Math.abs(tg - e) / tick), stTicks = Math.round(Math.abs(e - st) / tick);
    const sign = (which) => (which === 'target' ? (isLong ? 1 : -1) : (isLong ? -1 : 1));
    return (<div className="td-scroll">
      <Row label="Account size"><NumInput width={90} value={s.accountSize} onChange={(v) => setS({ accountSize: v })} /><Select value="default" width={86} options={[{ v: 'default', l: 'Default' }]} onChange={() => {}} /></Row>
      <Row label="Lot size"><NumInput width={90} value={s.lotSize} onChange={(v) => setS({ lotSize: v })} /></Row>
      <Row label="Risk"><NumInput width={90} step={0.1} value={s.risk} onChange={(v) => setS({ risk: v })} /><Select value={s.riskUnit} width={60} options={[{ v: '%', l: '%' }, { v: 'cash', l: '$' }]} onChange={(v) => setS({ riskUnit: v })} /></Row>
      <Row label="Entry price"><NumInput width={110} step={tick} value={+e.toFixed(dp)} onChange={entryChange} /></Row>
      <Row label="Leverage"><NumInput width={110} value={s.leverage} onChange={(v) => setS({ leverage: v })} /></Row>
      <Sec>PROFIT LEVEL</Sec>
      <Row label="Ticks"><NumInput width={110} value={tgTicks} onChange={(v) => v !== '' && setLvl('target', e + sign('target') * v * tick)} /></Row>
      <Row label="Price"><NumInput width={110} step={tick} value={+tg.toFixed(dp)} onChange={(v) => v !== '' && setLvl('target', v)} /></Row>
      <Sec>STOP LEVEL</Sec>
      <Row label="Ticks"><NumInput width={110} value={stTicks} onChange={(v) => v !== '' && setLvl('stop', e + sign('stop') * v * tick)} /></Row>
      <Row label="Price"><NumInput width={110} step={tick} value={+st.toFixed(dp)} onChange={(v) => v !== '' && setLvl('stop', v)} /></Row>
      <Row label="QTY precision"><Select value={s.qtyPrecision} width={110} up options={[{ v: 'default', l: 'Default' }, { v: '0', l: '0' }, { v: '1', l: '1' }, { v: '2', l: '2' }]} onChange={(v) => setS({ qtyPrecision: v })} /></Row>
    </div>);
  };

  const UNITS = [['seconds', 'Seconds', 59], ['minutes', 'Minutes', 59], ['hours', 'Hours', 24], ['days', 'Days', 366], ['weeks', 'Weeks', 52], ['months', 'Months', 12]];
  const VisTab = () => {
    const v = draft.visibility; const setV = (k, val) => setDraft((d) => ({ ...d, visibility: { ...d.visibility, [k]: val } }));
    return (<div className="td-vis">
      <Check checked={v.ticks} onChange={(x) => setV('ticks', x)} label="Ticks" />
      {UNITS.map(([k, label, max]) => (
        <div key={k} className="td-vis-row">
          <Check checked={v[k][2]} onChange={(x) => setV(k, [v[k][0], v[k][1], x])} label={label} />
          <NumInput width={62} min={1} max={max} value={v[k][0]} onChange={(n) => n !== '' && setV(k, [Math.min(Math.max(1, n), v[k][1]), v[k][1], v[k][2]])} />
          <DualRange min={1} max={max} lo={v[k][0]} hi={v[k][1]} onChange={(lo, hi) => setV(k, [lo, hi, v[k][2]])} />
          <NumInput width={62} min={1} max={max} value={v[k][1]} onChange={(n) => n !== '' && setV(k, [v[k][0], Math.min(Math.max(v[k][0], n), max), v[k][2]])} />
        </div>))}
      <Check checked={v.ranges} onChange={(x) => setV('ranges', x)} label="Ranges" />
    </div>);
  };

  const body = tab === 'Style' ? <StyleTab /> : tab === 'Text' ? <TextTab /> : tab === 'Coordinates' ? <CoordTab /> : tab === 'Inputs' ? <InputsTab /> : <VisTab />;
  const style = pos ? { left: pos.x, top: pos.y } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
  const idx = tabs.indexOf(tab);

  return (
    <div className="td-dialog-wrap" onPointerDown={(e) => e.stopPropagation()}>
      <div className="td-dialog" role="dialog" aria-label={`${def.title} settings`} style={style}>
        <div className="td-dialog-head" onPointerDown={startDrag}><h3>{def.title}</h3><Pencil size={14} className="td-ic-muted" />
          <button type="button" className="td-x" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
        <div className="td-tabs"><div className="td-tabs-row">{tabs.map((t) => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
          <i className="td-tabs-line"><b style={{ left: `${(idx / tabs.length) * 100}%`, width: `${100 / tabs.length}%` }} /></i></div>
        <div className="td-body">{body}</div>
        <div className="td-foot">
          <span className="td-tplwrap"><button type="button" className="td-tpl" onClick={() => setTplOpen((o) => !o)}>Template <ChevronDown size={14} /></button>
            {tplOpen && <Popover onClose={() => setTplOpen(false)} className="td-menu up" style={{ bottom: 38, left: 0 }}><div className="td-mi" onClick={saveTpl}>Save as default</div><div className="td-mi" onClick={applyTpl}>Apply default</div></Popover>}</span>
          <span className="grow" />
          <button type="button" className="td-btn-o" onClick={onClose}>Cancel</button><button type="button" className="td-btn-w" onClick={ok}>Ok</button>
        </div>
      </div>
    </div>
  );
}