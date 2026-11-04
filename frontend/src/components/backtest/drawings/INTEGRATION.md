# Trado drawing tools — integration

Drop the whole `drawings/` folder next to your backtesting chart (e.g. `src/pages/backtesting/drawings/`).
Everything is namespaced `td-` and self-contained (React + lucide-react only; no native `<select>`).

## 1. State (once, in your chart page)
```jsx
import DrawingSuite, { DrawingToolbar, useDrawings, createLwcAdapter, useLwcViewKey } from './drawings/DrawingSuite';
const d = useDrawings({ initial: session.drawings, onChange: (list) => saveToSession(list) }); // list is plain JSON
```

## 2. Layout
```jsx
<div style={{display:'flex'}}>
  <DrawingToolbar tool={d.tool} setTool={d.setTool} settings={d.settings} setSettings={d.setSettings}
     emoji={d.emoji} setEmoji={d.setEmoji} onRemoveAll={d.store.clear} hasDrawings={d.store.drawings.length>0} />
  <div ref={wrap} style={{position:'relative', flex:1}}>
     {/* your chart */}
     {adapter && <DrawingSuite d={d} adapter={adapter} viewKey={viewKey} containerRef={wrap} onZoomTo={...} theme={{bg:'#131722'}} />}
  </div>
</div>
```
`DrawingSuite` renders at `z-index:10`; if your chart canvases sit higher, raise it.

## 3. Adapter
`createLwcAdapter` + `useLwcViewKey` are for Lightweight Charts v4. For any other chart, return an object with the
shape documented at the top of `chartAdapter.js` (timeToX/xToTime/priceToY/yToPrice, snapBar, plot size, tickSize, lastPrice, timeframeSeconds)
and bump `viewKey` whenever the visible range / size / price scale changes.
Drawings are stored as `{t: unixSeconds, p: price}` so they survive timeframe changes; set `timeframeSeconds` to the active timeframe.
`lastPrice` should be the replay's current close so Long/Short "Open PnL" is live.

See `Harness.jsx` for a complete working example.