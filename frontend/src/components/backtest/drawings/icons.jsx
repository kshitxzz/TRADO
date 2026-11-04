import React from 'react';
import { ArrowBigDown, ArrowBigUp, Brush, Circle, Dot, Eraser, Highlighter, Magnet, MinusIcon, MousePointer2, Plus, Ruler, Smile, Square, Triangle, Type, ZoomIn } from 'lucide-react';

const S = ({ children, size = 24, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
const node = (x, y) => <circle cx={x} cy={y} r={2.2} />;

export const ICONS = {
  cross: (p) => <Plus strokeWidth={1.5} {...p} />,
  dot: (p) => <Dot strokeWidth={6} {...p} />,
  arrowc: (p) => <MousePointer2 strokeWidth={1.5} {...p} />,
  eraser: (p) => <Eraser strokeWidth={1.5} {...p} />,
  trendline: (p) => <S {...p}><path d="M7.4 16.6 16.6 7.4" />{node(5.5, 18.5)}{node(18.5, 5.5)}</S>,
  ray: (p) => <S {...p}><path d="M7.4 16.6 21 3" />{node(5.5, 18.5)}</S>,
  extline: (p) => <S {...p}><path d="M3 21 21 3" />{node(9, 15)}{node(15, 9)}</S>,
  arrow: (p) => <S {...p}><path d="M5 19 18 6M10 6h8v8" /></S>,
  hline: (p) => <S {...p}><path d="M3 12h4.5M16.5 12H21" />{node(12, 12)}</S>,
  hray: (p) => <S {...p}><path d="M7 12h14" />{node(5, 12)}</S>,
  vline: (p) => <S {...p}><path d="M12 3v4.5M12 16.5V21" />{node(12, 12)}</S>,
  channel: (p) => <S {...p}><path d="M4 15 19 6M4 21 19 12" />{node(4, 15)}{node(19, 6)}</S>,
  fib: (p) => <S {...p}><path d="M4 6h16M4 12h16M4 18h16" />{node(4, 6)}{node(20, 18)}</S>,
  long: (p) => <S {...p}><path d="M3 7h12M3 17h12M3 12h18" /><path d="M9 9.5v-0M9 14.8" /><text x="8" y="11" fontSize="5" fill="currentColor" stroke="none">L</text></S>,
  short: (p) => <S {...p}><path d="M3 7h12M3 17h12M3 12h18" /><text x="8" y="11" fontSize="5" fill="currentColor" stroke="none">S</text></S>,
  priceRange: (p) => <S {...p}><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" /></S>,
  dateRange: (p) => <S {...p}><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" /></S>,
  dateAndPriceRange: (p) => <S {...p}><rect x="5" y="5" width="14" height="14" /><path d="M12 8v8M8 12h8" /></S>,
  measure: (p) => <Ruler strokeWidth={1.5} {...p} />,
  brush: (p) => <Brush strokeWidth={1.5} {...p} />,
  highlighter: (p) => <Highlighter strokeWidth={1.5} {...p} />,
  arrowUp: (p) => <ArrowBigUp strokeWidth={1.5} {...p} />,
  arrowDown: (p) => <ArrowBigDown strokeWidth={1.5} {...p} />,
  rect: (p) => <Square strokeWidth={1.5} {...p} />,
  path: (p) => <S {...p}><path d="M4 17 9 8l5 7 6-9" />{node(4, 17)}{node(9, 8)}{node(14, 15)}</S>,
  circle: (p) => <Circle strokeWidth={1.5} {...p} />,
  ellipse: (p) => <S {...p}><ellipse cx="12" cy="12" rx="9" ry="6" /></S>,
  polyline: (p) => <S {...p}><path d="M5 18 4 9l8-5 8 7-4 8Z" /></S>,
  triangle: (p) => <Triangle strokeWidth={1.5} {...p} />,
  text: (p) => <Type strokeWidth={1.5} {...p} />,
  emoji: (p) => <Smile strokeWidth={1.5} {...p} />,
  zoom: (p) => <ZoomIn strokeWidth={1.5} {...p} />,
  magnet: (p) => <Magnet strokeWidth={1.5} {...p} />,
  line: (p) => <MinusIcon {...p} />,
};
export const Icon = ({ id, size = 22 }) => { const C = ICONS[id]; return C ? <C width={size} height={size} /> : null; };