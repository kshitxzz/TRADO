import { useCallback, useRef, useState } from 'react';
import { TOOLS } from './tools';

let _n = 0;
export const uid = () => 'dw' + Date.now().toString(36) + (++_n).toString(36);

/** Drawing state + undo/redo. `drawings` is plain JSON → persist it per backtest session. */
export function useDrawingStore({ initial = [], onChange } = {}) {
  const [drawings, _set] = useState(initial);
  const [selectedId, setSelectedId] = useState(null);
  const ref = useRef(initial);
  const undo = useRef([]);
  const redo = useRef([]);

  const set = useCallback((next) => { ref.current = next; _set(next); onChange?.(next); }, [onChange]);
  const snapshot = useCallback(() => { undo.current.push(ref.current); if (undo.current.length > 100) undo.current.shift(); redo.current = []; }, []);

  const add = useCallback((d) => { snapshot(); set([...ref.current, d]); setSelectedId(d.id); }, [set, snapshot]);
  const replace = useCallback((id, patch) => set(ref.current.map((d) => (d.id === id ? (typeof patch === 'function' ? patch(d) : { ...d, ...patch }) : d))), [set]);
  const update = useCallback((id, patch) => { snapshot(); replace(id, patch); }, [replace, snapshot]);
  const remove = useCallback((id) => { snapshot(); set(ref.current.filter((d) => d.id !== id)); setSelectedId((s) => (s === id ? null : s)); }, [set, snapshot]);
  const clear = useCallback(() => { if (!ref.current.length) return; snapshot(); set([]); setSelectedId(null); }, [set, snapshot]);
  const doUndo = useCallback(() => { const prev = undo.current.pop(); if (!prev) return; redo.current.push(ref.current); set(prev); setSelectedId(null); }, [set]);
  const doRedo = useCallback(() => { const nxt = redo.current.pop(); if (!nxt) return; undo.current.push(ref.current); set(nxt); setSelectedId(null); }, [set]);
  const bringToFront = useCallback((id) => { const d = ref.current.find((x) => x.id === id); if (!d) return; snapshot(); set([...ref.current.filter((x) => x.id !== id), d]); }, [set, snapshot]);
  const sendToBack = useCallback((id) => { const d = ref.current.find((x) => x.id === id); if (!d) return; snapshot(); set([d, ...ref.current.filter((x) => x.id !== id)]); }, [set, snapshot]);
  const clone = useCallback((id) => {
    const d = ref.current.find((x) => x.id === id); if (!d) return;
    const c = JSON.parse(JSON.stringify(d)); c.id = uid();
    const shift = (c.points[1] ? (c.points[1].t - c.points[0].t) * 0.08 : 3600) || 3600;
    c.points = c.points.map((p) => ({ ...p, t: p.t + Math.abs(shift) }));
    snapshot(); set([...ref.current, c]); setSelectedId(c.id);
  }, [set, snapshot]);

  const create = useCallback((type, points, extra = {}) => {
    const def = TOOLS[type];
    return { id: uid(), type, points, style: JSON.parse(JSON.stringify(def.style)), locked: false, hidden: false,
      visibility: { ticks: true, seconds: [1, 59, true], minutes: [1, 59, true], hours: [1, 24, true], days: [1, 366, true], weeks: [1, 52, true], months: [1, 12, true], ranges: true }, ...extra };
  }, []);

  return { drawings, selectedId, setSelectedId, add, replace, update, remove, clear, undo: doUndo, redo: doRedo, snapshot,
    bringToFront, sendToBack, clone, create, getAll: () => ref.current };
}