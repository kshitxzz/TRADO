import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, PenLine, Star, Trash2 } from 'lucide-react';
import { Icon } from './icons';
import { EMOJIS, MENU, TOOLS } from './tools';

const GROUP_ORDER = [
  { id: 'cursors', tip: 'Cursors', def: 'cross' },
  { id: 'lines', tip: 'Trend line tools', def: 'trendline' },
  { id: 'fib', tip: 'Fib & channels', def: 'fib' },
  { id: 'forecast', tip: 'Forecasting and measurers', def: 'long' },
  { id: 'shapes', tip: 'Brushes, arrows & shapes', def: 'rect' },
];

/** TradingView-style vertical drawing toolbar with grouped flyouts. */
export default function DrawingToolbar({ tool, setTool, settings, setSettings, onRemoveAll, emoji, setEmoji, hasDrawings }) {
  const [open, setOpen] = useState(null);                // group id with open flyout
  const [last, setLast] = useState({ cursors: 'cross', lines: 'trendline', fib: 'fib', forecast: 'long', shapes: 'rect' });
  const [fav, setFav] = useState(['rect', 'long', 'short', 'trendline']);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const esc = (e) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, []);

  const pickTool = (g, id) => { setLast((l) => ({ ...l, [g]: id })); setTool(id); setSettings((s) => ({ ...s, cursorType: s.cursorType })); setOpen(null); };
  const pickCursor = (id) => { setLast((l) => ({ ...l, cursors: id })); setSettings((s) => ({ ...s, cursorType: id })); setTool('cursor'); setOpen(null); };
  const groupActive = (g) => (g === 'cursors' ? tool === 'cursor' : MENU[g].some((sec) => sec.items.includes(tool)));
  const groupIcon = (g) => (g === 'cursors' ? settings.cursorType : last[g]);

  const Btn = ({ id, active, tip, onClick, children, caret, onCaret, danger }) => (
    <div className="td-btnwrap">
      <button type="button" className={`td-btn td-tip ${active ? 'is-active' : ''} ${danger ? 'is-danger' : ''}`} data-tip={tip} onClick={onClick} aria-label={tip}>{children}</button>
      {caret && <button type="button" className="td-caret" aria-label={`${tip} options`} onClick={onCaret}><svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 1.5 5 4 2 6.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
    </div>
  );

  const flyout = (g) => (
    <div className="td-flyout" role="menu">
      {MENU[g].map((sec, si) => (
        <div key={si}>
          {sec.section && <div className="td-flyout-h">{sec.section}</div>}
          {sec.items.map((it) => {
            const id = typeof it === 'string' ? it : it.id; const label = typeof it === 'string' ? TOOLS[id].label : it.label;
            const on = g === 'cursors' ? settings.cursorType === id && tool === 'cursor' : tool === id;
            return (
              <React.Fragment key={id}>
                {it.divider && <div className="td-flyout-sep" />}
                <div className={`td-fi ${on ? 'is-on' : ''}`} role="menuitem" onClick={() => (g === 'cursors' ? pickCursor(id) : pickTool(g, id))}>
                  <span className="td-fi-ic"><Icon id={id} size={20} /></span><span className="td-fi-l">{label}</span>
                  {g !== 'cursors' && <button type="button" className={`td-star ${fav.includes(id) ? 'on' : ''}`} aria-label="Favorite" onClick={(e) => { e.stopPropagation(); setFav((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])); }}><Star size={14} fill={fav.includes(id) ? 'currentColor' : 'none'} /></button>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ))}
      {g === 'cursors' && (
        <div className="td-fi td-fi-toggle" onClick={() => setSettings((s) => ({ ...s, valuesTooltip: !s.valuesTooltip }))}>
          <span className="td-fi-l">Values tooltip on long press</span><span className={`td-switch ${settings.valuesTooltip ? 'on' : ''}`}><i /></span>
        </div>
      )}
    </div>
  );

  return (
    <div className="td-toolbar" ref={ref}>
      {GROUP_ORDER.map((g) => (
        <div key={g.id} className="td-group">
          <Btn active={groupActive(g.id)} tip={g.tip} caret onCaret={() => setOpen(open === g.id ? null : g.id)}
            onClick={() => { if (g.id === 'cursors') { setTool('cursor'); } else setTool(last[g.id]); setOpen(null); }}>
            <Icon id={groupIcon(g.id)} />
          </Btn>
          {open === g.id && flyout(g.id)}
        </div>
      ))}
      <Btn active={tool === 'text'} tip="Text" onClick={() => setTool('text')}><Icon id="text" /></Btn>
      <div className="td-group">
        <Btn active={tool === 'emoji'} tip="Emojis & icons" caret onCaret={() => setOpen(open === 'emoji' ? null : 'emoji')} onClick={() => setTool('emoji')}><span className="td-emoji-btn">{emoji}</span></Btn>
        {open === 'emoji' && (<div className="td-flyout td-emoji-grid">{EMOJIS.map((e) => <button key={e} type="button" className={e === emoji ? 'on' : ''} onClick={() => { setEmoji(e); setTool('emoji'); setOpen(null); }}>{e}</button>)}</div>)}
      </div>
      <div className="td-sep" />
      <Btn active={tool === 'measure'} tip="Measure" onClick={() => setTool('measure')}><Icon id="measure" /></Btn>
      <Btn active={tool === 'zoom'} tip="Zoom in" onClick={() => setTool('zoom')}><Icon id="zoom" /></Btn>
      <div className="td-sep" />
      <div className="td-group">
        <Btn active={settings.magnet !== 'off'} tip={settings.magnet === 'off' ? 'Magnet mode: off' : `Magnet mode: ${settings.magnet}`} caret onCaret={() => setOpen(open === 'magnet' ? null : 'magnet')}
          onClick={() => setSettings((s) => ({ ...s, magnet: s.magnet === 'off' ? 'weak' : 'off' }))}><Icon id="magnet" /></Btn>
        {open === 'magnet' && (<div className="td-flyout td-small">{['weak', 'strong'].map((m) => (<div key={m} className={`td-fi ${settings.magnet === m ? 'is-on' : ''}`} onClick={() => { setSettings((s) => ({ ...s, magnet: m })); setOpen(null); }}><span className="td-fi-l">{m === 'weak' ? 'Weak magnet' : 'Strong magnet'}</span></div>))}</div>)}
      </div>
      <Btn active={settings.stayInDrawing} tip="Stay in drawing mode" onClick={() => setSettings((s) => ({ ...s, stayInDrawing: !s.stayInDrawing }))}><PenLine size={22} strokeWidth={1.5} /></Btn>
      <Btn active={settings.lockAll} tip={settings.lockAll ? 'Unlock all drawings' : 'Lock all drawings'} onClick={() => setSettings((s) => ({ ...s, lockAll: !s.lockAll }))}>{settings.lockAll ? <Lock size={22} strokeWidth={1.5} /> : <LockOpen size={22} strokeWidth={1.5} />}</Btn>
      <Btn active={settings.hideAll} tip={settings.hideAll ? 'Show all drawings' : 'Hide all drawings'} onClick={() => setSettings((s) => ({ ...s, hideAll: !s.hideAll }))}>{settings.hideAll ? <EyeOff size={22} strokeWidth={1.5} /> : <Eye size={22} strokeWidth={1.5} />}</Btn>
      <div className="td-sep" />
      <Btn tip="Remove drawings" danger onClick={() => hasDrawings && onRemoveAll()}><Trash2 size={22} strokeWidth={1.5} /></Btn>
    </div>
  );
}