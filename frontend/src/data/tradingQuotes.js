import { Compass, Brain, Coins, TrendingUp, ShieldAlert, Scale, Layers, LineChart } from 'lucide-react'

// ── Daily Wisdom quote bank ───────────────────────────────────────────────────
// Short, original lines shown once per day on the Daily Wisdom popup (see
// hooks/useDailyWisdom.js). No attribution — these are house lines, not
// sourced quotes, so no author is shown in the UI. Each entry carries a
// `category` (shown as "ON <CATEGORY>") and an `icon` for the badge.
export const TRADING_QUOTES = [
  // ── Mindset ──────────────────────────────────────────────────────────────
  { category: 'Mindset', icon: Compass, quote: "Your mindset enters the trade before your money does." },
  { category: 'Mindset', icon: Compass, quote: "The market doesn't break traders — untrained minds do." },
  { category: 'Mindset', icon: Compass, quote: "Discipline is a decision made long before the candle closes." },
  { category: 'Mindset', icon: Compass, quote: "A trader's edge lives in the mind first, the chart second." },
  { category: 'Mindset', icon: Compass, quote: "You don't need to predict the market. You need to control yourself." },
  { category: 'Mindset', icon: Compass, quote: "Calm is a skill. Trade like you've already practiced it." },

  // ── Psychology ───────────────────────────────────────────────────────────
  { category: 'Psychology', icon: Brain, quote: "Fear closes winners early. Greed holds losers too long." },
  { category: 'Psychology', icon: Brain, quote: "Revenge trading is grief wearing a trading hat." },
  { category: 'Psychology', icon: Brain, quote: "The scariest trade is usually the correct one." },
  { category: 'Psychology', icon: Brain, quote: "Your feelings about a trade are not the trade." },
  { category: 'Psychology', icon: Brain, quote: "Confidence without a plan is just hope in disguise." },
  { category: 'Psychology', icon: Brain, quote: "The market has no memory of your last loss. Neither should you." },

  // ── Wealth ───────────────────────────────────────────────────────────────
  { category: 'Wealth', icon: Coins, quote: "Wealth is built one disciplined decision at a time." },
  { category: 'Wealth', icon: Coins, quote: "Protecting capital is the first step to compounding it." },
  { category: 'Wealth', icon: Coins, quote: "Small, consistent gains outlast one lucky home run." },
  { category: 'Wealth', icon: Coins, quote: "Real wealth is survivability, not a single winning streak." },
  { category: 'Wealth', icon: Coins, quote: "Compounding rewards patience far more than it rewards intensity." },
  { category: 'Wealth', icon: Coins, quote: "The trader who protects downside eventually owns the upside." },

  // ── Growth ───────────────────────────────────────────────────────────────
  { category: 'Growth', icon: TrendingUp, quote: "Every losing trade is tuition, if you review it." },
  { category: 'Growth', icon: TrendingUp, quote: "Growth in trading looks like fewer mistakes, not bigger profits." },
  { category: 'Growth', icon: TrendingUp, quote: "You don't grow from wins. You grow from reviewed losses." },
  { category: 'Growth', icon: TrendingUp, quote: "Skill is what remains after the excitement of luck fades." },
  { category: 'Growth', icon: TrendingUp, quote: "The trader you'll become is built in today's journal entry." },
  { category: 'Growth', icon: TrendingUp, quote: "Progress looks like a smaller drawdown, not a bigger position." },

  // ── Risk Management ──────────────────────────────────────────────────────
  { category: 'Risk Management', icon: ShieldAlert, quote: "Risk management is the only edge that works in every market." },
  { category: 'Risk Management', icon: ShieldAlert, quote: "Plan your exit before you plan your entry." },
  { category: 'Risk Management', icon: ShieldAlert, quote: "A stop-loss is not a failure. It's a promise kept." },
  { category: 'Risk Management', icon: ShieldAlert, quote: "The trade you skip can be as valuable as the trade you take." },
  { category: 'Risk Management', icon: ShieldAlert, quote: "Protect your capital first. Profits are a byproduct." },
  { category: 'Risk Management', icon: ShieldAlert, quote: "One reckless trade can undo a hundred disciplined ones." },

  // ── Risk to Reward ───────────────────────────────────────────────────────
  { category: 'Risk to Reward', icon: Scale, quote: "A good setup with poor risk-to-reward is still a bad trade." },
  { category: 'Risk to Reward', icon: Scale, quote: "Win rate is vanity. Risk-to-reward is sanity." },
  { category: 'Risk to Reward', icon: Scale, quote: "You can be wrong more than you're right and still profit — if the math is right." },
  { category: 'Risk to Reward', icon: Scale, quote: "Chase the ratio, not the outcome." },
  { category: 'Risk to Reward', icon: Scale, quote: "Small risk, real reward — that's the only trade worth taking." },
  { category: 'Risk to Reward', icon: Scale, quote: "Every trade should let a small loss buy a large possibility." },

  // ── Position Sizing ──────────────────────────────────────────────────────
  { category: 'Position Sizing', icon: Layers, quote: "Position size decides how loud your emotions get to speak." },
  { category: 'Position Sizing', icon: Layers, quote: "The size of your position should match the size of your certainty." },
  { category: 'Position Sizing', icon: Layers, quote: "Oversized trades turn small mistakes into large lessons." },
  { category: 'Position Sizing', icon: Layers, quote: "Bet small enough to be wrong, and big enough to matter." },
  { category: 'Position Sizing', icon: Layers, quote: "Position sizing is risk management wearing a number." },
  { category: 'Position Sizing', icon: Layers, quote: "Survive first. Size second. Profit third." },

  // ── Trading ──────────────────────────────────────────────────────────────
  { category: 'Trading', icon: LineChart, quote: "The market rewards patience and punishes impatience — every single day." },
  { category: 'Trading', icon: LineChart, quote: "Not trading is also a trading decision." },
  { category: 'Trading', icon: LineChart, quote: "The best trade is sometimes the one you don't take." },
  { category: 'Trading', icon: LineChart, quote: "Consistency beats intensity in every market cycle." },
  { category: 'Trading', icon: LineChart, quote: "Trade the plan. Journal the outcome. Repeat." },
  { category: 'Trading', icon: LineChart, quote: "Market is Supreme." },
]