import React, { useRef } from 'react';
import DrawingLayer from './DrawingLayer';
import FloatingToolbar from './FloatingToolbar';
import SettingsDialog from './SettingsDialog';
import { TOOLS } from './tools';
import './drawings.css';

/**
 * Everything that lives *inside* the chart box: the drawing overlay, the floating toolbar of the
 * selected drawing, and the settings dialog. Place it as a child of the chart's `position:relative` container.
 */
export default function DrawingSuite({ d, adapter, viewKey, containerRef, onZoomTo, theme }) {
  const { store, tool, setTool, settings, emoji, dialogId, setDialogId } = d;
  const sel = store.drawings.find((x) => x.id === store.selectedId);
  const dlg = store.drawings.find((x) => x.id === dialogId);
  const applyTemplate = (mode) => {
    if (!sel) return;
    const key = 'trado.drawingTemplate.' + sel.type;
    try {
      if (mode === 'save') localStorage.setItem(key, JSON.stringify(sel.style));
      else { const t = JSON.parse(localStorage.getItem(key) || 'null'); store.update(sel.id, (o) => ({ ...o, style: t || JSON.parse(JSON.stringify(TOOLS[o.type].style)) })); }
    } catch { /* storage unavailable */ }
  };
  return (
    <div className="td-root" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <DrawingLayer adapter={adapter} viewKey={viewKey} store={store} tool={tool} setTool={setTool} settings={settings} emoji={emoji} theme={theme}
        onOpenSettings={setDialogId} onZoomTo={onZoomTo} />
      {sel && !dialogId && !settings.hideAll && !sel.hidden && (
        <div style={{ pointerEvents: 'all', position: 'absolute', inset: 0, background: 'transparent', display: 'contents' }}>
          <FloatingToolbar key={sel.id} drawing={sel} store={store} onOpenSettings={setDialogId} onApplyTemplate={applyTemplate} containerRef={containerRef} settings={settings} />
        </div>
      )}
      {dlg && <SettingsDialog key={dlg.id} drawing={dlg} store={store} A={adapter} containerRef={containerRef} onClose={() => setDialogId(null)} />}
    </div>
  );
}
export { default as DrawingToolbar } from './DrawingToolbar';
export { useDrawings } from './useDrawings';
export { createLwcAdapter, useLwcViewKey } from './chartAdapter';