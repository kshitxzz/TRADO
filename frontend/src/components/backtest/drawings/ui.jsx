import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

/* ---------- palette (TradingView layout: greys, saturated row, tints, shades) ---------- */
const GREYS = ['#FFFFFF', '#D1D4DC', '#B2B5BE', '#9598A1', '#787B86', '#5D606B', '#434651', '#2A2E39', '#131722', '#000000'];
const HUES = ['#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#089981', '#00BCD4', '#2962FF', '#673AB7', '#9C27B0', '#E91E63'];
const mix = (hex, to, a) => { const n = parseInt(hex.slice(1), 16), m = to === 'w' ? 255 : 0; const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (m - v) * a)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
const ROWS = [HUES, ...[0.85, 0.7, 0.55, 0.4].map((a) => HUES.map((h) => mix(h, 'w', a))), ...[0.2, 0.4, 0.6].map((a) => HUES.map((h) => mix(h, 'k', a)))];
const recent = { list: ['#FFFFFF', '#2962FF', '#E91E63', '#D1D4DC', '#4C525E'] };

/** Click-outside wrapper */
export function Popover({ onClose, children, className = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const k = (e) => e.key === 'Escape' && onClose?.();
    setTimeout(() => window.addEventListener('pointerdown', h), 0); window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', k); };
  }, [onClose]);
  return <div ref={ref} className={`td-pop ${className}`} style={style}>{children}</div>;
}

export function ColorPicker({ value, opacity, onChange, onOpacity, onClose, style }) {
  const [custom, setCustom] = useState(recent.list);
  const pick = (c) => { onChange(c); if (!custom.includes(c)) { recent.list = [c, ...custom].slice(0, 7); setCustom(recent.list); } };
  const nat = useRef(null);
  const sw = (c, i) => <button key={c + i} type="button" className={`td-sw ${value?.toUpperCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => pick(c)} />;
  return (
    <Popover onClose={onClose} className="td-colorpop" style={style}>
      <div className="td-sw-row">{GREYS.map(sw)}</div>
      <div className="td-sw-gap" />
      {ROWS.map((r, i) => <div key={i} className="td-sw-row">{r.map(sw)}</div>)}
      <div className="td-sw-gap" />
      <div className="td-sw-row td-sw-custom">
        {custom.map(sw)}
        <button type="button" className="td-sw td-sw-add" aria-label="Custom color" onClick={() => nat.current?.click()}><Plus size={14} /></button>
        <input ref={nat} type="color" value={(value || '#2962FF').slice(0, 7)} onChange={(e) => pick(e.target.value.toUpperCase())} className="td-hidden-color" />
      </div>
      {onOpacity && (<>
        <div className="td-pop-label">Opacity</div>
        <div className="td-opacity">
          <input type="range" min={0} max={100} value={Math.round((opacity ?? 1) * 100)} onChange={(e) => onOpacity(+e.target.value / 100)} style={{ '--c': value, '--v': `${Math.round((opacity ?? 1) * 100)}%` }} />
          <span className="td-opacity-v">{Math.round((opacity ?? 1) * 100)}%</span>
        </div>
      </>)}
    </Popover>
  );
}

/** Colour swatch button + popover (used inside the dialog) */
export function ColorField({ value, opacity, onChange, onOpacity, withOpacity = true }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="td-colorfield">
      <button type="button" className="td-colorbtn" onClick={() => setOpen((o) => !o)} aria-label="Choose color"><i style={{ background: value, opacity: opacity ?? 1 }} /></button>
      {open && <ColorPicker value={value} opacity={opacity} onChange={onChange} onOpacity={withOpacity ? onOpacity : undefined} onClose={() => setOpen(false)} />}
    </span>
  );
}

/** Fully custom dropdown (no native <select>, so OS chrome never bleeds through the dark theme) */
export function Select({ value, options, onChange, width, up, className = '' }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.v === value) || options[0];
  return (
    <span className={`td-select ${className}`} style={{ width }}>
      <button type="button" className="td-select-btn" onClick={() => setOpen((o) => !o)}><span>{cur.l}</span><ChevronDown size={14} /></button>
      {open && (<Popover onClose={() => setOpen(false)} className={`td-select-list ${up ? 'up' : ''}`}>
        {options.map((o) => <div key={String(o.v)} className={`td-opt ${o.v === value ? 'on' : ''}`} onClick={() => { onChange(o.v); setOpen(false); }}>{o.l}</div>)}
      </Popover>)}
    </span>
  );
}

export const Check = ({ checked, onChange, label, disabled }) => (
  <label className={`td-check ${disabled ? 'dis' : ''}`}><input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span className="box" />{label && <span className="lbl">{label}</span>}</label>
);

export const NumInput = ({ value, onChange, step, min, max, width }) => (
  <input className="td-input" type="number" value={value} step={step} min={min} max={max} style={{ width }} onChange={(e) => onChange(e.target.value === '' ? '' : +e.target.value)} />
);

export function DualRange({ min, max, lo, hi, onChange }) {
  const pct = (v) => ((v - min) / (max - min)) * 100;
  return (
    <span className="td-dual">
      <i className="trk" /><i className="fill" style={{ left: pct(lo) + '%', width: pct(hi) - pct(lo) + '%' }} />
      <input type="range" min={min} max={max} value={lo} onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)} />
      <input type="range" min={min} max={max} value={hi} onChange={(e) => onChange(lo, Math.max(+e.target.value, lo))} />
    </span>
  );
}