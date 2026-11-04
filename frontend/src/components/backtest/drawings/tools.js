// Tool registry + default styles. Matches the TradingView toolset shown in the reference recording.
export const BLUE = '#2962FF', RED = '#F23645', GREEN = '#089981', GRAY = '#787B86', ORANGE = '#FF9800', YELLOW = '#FFEB3B';

const lineBase = {
  color: BLUE, width: 2, dash: 'solid', extend: 'none', arrowStart: false, arrowEnd: false,
  middlePoint: false, priceLabels: false, stats: 'hidden', statsPos: 'right', alwaysStats: false,
  text: '', textColor: BLUE, fontSize: 12, bold: false, italic: false, vAlign: 'middle', hAlign: 'center',
};
const shapeBase = {
  color: BLUE, width: 2, dash: 'solid', fill: BLUE, fillOpacity: 0.2, showFill: true,
  text: '', textColor: '#D1D4DC', fontSize: 12, bold: false, italic: false, vAlign: 'middle', hAlign: 'center',
};

export const FIB_LEVELS = [
  { v: 0, color: '#787B86' }, { v: 0.236, color: RED }, { v: 0.382, color: ORANGE },
  { v: 0.5, color: '#4CAF50' }, { v: 0.618, color: GREEN }, { v: 0.786, color: '#00BCD4' }, { v: 1, color: '#787B86' },
];

export const POSITION_DEFAULTS = {
  accountSize: 1000, lotSize: 1, risk: 2, riskUnit: '%', leverage: 100, qtyPrecision: 'default',
  lineColor: '#9598A1', stopColor: RED, targetColor: GREEN, fillOpacity: 0.2, textColor: '#FFFFFF', fontSize: 12,
  priceLabels: true, stats: 'values', compact: false, alwaysStats: true, width: 1,
};

// kind: how the tool is created. pts: number of anchor points, 'poly' = n clicks, 'free' = drag stroke.
export const TOOLS = {
  trendline:   { label: 'Trend line',        group: 'lines',   pts: 2, title: 'Trendline', style: { ...lineBase } },
  ray:         { label: 'Ray',               group: 'lines',   pts: 2, title: 'Ray', style: { ...lineBase, extend: 'right' } },
  extline:     { label: 'Extended line',     group: 'lines',   pts: 2, title: 'Extended line', style: { ...lineBase, extend: 'both' } },
  arrow:       { label: 'Arrow',             group: 'lines',   pts: 2, title: 'Arrow', style: { ...lineBase, arrowEnd: true } },
  hline:       { label: 'Horizontal line',   group: 'lines',   pts: 1, title: 'Horizontal line', style: { ...lineBase, priceLabels: true } },
  hray:        { label: 'Horizontal ray',    group: 'lines',   pts: 1, title: 'Horizontal ray', style: { ...lineBase, priceLabels: true } },
  vline:       { label: 'Vertical line',     group: 'lines',   pts: 1, title: 'Vertical line', style: { ...lineBase } },
  channel:     { label: 'Parallel channel',  group: 'fib',     pts: 3, title: 'Parallel channel', style: { ...lineBase, fill: BLUE, fillOpacity: 0.1, showFill: true, middleLine: true } },
  fib:         { label: 'Fib retracement',   group: 'fib',     pts: 2, title: 'Fib retracement', style: { ...lineBase, color: GRAY, fillOpacity: 0.12, showFill: true, showPrices: true, showLevels: true, levels: FIB_LEVELS } },
  long:        { label: 'Long position',     group: 'forecast', pts: 1, title: 'Long position', style: { ...POSITION_DEFAULTS } },
  short:       { label: 'Short position',    group: 'forecast', pts: 1, title: 'Short position', style: { ...POSITION_DEFAULTS } },
  priceRange:  { label: 'Price range',       group: 'measure', pts: 2, title: 'Price range', style: { ...shapeBase, color: BLUE, fill: BLUE } },
  dateRange:   { label: 'Date range',        group: 'measure', pts: 2, title: 'Date range', style: { ...shapeBase, color: BLUE, fill: BLUE } },
  dateAndPriceRange: { label: 'Date and price range', group: 'measure', pts: 2, title: 'Date and price range', style: { ...shapeBase, color: BLUE, fill: BLUE } },
  measure:     { label: 'Measure',           group: 'measure', pts: 2, title: 'Measure', transient: true, style: { ...shapeBase } },
  brush:       { label: 'Brush',             group: 'brushes', pts: 'free', title: 'Brush', style: { color: BLUE, width: 2, dash: 'solid', fill: BLUE, fillOpacity: 0.2, showFill: false, arrowStart: false, arrowEnd: false } },
  highlighter: { label: 'Highlighter',       group: 'brushes', pts: 'free', title: 'Highlighter', style: { color: YELLOW, width: 20, dash: 'solid', opacity: 0.4, arrowStart: false, arrowEnd: false } },
  arrowUp:     { label: 'Arrow mark up',     group: 'arrows',  pts: 1, title: 'Arrow mark up', style: { color: GREEN, textColor: GREEN, text: '', fontSize: 12, bold: false, italic: false } },
  arrowDown:   { label: 'Arrow mark down',   group: 'arrows',  pts: 1, title: 'Arrow mark down', style: { color: RED, textColor: RED, text: '', fontSize: 12, bold: false, italic: false } },
  rect:        { label: 'Rectangle',         group: 'shapes',  pts: 2, title: 'Rectangle', style: { ...shapeBase } },
  path:        { label: 'Path',              group: 'shapes',  pts: 'poly', title: 'Path', style: { color: BLUE, width: 2, dash: 'solid', arrowEnd: true, arrowStart: false, showFill: false, fill: BLUE, fillOpacity: 0.2 } },
  circle:      { label: 'Circle',            group: 'shapes',  pts: 2, title: 'Circle', style: { ...shapeBase } },
  ellipse:     { label: 'Ellipse',           group: 'shapes',  pts: 2, title: 'Ellipse', style: { ...shapeBase } },
  polyline:    { label: 'Polyline',          group: 'shapes',  pts: 'poly', title: 'Polyline', style: { color: BLUE, width: 2, dash: 'solid', arrowEnd: false, arrowStart: false, showFill: true, fill: BLUE, fillOpacity: 0.2 } },
  triangle:    { label: 'Triangle',          group: 'shapes',  pts: 3, title: 'Triangle', style: { ...shapeBase } },
  text:        { label: 'Text',              group: 'text',    pts: 1, title: 'Text', style: { color: '#D1D4DC', textColor: '#D1D4DC', fontSize: 14, bold: false, italic: false, text: '', showBg: false, bg: '#2A2E39', showBorder: false } },
  emoji:       { label: 'Emoji',             group: 'text',    pts: 1, title: 'Emoji', style: { emoji: '😀', size: 32 } },
  zoom:        { label: 'Zoom in',           group: 'view',    pts: 2, title: 'Zoom', transient: true, style: {} },
};

export const MENU = {
  cursors: [
    { section: null, items: [
      { id: 'cross', label: 'Cross' }, { id: 'dot', label: 'Dot' }, { id: 'arrowc', label: 'Arrow' }, { id: 'eraser', label: 'Eraser', divider: true },
    ] },
  ],
  lines: [{ section: 'LINES', items: ['trendline', 'ray', 'extline', 'arrow', 'hline', 'hray', 'vline'] }],
  fib: [{ section: 'FIBONACCI & CHANNELS', items: ['fib', 'channel'] }],
  forecast: [
    { section: 'FORECASTING', items: ['long', 'short'] },
    { section: 'MEASURERS', items: ['priceRange', 'dateRange', 'dateAndPriceRange'] },
  ],
  shapes: [
    { section: 'BRUSHES', items: ['brush', 'highlighter'] },
    { section: 'ARROWS', items: ['arrow', 'arrowUp', 'arrowDown'] },
    { section: 'SHAPES', items: ['rect', 'path', 'circle', 'ellipse', 'polyline', 'triangle'] },
  ],
};

export const EMOJIS = ['😀','😎','🤔','😡','😭','🚀','🔥','💎','📈','📉','⚠️','✅','❌','⭐','💰','🎯','🐂','🐻','👍','👎','👀','💡','🏁','🔔'];

export const dashArray = (dash, w = 1) => (dash === 'dashed' ? `${w * 4} ${w * 3}` : dash === 'dotted' ? `${w} ${w * 2.5}` : undefined);