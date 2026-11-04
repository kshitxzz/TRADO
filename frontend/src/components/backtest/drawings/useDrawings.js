import { useMemo, useState } from 'react';
import { useDrawingStore } from './store';

export const DEFAULT_SETTINGS = { cursorType: 'cross', magnet: 'off', stayInDrawing: false, lockAll: false, hideAll: false, valuesTooltip: true };

/** One hook that owns every piece of drawing UI state. Persist `store.drawings` (plain JSON) per session. */
export function useDrawings({ initial, onChange } = {}) {
  const store = useDrawingStore({ initial, onChange });
  const [tool, setTool] = useState('cursor');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [emoji, setEmoji] = useState('😀');
  const [dialogId, setDialogId] = useState(null);
  return useMemo(() => ({ store, tool, setTool, settings, setSettings, emoji, setEmoji, dialogId, setDialogId }), [store, tool, settings, emoji, dialogId]); // eslint-disable-line
}