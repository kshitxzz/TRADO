// ─────────────────────────────────────────────────────────────────────────
// Backtesting — Supabase access. Candles are never stored; only small rows.
// Every update/delete chains .select() and checks the result, because an RLS
// policy that matches nothing makes Supabase return success with zero rows.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabaseClient'

const LIST_COLS =
  'id,name,description,strategy,symbol,base_tf,chart_tf,start_at,end_at,start_balance,leverage,spread,status,cursor_time,time_spent_secs,created_at,updated_at'

const fail = (error, fallback) => { throw new Error(error?.message || fallback) }

// ── Sessions ─────────────────────────────────────────────────────────────
export async function listSessions(userId) {
  const { data, error } = await supabase
    .from('backtest_sessions').select(LIST_COLS)
    .eq('user_id', userId).order('updated_at', { ascending: false })
  if (error) fail(error, 'Could not load sessions')
  return data || []
}

/** Closed-trade summaries for every session (tiny rows) — drives the cards and overview. */
export async function listTradeSummaries(userId) {
  const { data, error } = await supabase
    .from('backtest_trades').select('session_id,side,pnl,opened_at,closed_at')
    .eq('user_id', userId)
  if (error) fail(error, 'Could not load trade summaries')
  return (data || []).map(r => ({ sessionId: r.session_id, side: r.side, pnl: Number(r.pnl), openedAt: Number(r.opened_at), closedAt: Number(r.closed_at) }))
}

export async function createSession(userId, p) {
  const row = {
    user_id: userId,
    name: p.name.trim(),
    description: p.description?.trim() || null,
    strategy: p.strategy?.trim() || null,
    symbol: p.symbol,
    base_tf: p.baseTf,
    chart_tf: p.baseTf,
    start_at: p.startAt,
    end_at: p.endAt,
    start_balance: p.balance,
    leverage: p.leverage,
    spread: p.spread || 0,
  }
  const { data, error } = await supabase.from('backtest_sessions').insert(row).select(LIST_COLS).single()
  if (error) fail(error, 'Could not create the session')
  return data
}

export async function getSession(id) {
  const { data, error } = await supabase.from('backtest_sessions').select('*').eq('id', id).maybeSingle()
  if (error) fail(error, 'Could not load the session')
  return data
}

export async function updateSession(id, patch) {
  const { data, error } = await supabase.from('backtest_sessions').update(patch).eq('id', id).select('id')
  if (error) fail(error, 'Could not save the session')
  if (!data?.length) fail(null, 'Save was blocked — is the backtesting migration (004) applied?')
}

export async function deleteSession(id) {
  const { data, error } = await supabase.from('backtest_sessions').delete().eq('id', id).select('id')
  if (error) fail(error, 'Could not delete the session')
  if (!data?.length) fail(null, 'Delete was blocked — is the backtesting migration (004) applied?')
}

// ── Trades ───────────────────────────────────────────────────────────────
const fromRow = (r) => ({
  id: r.trade_key, dbId: r.id, side: r.side, lots: Number(r.lots), entry: Number(r.entry), exit: Number(r.exit_price),
  sl: r.sl == null ? null : Number(r.sl), tp: r.tp == null ? null : Number(r.tp),
  openedAt: Number(r.opened_at), closedAt: Number(r.closed_at), pnl: Number(r.pnl), reason: r.reason, notes: r.notes || '',
})

export async function listTrades(sessionId) {
  const { data, error } = await supabase
    .from('backtest_trades').select('*').eq('session_id', sessionId).order('closed_at', { ascending: true })
  if (error) fail(error, 'Could not load trades')
  return (data || []).map(fromRow)
}

export async function saveTrades(userId, sessionId, trades) {
  if (!trades.length) return
  const rows = trades.map(t => ({
    session_id: sessionId, user_id: userId, trade_key: t.id, side: t.side, lots: t.lots, entry: t.entry,
    exit_price: t.exit, sl: t.sl, tp: t.tp, opened_at: t.openedAt, closed_at: t.closedAt, pnl: t.pnl, reason: t.reason,
  }))
  const { error } = await supabase.from('backtest_trades').upsert(rows, { onConflict: 'session_id,trade_key' })
  if (error) fail(error, 'Could not save the trade')
}

export async function updateTradeNotes(dbId, notes) {
  const { data, error } = await supabase.from('backtest_trades').update({ notes }).eq('id', dbId).select('id')
  if (error) fail(error, 'Could not save the note')
  if (!data?.length) fail(null, 'Note was not saved.')
}

export async function deleteTrades(sessionId) {
  const { error } = await supabase.from('backtest_trades').delete().eq('session_id', sessionId)
  if (error) fail(error, 'Could not reset trades')
}

// ── Layouts ──────────────────────────────────────────────────────────────
export async function listLayouts(userId) {
  const { data, error } = await supabase
    .from('backtest_layouts').select('id,name,data,updated_at').eq('user_id', userId).order('name')
  if (error) fail(error, 'Could not load layouts')
  return data || []
}

export async function saveLayout(userId, name, data) {
  const { data: row, error } = await supabase
    .from('backtest_layouts').upsert({ user_id: userId, name, data }, { onConflict: 'user_id,name' })
    .select('id,name,data,updated_at').single()
  if (error) fail(error, 'Could not save the layout')
  return row
}

export async function renameLayout(id, name) {
  const { data, error } = await supabase.from('backtest_layouts').update({ name }).eq('id', id).select('id')
  if (error) fail(error, 'Could not rename the layout')
  if (!data?.length) fail(null, 'Rename was blocked.')
}

export async function deleteLayout(id) {
  const { data, error } = await supabase.from('backtest_layouts').delete().eq('id', id).select('id')
  if (error) fail(error, 'Could not delete the layout')
  if (!data?.length) fail(null, 'Delete was blocked.')
}