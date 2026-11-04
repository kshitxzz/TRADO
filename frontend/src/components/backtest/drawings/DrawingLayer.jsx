import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { simplify } from './geometry';
import { dragHandle, newPosition, PriceChip, renderShape, TimeChip } from './shapes';
import { TOOLS } from './tools';
import { visibleOnTf } from './visibility';

const FONT = '"Trebuchet MS", Roboto, -apple-system, sans-serif';
const isTyping = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };

/**
 * Overlay that renders + edits drawings on top of any chart.
 * adapter: see chartAdapter.js. Re-renders whenever `viewKey` changes (pan / zoom / resize).
 */
export default function DrawingLayer({ adapter: A, viewKey, store, tool, setTool, settings, onOpenSettings, onZoomTo, theme = {}, emoji = '😀', onContextMenu }) {
  const uid = useId().replace(/:/g, '');
  const rootRef = useRef(null);
  const { drawings, selectedId, setSelectedId } = store;
  const [hover, setHover] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [draft, setDraft] = useState(null);          // in-progress drawing { type, points }
  const [ghost, setGhost] = useState(null);          // finished transient measure
  const [editing, setEditing] = useState(null);      // inline text editor { id }
  const gesture = useRef(null);
  const draftRef = useRef(null);
  const bg = theme.bg || '#131722';
  const active = tool !== 'cursor';
  const eraser = !active && settings.cursorType === 'eraser';

  const setDraftBoth = (d) => { draftRef.current = d; setDraft(d); };
  const px = useCallback((e) => { const r = rootRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }, []);

  /* ----- coordinate helpers (with magnet + bar-snapped time) ----- */
  const toPoint = useCallback((p, magnetOverride) => {
    let t = A.xToTime(p.x), pr = A.yToPrice(p.y);
    const bar = A.snapBar?.(t);
    if (bar) t = bar.t; else if (A.snapTime) t = A.snapTime(t);
    const mode = magnetOverride ?? settings.magnet;
    if (bar && mode && mode !== 'off') {
      const cands = [bar.o, bar.h, bar.l, bar.c].filter((v) => v != null);
      let best = null, bd = Infinity;
      for (const c of cands) { const dd = Math.abs(A.priceToY(c) - p.y); if (dd < bd) { bd = dd; best = c; } }
      if (best != null && (mode === 'strong' || bd < 24)) pr = best;
    }
    return { t, p: pr };
  }, [A, settings.magnet]);

  /* ----- visible drawings ----- */
  const visible = useMemo(() => (settings.hideAll ? [] : drawings.filter((d) => !d.hidden && visibleOnTf(d, A.timeframeSeconds))), [drawings, settings.hideAll, A.timeframeSeconds]);

  /* ----- create flow ----- */
  const finalize = useCallback((dr) => {
    const def = TOOLS[dr.type]; let pts = dr.points;
    if (def.pts === 'poly') pts = pts.slice(0, -1);
    if (def.pts === 'free') { const sp = simplify(pts.map((q) => ({ x: A.timeToX(q.t), y: A.priceToY(q.p) })), 1.2); pts = sp.map((q) => ({ t: A.xToTime(q.x), p: A.yToPrice(q.y) })); if (pts.length < 2) { setDraftBoth(null); return; } }
    if (def.pts === 'poly' && pts.length < 2) { setDraftBoth(null); return; }
    setDraftBoth(null);
    if (dr.type === 'zoom') { onZoomTo?.({ t1: pts[0].t, t2: pts[1].t, p1: pts[0].p, p2: pts[1].p }); setTool('cursor'); return; }
    if (def.transient) { setGhost({ type: dr.type, points: pts }); setTool('cursor'); return; }
    const d = store.create(dr.type, pts);
    if (dr.type === 'emoji') d.style.emoji = emoji;
    store.add(d);
    if (dr.type === 'text') setEditing({ id: d.id });
    if (!settings.stayInDrawing) setTool('cursor');
  }, [A, emoji, onZoomTo, setTool, settings.stayInDrawing, store]);

  const onCaptureDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    setGhost(null); setSelectedId(null);
    const p = px(e), pt = toPoint(p), def = TOOLS[tool]; if (!def) return;
    const dr = draftRef.current;
    if (def.pts === 1) {
      if (tool === 'long' || tool === 'short') return finalize({ type: tool, points: newPosition(tool, A, pt, p) });
      return finalize({ type: tool, points: [pt] });
    }
    if (def.pts === 'free') { gesture.current = { kind: 'draw' }; return setDraftBoth({ type: tool, points: [pt] }); }
    if (def.pts === 'poly') {
      if (!dr) return setDraftBoth({ type: tool, points: [pt, pt] });
      const prev = dr.points[dr.points.length - 2];
      if (prev && Math.hypot(A.timeToX(prev.t) - p.x, A.priceToY(prev.p) - p.y) < 6) return finalize(dr); // click on last point ends
      return setDraftBoth({ ...dr, points: [...dr.points.slice(0, -1), pt, pt] });
    }
    // fixed-count tools: click-click or press-drag-release
    if (!dr) { gesture.current = { kind: 'press', start: p, moved: false }; return setDraftBoth({ type: tool, points: Array(def.pts).fill(pt) , n: 1 }); }
    const n = dr.n + 1; const pts = dr.points.map((q, i) => (i < n - 1 ? q : pt));
    if (n >= def.pts) return finalize({ ...dr, points: pts });
    setDraftBoth({ ...dr, points: pts, n });
  };
  const onCaptureMove = (e) => {
    const p = px(e); setHover(p);
    const dr = draftRef.current; if (!dr) return;
    const def = TOOLS[dr.type], pt = toPoint(p);
    if (def.pts === 'free') { if (gesture.current?.kind === 'draw') setDraftBoth({ ...dr, points: [...dr.points, A.snapBar ? { t: A.xToTime(p.x), p: A.yToPrice(p.y) } : pt] }); return; }
    if (def.pts === 'poly') return setDraftBoth({ ...dr, points: [...dr.points.slice(0, -1), pt] });
    const g = gesture.current; if (g?.kind === 'press' && Math.hypot(p.x - g.start.x, p.y - g.start.y) > 4) g.moved = true;
    setDraftBoth({ ...dr, points: dr.points.map((q, i) => (i >= dr.n ? pt : q)) });
  };
  const onCaptureUp = () => {
    const dr = draftRef.current, g = gesture.current; gesture.current = null; if (!dr) return;
    const def = TOOLS[dr.type];
    if (def.pts === 'free') return finalize(dr);
    if (g?.kind === 'press' && g.moved && def.pts === 2) return finalize(dr); // drag-create
    if (g?.kind === 'press' && g.moved && def.pts === 3) setDraftBoth({ ...dr, n: 2 });
  };
  const onCaptureDbl = () => { const dr = draftRef.current; if (dr && TOOLS[dr.type].pts === 'poly') finalize({ ...dr, points: [...dr.points, dr.points[dr.points.length - 1]] }); };

  const forwardWheel = (e) => {
    const el = e.currentTarget; el.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY); el.style.pointerEvents = '';
    under?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }));
  };

  useEffect(() => { setDraftBoth(null); setHover(null); if (tool !== 'cursor') { setSelectedId(null); } }, [tool]); // eslint-disable-line

  /* ----- selection / move / resize gestures on existing drawings ----- */
  const startMove = (e, d) => {
    if (e.button !== 0) return;
    e.stopPropagation(); setGhost(null);
    if (eraser) { store.remove(d.id); return; }
    setSelectedId(d.id);
    if (d.locked || settings.lockAll) return;
    const start = px(e), orig = d.points.map((q) => ({ x: A.timeToX(q.t), y: A.priceToY(q.p) }));
    let started = false;
    const move = (ev) => {
      const cur = px(ev), dx = cur.x - start.x, dy = cur.y - start.y;
      if (!started) { if (Math.hypot(dx, dy) < 3) return; started = true; store.snapshot(); }
      store.replace(d.id, (o) => ({ ...o, points: orig.map((q, i) => { const base = o.points[i]; const nt = A.xToTime(q.x + dx), np = A.yToPrice(q.y + dy); return { ...base, t: A.snapBar ? (A.snapBar(nt)?.t ?? nt) : nt, p: np }; }) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const startHandle = (e, d, h) => {
    if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
    let started = false;
    const move = (ev) => {
      if (!started) { started = true; store.snapshot(); }
      const cur = px(ev);
      const pt = toPoint(cur); const snapped = { x: A.timeToX(pt.t), y: A.priceToY(pt.p) };
      store.replace(d.id, (o) => ({ ...o, ...dragHandle(o, h.k, h.lockX ? { x: cur.x, y: snapped.y } : h.lockY ? { x: snapped.x, y: cur.y } : snapped, A) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  /* ----- keyboard ----- */
  useEffect(() => {
    const kd = (e) => {
      if (isTyping()) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); store.remove(selectedId); }
      else if (e.key === 'Escape') {
        const dr = draftRef.current;
        if (dr && TOOLS[dr.type].pts === 'poly' && dr.points.length > 2) finalize(dr); else setDraftBoth(null);
        setGhost(null); setSelectedId(null); if (tool !== 'cursor') setTool('cursor');
      } else if (e.key === 'Enter' && draftRef.current && TOOLS[draftRef.current.type].pts === 'poly') finalize(draftRef.current);
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  }, [store, selectedId, tool, setTool, setSelectedId, finalize]);

  /* ----- render ----- */
  const W = A.plot.width, H = A.plot.height, sel = drawings.find((d) => d.id === selectedId);
  const shapes = visible.map((d) => ({ d, r: renderShape(d, A, { selected: d.id === selectedId, hovered: d.id === hoverId, theme }) }));
  const draftDraw = draft ? (() => { const def = TOOLS[draft.type]; const dd = { id: '__draft', type: draft.type, points: draft.points, style: def.style }; return { d: dd, r: renderShape(dd, A, { selected: true, theme }) }; })() : null;
  const ghostDraw = ghost ? (() => { const dd = { id: '__ghost', type: ghost.type, points: ghost.points, style: TOOLS[ghost.type].style }; return { d: dd, r: renderShape(dd, A, { selected: false, theme }) }; })() : null;
  const hi = draftDraw || (sel && visible.includes(sel) ? shapes.find((s) => s.d.id === sel.id) : null) || ghostDraw;
  const handles = hi && !hi.d.locked && !settings.lockAll && hi.d.id !== '__ghost' ? hi.r.handles : [];
  const chipsFor = (s) => (s.r.axisChips || []).map((c, i) => <PriceChip key={s.d.id + i} A={A} p={c.p} bg={c.bg} />);
  const edTarget = editing && drawings.find((d) => d.id === editing.id);
  const edPos = edTarget ? { x: A.timeToX(edTarget.points[0].t), y: A.priceToY(edTarget.points[0].p) } : null;
  void viewKey;

  return (
    <div ref={rootRef} className="td-layer" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, pointerEvents: 'none', overflow: 'visible' }}>
      <svg width={W + A.priceAxisWidth} height={H + A.timeAxisHeight} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} onContextMenu={onContextMenu}>
        <defs><clipPath id={'clip' + uid}><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
        <g clipPath={`url(#clip${uid})`}>
          {shapes.map(({ d, r }) => (
            <g key={d.id} onPointerDown={(e) => startMove(e, d)} onPointerEnter={() => setHoverId(d.id)} onPointerLeave={() => setHoverId((h) => (h === d.id ? null : h))}
              onDoubleClick={(e) => { e.stopPropagation(); if (d.type === 'text') setEditing({ id: d.id }); else if (!eraser) onOpenSettings?.(d.id); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedId(d.id); onContextMenu?.(e, d); }}
              style={{ cursor: eraser ? 'not-allowed' : undefined }}>{r.el}</g>
          ))}
          {draftDraw && <g style={{ pointerEvents: 'none' }}>{draftDraw.r.el}</g>}
          {ghostDraw && <g style={{ pointerEvents: 'none' }}>{ghostDraw.r.el}</g>}
          {active && hover && <Crosshair A={A} p={hover} />}
          {handles.map((h) => <Handle key={h.k} h={h} bg={bg} onDown={(e) => startHandle(e, hi.d, h)} />)}
        </g>
        {/* axis chips + selection band live outside the clip so they paint on the axes */}
        {shapes.map((s) => chipsFor(s))}
        {hi && hi.r.pMin != null && <AxisBand A={A} r={hi.r} />}
        {active && hover && <CrosshairChips A={A} p={hover} />}
        {active && <rect x={0} y={0} width={W} height={H} fill="transparent" style={{ pointerEvents: 'all', cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={onCaptureDown} onPointerMove={onCaptureMove} onPointerUp={onCaptureUp} onDoubleClick={onCaptureDbl}
          onPointerLeave={() => setHover(null)} onWheel={forwardWheel} />}
      </svg>
      {edTarget && edPos && (
        <textarea autoFocus className="td-text-edit" defaultValue={edTarget.style.text} placeholder="Add text" rows={Math.max(1, (edTarget.style.text || '').split('\n').length)}
          style={{ position: 'absolute', left: edPos.x, top: edPos.y - 14, pointerEvents: 'all', fontSize: edTarget.style.fontSize, color: edTarget.style.textColor, fontWeight: edTarget.style.bold ? 700 : 400, fontStyle: edTarget.style.italic ? 'italic' : 'normal', fontFamily: FONT }}
          onBlur={(e) => { const v = e.target.value; if (!v.trim()) store.remove(edTarget.id); else store.replace(edTarget.id, (o) => ({ ...o, style: { ...o.style, text: v } })); setEditing(null); }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.target.blur(); } }} />
      )}
    </div>
  );
}

function Handle({ h, bg, onDown }) {
  const common = { fill: bg, stroke: '#2962FF', strokeWidth: 2, style: { pointerEvents: 'all', cursor: h.cursor || 'pointer' }, onPointerDown: onDown };
  return h.shape === 'square' ? <rect x={h.x - 5} y={h.y - 5} width={10} height={10} rx={2.5} {...common} /> : <circle cx={h.x} cy={h.y} r={5.5} {...common} />;
}

function Crosshair({ A, p }) {
  return (<g style={{ pointerEvents: 'none' }}>
    <line x1={0} x2={A.plot.width} y1={p.y} y2={p.y} stroke="#9598A1" strokeWidth={1} strokeDasharray="3 3" />
    <line y1={0} y2={A.plot.height} x1={p.x} x2={p.x} stroke="#9598A1" strokeWidth={1} strokeDasharray="3 3" />
  </g>);
}
function CrosshairChips({ A, p }) {
  const pr = A.yToPrice(p.y), t = A.xToTime(p.x); const bar = A.snapBar?.(t); const tt = bar ? bar.t : t;
  return (<g style={{ pointerEvents: 'none' }}>
    <rect x={A.plot.width} y={p.y - 9} width={A.priceAxisWidth} height={18} fill="#363A45" />
    <circle cx={A.plot.width + 11} cy={p.y} r={5} fill="none" stroke="#D1D4DC" strokeWidth={1} /><path d={`M${A.plot.width + 11},${p.y - 2.5}v5M${A.plot.width + 8.5},${p.y}h5`} stroke="#D1D4DC" strokeWidth={1} />
    <text x={A.plot.width + 20} y={p.y + 4} fontSize={11} fill="#fff" fontFamily={FONT}>{A.formatPrice(pr)}</text>
    <TimeChip A={A} t={tt} bg="#363A45" />
  </g>);
}
function AxisBand({ A, r }) {
  const y1 = A.priceToY(r.pMax), y2 = A.priceToY(r.pMin);
  const hasT = r.tMin != null; const x1 = hasT ? A.timeToX(r.tMin) : 0, x2 = hasT ? A.timeToX(r.tMax) : 0;
  return (<g style={{ pointerEvents: 'none' }}>
    <rect x={A.plot.width} y={Math.min(y1, y2)} width={A.priceAxisWidth} height={Math.max(1, Math.abs(y2 - y1))} fill="rgba(41,98,255,.35)" />
    <PriceChip A={A} p={r.pMax} /><PriceChip A={A} p={r.pMin} />
    {hasT && <><rect x={Math.min(x1, x2)} y={A.plot.height} width={Math.max(1, Math.abs(x2 - x1))} height={20} fill="rgba(41,98,255,.35)" /><TimeChip A={A} t={r.tMin} /><TimeChip A={A} t={r.tMax} /></>}
  </g>);
}