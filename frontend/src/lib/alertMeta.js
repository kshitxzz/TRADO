import { DollarSign, TrendingDown, Scale, Clock, AlertTriangle } from 'lucide-react'

export const RULE_META = {
  daily_loss:      { icon: DollarSign,    label: 'DAILY_LOSS' },
  loss_streak:     { icon: TrendingDown,  label: 'LOSS_STREAK' },
  position_size:   { icon: Scale,         label: 'POSITION_SIZE' },
  session_pattern: { icon: Clock,         label: 'SESSION_PATTERN' },
  symbol_warning:  { icon: AlertTriangle, label: 'SYMBOL_WARNING' },
}

export const SEVERITY_COLOR = { critical: 'var(--negative-red)', warning: 'var(--warning-orange)', info: 'var(--accent-purple)' }

export function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}