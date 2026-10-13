// ── Notebook templates ───────────────────────────────────────────────────────
// A note is an ordered list of fields. A template is just a ready-made list of
// fields — picking one pre-builds the structure so the trader only fills in
// the blanks, and can still add, rename, reorder or delete any field in the
// editor afterwards.
//
// Field types:
//   text       one-line input
//   textarea   multi-line plain text
//   number     numeric input
//   date       date picker
//   select     dropdown — `options` is an array of strings
//   rating     1–10 score
//   checklist  tick-list — `value` is [{ id, text, done }]
//   richtext   full rich-text editor (bold, lists, tables, images…)
//   rr         read-only risk:reward ratio, computed from the fields whose
//              ids are `entry`, `stop` and `target`

let uid = 0
export const newId = (p = 'f') =>
  `${p}_${Date.now().toString(36)}${(uid++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ── Field-type catalogue (used by the "Add field" menu) ──────────────────────
export const FIELD_TYPES = [
  { type: 'text',      label: 'Short text',  hint: 'A single line' },
  { type: 'textarea',  label: 'Long text',   hint: 'Several lines' },
  { type: 'number',    label: 'Number',      hint: 'Price, size, %…' },
  { type: 'select',    label: 'Dropdown',    hint: 'Pick from options' },
  { type: 'rating',    label: 'Rating',      hint: 'Score from 1 to 10' },
  { type: 'checklist', label: 'Checklist',   hint: 'Tick-off items' },
  { type: 'date',      label: 'Date',        hint: 'Pick a day' },
  { type: 'richtext',  label: 'Rich text',   hint: 'Formatting, tables, images' },
]

export const fieldTypeLabel = (type) =>
  type === 'rr' ? 'Risk : Reward' : (FIELD_TYPES.find(t => t.type === type)?.label || 'Text')

// Blank value for a freshly-added field of the given type.
export function emptyValue(type) {
  if (type === 'checklist') return []
  if (type === 'rating') return 0
  return ''
}

export function makeField(type, label = '') {
  const f = { id: newId(), type, label: label || fieldTypeLabel(type), value: emptyValue(type) }
  if (type === 'select') f.options = ['Option 1', 'Option 2', 'Option 3']
  return f
}

// ── Compact field builders so the template list below stays readable ─────────
const F = {
  text:     (id, label, placeholder = '')                 => ({ id, type: 'text',     label, placeholder, value: '' }),
  area:     (id, label, placeholder = '')                 => ({ id, type: 'textarea', label, placeholder, value: '' }),
  num:      (id, label, placeholder = '')                 => ({ id, type: 'number',   label, placeholder, value: '' }),
  date:     (id, label, value = '')                       => ({ id, type: 'date',     label, value }),
  select:   (id, label, options, value = '')              => ({ id, type: 'select',   label, options, value }),
  rating:   (id, label)                                   => ({ id, type: 'rating',   label, value: 0 }),
  rich:     (id, label, placeholder = '')                 => ({ id, type: 'richtext', label, placeholder, value: '' }),
  rr:       (id, label)                                   => ({ id, type: 'rr',       label, value: '' }),
  checklist: (id, label, items)                           => ({
    id, type: 'checklist', label,
    value: items.map((text, i) => ({ id: `${id}_${i}`, text, done: false })),
  }),
}

// ── Date helpers for smart defaults ──────────────────────────────────────────
const isoDay = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
const fmt = (d, o) => d.toLocaleDateString('en-US', o)

function weekRange(now = new Date()) {
  const start = new Date(now)
  const dow = (start.getDay() + 6) % 7 // Monday = 0
  start.setDate(start.getDate() - dow)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

// ── Categories (order = order in the picker) ─────────────────────────────────
export const TEMPLATE_CATEGORIES = [
  { id: 'trading',  label: 'Trading',  sub: 'Trade ideas and setups' },
  { id: 'analysis', label: 'Analysis', sub: 'Market research' },
  { id: 'review',   label: 'Review',   sub: 'Performance tracking' },
  { id: 'learning', label: 'Learning', sub: 'Strategies & psychology' },
]

// `icon` is a key into ICONS in components/notebook/ui.jsx.
// `color` drives the tinted card + icon tile (any CSS colour).
// `titleHint()` gives the title box a useful example as its placeholder.
export const NOTE_TEMPLATES = [
  // ── Trading ────────────────────────────────────────────────────────────────
  {
    id: 'trade-idea', category: 'trading', name: 'Trade Idea', icon: 'lightbulb', color: '#F59E0B',
    description: 'Document potential trade setups with entry, target, and risk',
    titleHint: () => 'e.g. XAUUSD breakout retest',
    build: () => [
      F.text('symbol', 'Symbol / Pair', 'e.g. XAUUSD'),
      F.select('direction', 'Direction', ['Long', 'Short']),
      F.select('timeframe', 'Timeframe', ['M5', 'M15', 'H1', 'H4', 'D1']),
      F.area('thesis', 'Setup / Thesis', 'Why does this trade make sense? What is the edge?'),
      F.num('entry', 'Entry Price'),
      F.num('stop', 'Stop Loss'),
      F.num('target', 'Take Profit'),
      F.rr('rr', 'Risk : Reward'),
      F.area('invalidation', 'Invalidation', 'What price action proves this idea wrong?'),
      F.checklist('confirmations', 'Confirmations', [
        'Trend aligned on higher timeframe', 'Key level / structure respected',
        'Clean entry trigger', 'No high-impact news inside the trade window',
      ]),
      F.rating('conviction', 'Conviction'),
      F.area('notes', 'Extra Notes'),
    ],
  },
  {
    id: 'pre-market', category: 'trading', name: 'Pre-Market Plan', icon: 'sunrise', color: '#FB923C',
    description: 'Prepare your session: bias, levels, news and risk limits',
    titleHint: () => `e.g. ${fmt(new Date(), { weekday: 'long' })} session plan`,
    build: () => [
      F.date('date', 'Date', isoDay()),
      F.select('session', 'Session', ['Asian', 'London', 'New York', 'London / NY overlap']),
      F.select('bias', 'Market Bias', ['Bullish', 'Bearish', 'Neutral / Range']),
      F.area('levels', 'Key Levels', 'Support, resistance, liquidity pools, prior day high / low…'),
      F.area('news', 'News & Events', 'High-impact releases and their times'),
      F.area('setups', 'Setups I Will Take', 'A+ setups only. Be specific.'),
      F.num('maxloss', 'Max Daily Loss'),
      F.num('maxtrades', 'Max Number of Trades'),
      F.checklist('prep', 'Prep Checklist', [
        'Checked the economic calendar', 'Marked higher-timeframe levels',
        'Reviewed yesterday\u2019s trades', 'Mentally calm and ready',
      ]),
    ],
  },
  {
    id: 'post-trade', category: 'trading', name: 'Post-Trade Debrief', icon: 'flag', color: '#34D399',
    description: 'Break down a finished trade: execution, emotions and lessons',
    titleHint: () => 'e.g. EURUSD long \u2014 London open',
    build: () => [
      F.text('symbol', 'Symbol / Pair'),
      F.select('result', 'Outcome', ['Win', 'Loss', 'Break-even']),
      F.num('rmultiple', 'Result (R multiple)'),
      F.area('plan', 'Was It In My Plan?', 'Did I take exactly the setup I planned?'),
      F.rating('execution', 'Execution Quality'),
      F.area('emotions', 'How I Felt', 'Before, during and after the trade'),
      F.area('mistakes', 'What Went Wrong'),
      F.area('good', 'What Went Right'),
      F.area('lesson', 'Key Lesson'),
    ],
  },
  {
    id: 'blank', category: 'trading', name: 'Blank Note', icon: 'file', color: '#9CA3AF',
    description: 'Start with a blank page for free-form notes',
    titleHint: () => 'Untitled note',
    build: () => [F.rich('content', 'Content', 'Start writing…')],
  },

  // ── Analysis ───────────────────────────────────────────────────────────────
  {
    id: 'market-analysis', category: 'analysis', name: 'Market Analysis', icon: 'barchart', color: '#3B82F6',
    description: 'Comprehensive technical and fundamental analysis',
    titleHint: () => 'e.g. NASDAQ weekly outlook',
    build: () => [
      F.text('market', 'Market / Instrument', 'e.g. US100'),
      F.select('trend', 'Overall Trend', ['Strong uptrend', 'Uptrend', 'Range', 'Downtrend', 'Strong downtrend']),
      F.area('technical', 'Technical Analysis', 'Structure, patterns, indicators, volume…'),
      F.area('fundamental', 'Fundamental Drivers', 'Rates, data, earnings, geopolitics…'),
      F.area('levels', 'Key Levels'),
      F.area('scenario-bull', 'Bullish Scenario'),
      F.area('scenario-bear', 'Bearish Scenario'),
      F.rating('confidence', 'Confidence'),
      F.rich('chart', 'Charts & Screenshots', 'Paste or insert chart screenshots here…'),
    ],
  },

  // ── Review ─────────────────────────────────────────────────────────────────
  {
    id: 'daily-review', category: 'review', name: 'Daily Review', icon: 'sun', color: '#EAB308',
    description: 'A quick end-of-day check-in on process, mood and lessons',
    titleHint: () => `e.g. ${fmt(new Date(), { weekday: 'long', month: 'short', day: 'numeric' })}`,
    build: () => [
      F.date('date', 'Date', isoDay()),
      F.num('pnl', 'Net P&L'),
      F.num('trades', 'Trades Taken'),
      F.rating('discipline', 'Discipline'),
      F.rating('mood', 'Mood'),
      F.area('went-well', 'What Went Well'),
      F.area('improve', 'What To Improve'),
      F.text('tomorrow', 'One Focus For Tomorrow'),
    ],
  },
  {
    id: 'weekly-review', category: 'review', name: 'Weekly Review', icon: 'calendar', color: '#A855F7',
    description: 'Analyze your weekly trading performance',
    titleHint: () => {
      const { start, end } = weekRange()
      return `e.g. Week of ${fmt(start, { month: 'short', day: 'numeric' })} \u2013 ${fmt(end, { month: 'short', day: 'numeric' })}`
    },
    build: () => {
      const { start, end } = weekRange()
      return [
        F.date('week-start', 'Week Starting', isoDay(start)),
        F.date('week-end', 'Week Ending', isoDay(end)),
        F.num('pnl', 'Net P&L'),
        F.num('winrate', 'Win Rate (%)'),
        F.num('trades', 'Total Trades'),
        F.area('best', 'Best Trade & Why'),
        F.area('worst', 'Worst Trade & Why'),
        F.area('patterns', 'Patterns I Noticed', 'Recurring mistakes, time-of-day effects, setups that paid…'),
        F.rating('discipline', 'Discipline Score'),
        F.area('goals', 'Goals For Next Week'),
      ]
    },
  },
  {
    id: 'monthly-review', category: 'review', name: 'Monthly Review', icon: 'trending', color: '#EC4899',
    description: 'Zoom out: results, equity trend, rule breaks and next month\u2019s plan',
    titleHint: () => `e.g. ${fmt(new Date(), { month: 'long', year: 'numeric' })} review`,
    build: () => [
      F.select('month', 'Month', ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        fmt(new Date(), { month: 'long' })),
      F.num('pnl', 'Net P&L'),
      F.num('drawdown', 'Max Drawdown (%)'),
      F.num('winrate', 'Win Rate (%)'),
      F.text('best-setup', 'Best Performing Setup'),
      F.text('worst-setup', 'Worst Performing Setup'),
      F.area('rules', 'Rules I Broke'),
      F.area('wins', 'Biggest Wins (process, not just P&L)'),
      F.area('changes', 'What I Will Change'),
      F.checklist('goals', 'Next Month\u2019s Goals', ['Goal 1', 'Goal 2', 'Goal 3']),
    ],
  },

  // ── Learning ───────────────────────────────────────────────────────────────
  {
    id: 'strategy-doc', category: 'learning', name: 'Strategy Documentation', icon: 'target', color: '#22C55E',
    description: 'Document your trading strategy with clear rules',
    titleHint: () => 'e.g. London breakout strategy',
    build: () => [
      F.text('name', 'Strategy Name'),
      F.area('edge', 'Edge / Why It Works'),
      F.text('markets', 'Markets & Sessions'),
      F.text('timeframes', 'Timeframes'),
      F.area('entry', 'Entry Rules', 'Exactly what must be true before you click buy / sell'),
      F.area('exit', 'Exit Rules', 'Targets, trailing, time stops'),
      F.area('risk', 'Risk Management', 'Risk per trade, max daily loss, position sizing'),
      F.area('avoid', 'When NOT To Trade It'),
      F.checklist('checklist', 'Pre-Trade Checklist', ['Setup matches the rules exactly', 'Risk is within limits', 'No news conflict']),
      F.rich('examples', 'Example Trades', 'Add annotated screenshots of ideal setups…'),
    ],
  },
  {
    id: 'psychology', category: 'learning', name: 'Trading Psychology', icon: 'heart', color: '#F43F5E',
    description: 'Track your mental state and emotional patterns',
    titleHint: () => 'e.g. Revenge trading after the NFP loss',
    build: () => [
      F.select('emotion', 'Dominant Emotion', ['Calm', 'Confident', 'Anxious', 'Fearful', 'Greedy', 'Frustrated', 'Overconfident', 'Bored']),
      F.rating('intensity', 'Intensity'),
      F.area('trigger', 'What Triggered It'),
      F.area('behavior', 'How It Affected My Trading'),
      F.area('response', 'What I Did About It'),
      F.area('rule', 'A Rule To Protect Me Next Time'),
    ],
  },
  {
    id: 'mistake-log', category: 'learning', name: 'Mistake Log', icon: 'alert', color: '#EF4444',
    description: 'Catch repeat mistakes: what happened, the cost and the fix',
    titleHint: () => 'e.g. Moved my stop loss',
    build: () => [
      F.date('date', 'Date', isoDay()),
      F.select('type', 'Mistake Type', ['Broke a rule', 'Over-leveraged', 'Revenge trade', 'FOMO entry', 'Moved stop loss', 'Exited early', 'Overtraded', 'Other']),
      F.area('what', 'What Happened'),
      F.num('cost', 'Cost (P&L impact)'),
      F.area('why', 'Root Cause'),
      F.area('fix', 'How I Will Prevent It'),
      F.select('repeat', 'Have I Done This Before?', ['First time', 'Occasionally', 'Often']),
    ],
  },
]

export const getTemplate = (id) => NOTE_TEMPLATES.find(t => t.id === id) || null

// Display name for the "Type" tile in a note.
export const templateName = (id) => (id === 'blank' ? 'Note' : (getTemplate(id)?.name || 'Note'))

// Quick-start tiles on the "Select a Note" empty state (same four as the reference).
export const QUICK_START_IDS = ['trade-idea', 'market-analysis', 'weekly-review', 'strategy-doc']

// Folders every new notebook starts with.
export const DEFAULT_FOLDERS = ['Daily Journal', 'Risk Management', 'Psychology']