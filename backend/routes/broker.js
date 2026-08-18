import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { supabase } from '../config/supabase.js'
import { parseImportFile, TIMEZONE_OPTIONS } from '../services/mt5Parser.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })

// ─── MetaAPI REST constants ──────────────────────────────────────────────────
const PROVISION = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
const sleep     = ms => new Promise(r => setTimeout(r, ms))

async function maProvision(path, method = 'GET', body = null) {
  const res = await fetch(`${PROVISION}${path}`, {
    method,
    headers: { 'auth-token': process.env.METAAPI_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = JSON.parse(text)?.message || msg } catch (_) {}
    const err = new Error(msg); err.status = res.status; throw err
  }
  try { return JSON.parse(text) } catch (_) { return null }
}

async function maData(region, path) {
  const base = `https://mt-client-api-v1.${region || 'new-york'}.agiliumtrade.ai`
  const res  = await fetch(`${base}${path}`, {
    headers: { 'auth-token': process.env.METAAPI_TOKEN },
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = JSON.parse(text)?.message || msg } catch (_) {}
    throw new Error(msg)
  }
  try { return JSON.parse(text) } catch (_) { return null }
}

function getSession(dateStr) {
  const h = new Date(dateStr).getUTCHours()
  if (h >= 0  && h < 8)  return 'Asian'
  if (h >= 8  && h < 13) return 'London'
  if (h >= 13 && h < 21) return 'New York'
  return 'Asian'
}

function fmtDuration(t1, t2) {
  const m = Math.round((new Date(t2) - new Date(t1)) / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// ─── POST /api/broker/verify (MT5 via MetaAPI) ────────────────────────────────
router.post('/verify', async (req, res) => {
  const { accountNumber, password, server } = req.body

  if (!accountNumber || !/^\d{5,9}$/.test(String(accountNumber).trim()))
    return res.json({ verified: false, message: 'Account number must be 5–9 digits' })
  if (!password || String(password).length < 4)
    return res.json({ verified: false, message: 'Password must be at least 4 characters' })
  if (!server || server.trim().length < 3)
    return res.json({ verified: false, message: 'Server name is required (e.g. Exness-Real 5)' })

  if (!process.env.METAAPI_TOKEN) {
    console.warn('[broker/verify] METAAPI_TOKEN not set — format check only')
    return res.json({ verified: true, fallback: true, message: 'Format verified (set METAAPI_TOKEN for real MT5 verification)' })
  }

  let accountId = null
  let region    = 'new-york'

  try {
    console.log(`[MetaAPI] Creating account for login ${accountNumber} on ${server}`)
    const account = await maProvision('/users/current/accounts', 'POST', {
      name: `trado_${String(accountNumber).trim()}_${Date.now()}`,
      type: 'cloud', login: String(accountNumber).trim(), password: String(password),
      server: server.trim(), platform: 'mt5', magic: 0, application: 'MetaApi', reliability: 'regular',
    })

    accountId = account.id
    region    = account.region || 'new-york'
    console.log(`[MetaAPI] Account created: ${accountId}, region: ${region}`)

    let connected = false
    let accountState = null

    for (let i = 0; i < 20; i++) {
      await sleep(3000)
      accountState = await maProvision(`/users/current/accounts/${accountId}`)
      const cs = accountState.connectionStatus
      const st = accountState.state
      region   = accountState.region || region
      console.log(`[MetaAPI] Poll ${i+1}/20 — state: ${st}, connection: ${cs}`)
      if (cs === 'CONNECTED' && st === 'DEPLOYED') { connected = true; break }
      if (['DEPLOY_FAILED', 'ERROR'].includes(st) || cs === 'ERROR') throw new Error('invalid_credentials')
    }

    if (!connected) throw new Error('timeout')

    let info = {}
    try {
      info = await maData(region, `/users/current/accounts/${accountId}/account-information`)
      console.log(`[MetaAPI] Got account info: ${info.broker}, balance: ${info.balance}`)
    } catch (e) {
      console.warn('[MetaAPI] Could not fetch account info:', e.message)
    }

    return res.json({
      verified: true, metaApiId: accountId, region,
      accountName: info.name || accountState?.name || `Account #${accountNumber}`,
      balance:  parseFloat((info.balance  || 0).toFixed(2)),
      equity:   parseFloat((info.equity   || 0).toFixed(2)),
      currency: info.currency || 'USD',
      broker:   info.broker   || server,
      leverage: info.leverage || null,
      server:   server.trim(),
      message: 'Account verified successfully',
    })

  } catch (err) {
    console.error('[MetaAPI verify]', err.message)
    if (accountId) {
      try {
        await maProvision(`/users/current/accounts/${accountId}/undeploy`, 'POST')
        await maProvision(`/users/current/accounts/${accountId}`, 'DELETE')
      } catch (_) {}
    }
    const msg = (err.message || '').toLowerCase()
    if (msg === 'invalid_credentials' || msg.includes('invalid') || msg.includes('password'))
      return res.json({ verified: false, message: 'Invalid login or password — check your MT5 credentials' })
    if (msg === 'timeout')
      return res.json({ verified: false, message: 'Connection timed out — check the server name and try again' })
    return res.json({ verified: false, message: 'Account details not valid — check your credentials' })
  }
})

// ─── POST /api/broker/sync-trades ─────────────────────────────────────────────
router.post('/sync-trades', async (req, res) => {
  const { metaApiId, userId, brokerAccountId, fromDate } = req.body
  if (!metaApiId || !userId || !brokerAccountId)
    return res.status(400).json({ error: 'metaApiId, userId and brokerAccountId required' })
  if (!process.env.METAAPI_TOKEN)
    return res.status(500).json({ error: 'METAAPI_TOKEN not configured' })

  try {
    const account = await maProvision(`/users/current/accounts/${metaApiId}`)
    const region  = account.region || 'new-york'
    const from = (fromDate ? new Date(fromDate) : new Date(Date.now() - 90 * 24 * 3600 * 1000)).toISOString()
    const to   = new Date().toISOString()
    const result = await maData(region, `/users/current/accounts/${metaApiId}/history-deals/time/${encodeURIComponent(from)}/${encodeURIComponent(to)}?limit=1000`)
    const deals  = result?.deals || result || []

    console.log(`[MetaAPI sync] Fetched ${deals.length} deals`)

    const positions = {}
    deals.forEach(d => {
      if (!d.positionId) return
      const skip = ['DEAL_TYPE_BALANCE','DEAL_TYPE_CREDIT','DEAL_TYPE_CHARGE','DEAL_TYPE_CORRECTION','DEAL_TYPE_BONUS']
      if (skip.includes(d.type)) return
      if (!positions[d.positionId]) positions[d.positionId] = { ins: [], outs: [] }
      if (d.entryType === 'DEAL_ENTRY_IN')  positions[d.positionId].ins.push(d)
      if (d.entryType === 'DEAL_ENTRY_OUT') positions[d.positionId].outs.push(d)
    })

    const trades = []
    Object.values(positions).forEach(pos => {
      if (!pos.outs.length) return
      const entryDeal = pos.ins[0]
      const exitDeal  = pos.outs[pos.outs.length - 1]
      const totalPnl  = pos.outs.reduce((s, d) => s + (d.profit || 0), 0)
      trades.push({
        user_id: userId, broker_account_id: brokerAccountId,
        symbol:      exitDeal.symbol,
        side:        entryDeal?.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
        size:        parseFloat((exitDeal.volume || entryDeal?.volume || 0).toFixed(2)),
        entry_price: entryDeal?.price != null ? parseFloat(Number(entryDeal.price).toFixed(5)) : null,
        exit_price:  exitDeal.price   != null ? parseFloat(Number(exitDeal.price).toFixed(5))  : null,
        pnl:         parseFloat(totalPnl.toFixed(2)),
        status:      'closed',
        session:     getSession(exitDeal.time),
        duration:    entryDeal ? fmtDuration(entryDeal.time, exitDeal.time) : null,
        opened_at:   entryDeal?.time || exitDeal.time,
        closed_at:   exitDeal.time,
        notes:       exitDeal.comment || entryDeal?.comment || null,
        source:      'mt5_sync',
      })
    })

    // Positions still running on the broker never show up in history-deals
    // (they have no DEAL_ENTRY_OUT yet) — fetch them separately so they land
    // in Open Trades instead of silently disappearing from the sync.
    let openCount = 0
    try {
      const openPositions = await maData(region, `/users/current/accounts/${metaApiId}/positions`)
      const list = Array.isArray(openPositions) ? openPositions : []
      openCount = list.length
      list.forEach(p => {
        trades.push({
          user_id: userId, broker_account_id: brokerAccountId,
          symbol:      p.symbol,
          side:        p.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL',
          size:        p.volume != null ? parseFloat(Number(p.volume).toFixed(2)) : null,
          entry_price: p.openPrice != null ? parseFloat(Number(p.openPrice).toFixed(5)) : null,
          exit_price:  null,
          pnl:         p.profit != null ? parseFloat(Number(p.profit).toFixed(2)) : (p.unrealizedProfit != null ? parseFloat(Number(p.unrealizedProfit).toFixed(2)) : null),
          status:      'open',
          session:     getSession(p.time),
          duration:    null,
          opened_at:   p.time,
          closed_at:   null,
          notes:       p.comment || null,
          source:      'mt5_sync',
        })
      })
    } catch (err) {
      // Don't fail the whole sync if the open-positions call has an issue —
      // closed history is still worth saving.
      console.error('[MetaAPI sync] Failed to fetch open positions:', err.message)
    }

    if (trades.length > 0) {
      await supabase.from('trades').delete().eq('user_id', userId).eq('broker_account_id', brokerAccountId)
      const { error } = await supabase.from('trades').insert(trades)
      if (error) throw error
    }

    await supabase.from('broker_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', brokerAccountId)

    return res.json({
      synced: trades.length,
      message: `${trades.length} real trades synced from MT5 (${trades.length - openCount} closed, ${openCount} open)`,
    })
  } catch (err) {
    console.error('[sync-trades]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/broker/connect (MT5 account) ───────────────────────────────────
router.post('/connect', async (req, res) => {
  try {
    const { userId, metaApiId, accountNumber, server, broker, balance, currency, accountName, region } = req.body
    if (!userId || !accountNumber) return res.status(400).json({ error: 'userId and accountNumber required' })

    const { data, error } = await supabase
      .from('broker_accounts')
      .upsert({
        user_id:        userId,
        account_type:   'mt5',
        broker_name:    broker      || 'MT5',
        account_number: String(accountNumber).trim(),
        server:         server      || '',
        meta_api_id:    metaApiId   || null,
        balance:        balance     || 0,
        currency:       currency    || 'USD',
        account_name:   accountName || '',
        gold_volume:    0,
        settings:       {},
      }, { onConflict: 'user_id,account_number' })
      .select().single()

    if (error) throw error
    return res.status(201).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/broker/connect-manual (Prop Firm or Live Account) ──────────────
router.post('/connect-manual', async (req, res) => {
  try {
    const { userId, accountType, accountName, settings } = req.body
    if (!userId || !accountType) return res.status(400).json({ error: 'userId and accountType required' })

    const brokerName = accountType === 'prop_firm'
      ? (settings?.firm || 'Prop Firm')
      : (settings?.broker || 'Live Account')

    const balance = accountType === 'prop_firm'
      ? (settings?.account_size || 0)
      : (settings?.initial_deposit || 0)

    const { data, error } = await supabase
      .from('broker_accounts')
      .upsert({
        user_id:        userId,
        account_type:   accountType,
        account_name:   accountName || brokerName,
        account_number: `manual_${Date.now()}`,
        broker_name:    brokerName,
        meta_api_id:    null,
        server:         '',
        balance:        balance,
        currency:       settings?.currency || 'USD',
        gold_volume:    0,
        settings:       settings || {},
      }, { onConflict: 'user_id,account_number' })
      .select().single()

    if (error) throw error
    return res.status(201).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/broker/:accountId/deposits ──────────────────────────────────────
router.get('/:accountId/deposits', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('broker_account_id', req.params.accountId)
      .order('date', { ascending: false })
      .limit(50)
    if (error) throw error
    return res.json(data || [])
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/broker/:accountId/deposits ─────────────────────────────────────
router.post('/:accountId/deposits', async (req, res) => {
  try {
    const { accountId } = req.params
    const { userId, type, amount, notes, date } = req.body

    if (!userId || !type || !amount)
      return res.status(400).json({ error: 'userId, type and amount required' })

    // Insert transaction
    const { data, error } = await supabase
      .from('deposits')
      .insert({
        user_id:           userId,
        broker_account_id: accountId,
        type,
        amount:   parseFloat(amount),
        notes:    notes || null,
        date:     date  || new Date().toISOString(),
      })
      .select().single()

    if (error) throw error

    // Recalculate balance from all transactions
    const { data: acc } = await supabase
      .from('broker_accounts').select('settings').eq('id', accountId).single()
    const { data: allTx } = await supabase
      .from('deposits').select('type, amount').eq('broker_account_id', accountId)

    const initial     = parseFloat(acc?.settings?.initial_deposit || 0)
    const totalDep    = (allTx || []).filter(d => d.type === 'deposit').reduce((s, d) => s + parseFloat(d.amount), 0)
    const totalWith   = (allTx || []).filter(d => d.type === 'withdrawal').reduce((s, d) => s + parseFloat(d.amount), 0)
    const newBalance  = initial + totalDep - totalWith

    await supabase.from('broker_accounts')
      .update({ balance: newBalance })
      .eq('id', accountId)

    return res.status(201).json({ ...data, newBalance })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/broker/:userId ──────────────────────────────────────────────────
router.get('/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('broker_accounts').select('*')
      .eq('user_id', req.params.userId).single()
    if (error && error.code !== 'PGRST116') throw error
    return res.json(data || null)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── DELETE /api/broker/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { data: acc } = await supabase
      .from('broker_accounts').select('meta_api_id, account_type').eq('id', req.params.id).single()

    if (acc?.meta_api_id && process.env.METAAPI_TOKEN) {
      try {
        await maProvision(`/users/current/accounts/${acc.meta_api_id}/undeploy`, 'POST')
        await maProvision(`/users/current/accounts/${acc.meta_api_id}`, 'DELETE')
      } catch (_) {}
    }

    await supabase.from('trades').delete().eq('broker_account_id', req.params.id)
    const { error } = await supabase.from('broker_accounts').delete().eq('id', req.params.id)
    if (error) throw error
    return res.json({ disconnected: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/broker/import/timezones ─────────────────────────────────────────
// Powers the Timezone dropdown in the File Upload UI — one source of truth
// shared between frontend and backend so the offset values always match.
router.get('/import/timezones', (_req, res) => res.json(TIMEZONE_OPTIONS))

// ─── POST /api/broker/import/parse ────────────────────────────────────────────
// Parses an uploaded MT5 HTML/CSV report and returns a PREVIEW only —
// nothing is written to the database yet (matches the "64 trades found"
// preview step in the UI before the user clicks Import).
router.post('/import/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const format = req.body.format || 'auto' // 'html' | 'csv' | 'auto'
    const tzOffsetMinutes = parseInt(req.body.timezoneOffsetMinutes, 10) || 0

    const { trades, accountInfo, warnings } = parseImportFile(
      req.file.buffer, req.file.originalname, format, tzOffsetMinutes
    )

    if (!trades.length) {
      return res.json({ trades: [], count: 0, accountInfo, warnings })
    }

    return res.json({
      trades, count: trades.length, accountInfo, warnings,
      preview: trades.slice(0, 5).map(t => ({
        symbol: t.symbol, side: t.side, size: t.size,
        pnl: t.pnl, opened_at: t.opened_at, closed_at: t.closed_at,
      })),
    })
  } catch (err) {
    console.error('[import/parse]', err)
    return res.status(500).json({ error: 'Could not parse this file — ' + err.message })
  }
})

// ─── POST /api/broker/import/confirm ──────────────────────────────────────────
// Inserts previously-parsed trades. Dedupes on (user_id, external_id) so
// re-uploading the same report (or an overlapping date range) never creates
// duplicate rows — matching trades are simply skipped.
router.post('/import/confirm', async (req, res) => {
  try {
    const { userId, brokerAccountId, trades } = req.body
    if (!userId || !brokerAccountId || !Array.isArray(trades))
      return res.status(400).json({ error: 'userId, brokerAccountId and trades[] required' })
    if (!trades.length) return res.json({ imported: 0, skipped: 0 })

    const rows = trades.map(t => ({ ...t, user_id: userId, broker_account_id: brokerAccountId }))

    // ON CONFLICT DO NOTHING via ignoreDuplicates — every parsed trade
    // always has an external_id (see mt5Parser's externalIdFor), so this
    // safely skips anything already imported without a separate lookup.
    const { data: inserted, error } = await supabase
      .from('trades')
      .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
      .select()
    if (error) throw error

    const importedCount = inserted?.length ?? 0
    await supabase.from('broker_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', brokerAccountId)

    return res.json({
      imported: importedCount,
      skipped: trades.length - importedCount,
      message: `${importedCount} trades imported${trades.length - importedCount ? `, ${trades.length - importedCount} duplicates skipped` : ''}`,
    })
  } catch (err) {
    console.error('[import/confirm]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/broker/connect-import ──────────────────────────────────────────
// Creates (or reuses) the broker_account row for a fresh CSV/HTML-import
// account — used by the Accounts onboarding "Import CSV/HTML" card.
router.post('/connect-import', async (req, res) => {
  try {
    const { userId, accountNumber, broker, server, currency, accountName } = req.body
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const { data, error } = await supabase
      .from('broker_accounts')
      .upsert({
        user_id:        userId,
        account_type:   'mt5',
        sync_method:    'import',
        broker_name:    broker || 'MT5',
        account_number: accountNumber ? String(accountNumber).trim() : `import_${Date.now()}`,
        server:         server || '',
        currency:       currency || 'USD',
        account_name:   accountName || '',
        gold_volume:    0,
        settings:       {},
      }, { onConflict: 'user_id,account_number' })
      .select().single()

    if (error) throw error
    return res.status(201).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/broker/ea/setup ────────────────────────────────────────────────
// Creates/updates the broker_account for EA-based real-time sync and issues
// a unique sync token. No password is collected or transmitted — the EA
// runs inside the user's already-logged-in MT5 terminal and only needs this
// token to identify which Trado account to push trades to.
router.post('/ea/setup', async (req, res) => {
  try {
    const { userId, accountNumber, server, broker } = req.body
    if (!userId || !accountNumber) return res.status(400).json({ error: 'userId and accountNumber required' })

    const token = crypto.randomBytes(24).toString('hex')

    const { data, error } = await supabase
      .from('broker_accounts')
      .upsert({
        user_id:          userId,
        account_type:     'mt5',
        sync_method:      'ea',
        broker_name:      broker || 'MT5',
        account_number:   String(accountNumber).trim(),
        server:           server || '',
        ea_token:         token,
        gold_volume:      0,
        settings:         {},
        // A fresh Sync Key means no EA has used it yet — always reset these,
        // even if this account_number was connected before, so the UI can't
        // show "EA connected" off a stale ping from an earlier token/session.
        last_ea_ping_at:  null,
        last_synced_at:   null,
      }, { onConflict: 'user_id,account_number' })
      .select().single()

    if (error) throw error

    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`
    return res.status(201).json({
      account: data,
      token,
      webhookUrl: `${backendUrl}/api/broker/ea/sync`,
      eaDownloadUrl: `${backendUrl}/ea/TradoSync.mq5`,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/broker/ea/sync ─────────────────────────────────────────────────
// Called by the MQL5 Expert Advisor running inside the user's MT5 terminal.
// Auth is the ea_token (not a Supabase session — MT5 can't hold one), sent
// in the JSON body since MQL5's WebRequest header support is limited.
router.post('/ea/sync', async (req, res) => {
  try {
    const { token, accountInfo, deals, openPositions } = req.body
    if (!token) return res.status(401).json({ error: 'Missing token' })

    const { data: tokenRow, error: findErr } = await supabase
      .from('broker_accounts').select('*').eq('ea_token', token).single()
    if (findErr || !tokenRow) return res.status(401).json({ error: 'Invalid sync token' })

    let account = tokenRow

    // A Sync Key identifies the user it was issued to, not one fixed
    // account — so switching MT5 logins within a single terminal (same
    // chart, same EA, same key) is expected, not an error. Route this ping
    // to whichever account the terminal is actually logged into right now,
    // auto-provisioning it the first time this login is ever seen so the
    // user never has to manually "Connect MT5 Account" for it first.
    // Older EA builds that don't send `login` yet fall back to the
    // account this token was originally issued for.
    if (accountInfo?.login != null && String(accountInfo.login) !== String(tokenRow.account_number)) {
      const loginStr = String(accountInfo.login)
      const { data: existing } = await supabase
        .from('broker_accounts').select('*')
        .eq('user_id', tokenRow.user_id).eq('account_number', loginStr).maybeSingle()

      if (existing) {
        account = existing
      } else {
        // ea_token has a UNIQUE index — generate a fresh one for the new
        // row rather than reusing the incoming key (which stays valid and
        // keeps resolving to `tokenRow.user_id` for future switches).
        const { data: created, error: createErr } = await supabase
          .from('broker_accounts')
          .insert({
            user_id:        tokenRow.user_id,
            account_type:   'mt5',
            sync_method:    'ea',
            account_number: loginStr,
            broker_name:    accountInfo.broker || 'MT5',
            server:         accountInfo.server || '',
            ea_token:       crypto.randomBytes(24).toString('hex'),
            gold_volume:    0,
            settings:       {},
          })
          .select().single()
        if (createErr) throw createErr
        account = created
      }
    }

    const trades = []

    // Closed deals — each element is { positionId, symbol, side, volume,
    // openPrice, closePrice, openTime, closeTime, commission, swap, profit, comment }
    for (const d of (deals || [])) {
      if (!d.symbol || !d.closeTime) continue
      const netProfit = (d.profit || 0) + (d.commission || 0) + (d.swap || 0)
      trades.push({
        symbol: String(d.symbol).toUpperCase(),
        side: d.side === 'SELL' ? 'SELL' : 'BUY',
        size: parseFloat((d.volume || 0).toFixed(2)),
        entry_price: d.openPrice  != null ? parseFloat(Number(d.openPrice).toFixed(5))  : null,
        exit_price:  d.closePrice != null ? parseFloat(Number(d.closePrice).toFixed(5)) : null,
        pnl: parseFloat(netProfit.toFixed(2)),
        status: 'closed',
        opened_at: d.openTime,
        closed_at: d.closeTime,
        notes: d.comment || null,
        source: 'ea_sync',
        external_id: `mt5_${d.positionId}`,
        user_id: account.user_id,
        broker_account_id: account.id,
      })
    }

    for (const p of (openPositions || [])) {
      if (!p.symbol) continue
      trades.push({
        symbol: String(p.symbol).toUpperCase(),
        side: p.side === 'SELL' ? 'SELL' : 'BUY',
        size: p.volume != null ? parseFloat(Number(p.volume).toFixed(2)) : null,
        entry_price: p.openPrice != null ? parseFloat(Number(p.openPrice).toFixed(5)) : null,
        exit_price: null, pnl: parseFloat((p.profit || 0).toFixed(2)),
        status: 'open',
        opened_at: p.openTime, closed_at: null,
        notes: p.comment || null,
        source: 'ea_sync',
        external_id: `mt5_${p.positionId}`,
        user_id: account.user_id,
        broker_account_id: account.id,
      })
    }

    // Authoritative backfill signal: has this account ever been told to
    // do a full history pull? Tracked explicitly rather than inferred from
    // "does it have zero trades on file" — that heuristic breaks the moment
    // even one partial (recent-only) sync lands, since the count is never
    // zero again afterward, so it would only ever fire once and then get
    // silently stuck if that first attempt landed before this account had
    // a chance to actually backfill (e.g. old EA build, or the flag inside
    // MT5 was already set from an earlier session on this login).
    const needsBackfill = account.history_backfilled !== true

    let imported = 0
    if (trades.length) {
      // Upsert on (user_id, external_id): a position pushed while still open
      // gets replaced by its closed version once it's finished, instead of
      // creating a second row.
      const { error } = await supabase
        .from('trades')
        .upsert(trades, { onConflict: 'user_id,external_id', ignoreDuplicates: false })
      if (error) throw error
      imported = trades.length
    }

    await supabase.from('broker_accounts').update({
      last_synced_at:  new Date().toISOString(),
      last_ea_ping_at: new Date().toISOString(),
      last_ea_error:    null,
      last_ea_error_at: null,
      balance:  accountInfo?.balance  ?? account.balance,
      equity:   accountInfo?.equity   ?? account.equity,
      currency: accountInfo?.currency ?? account.currency,
      broker_name: accountInfo?.broker ?? account.broker_name,
      // Only flip this once we've actually told the EA to backfill — if the
      // EA build is old and never reads/acts on needsBackfill, this stays
      // false and we correctly keep asking on every subsequent sync too.
      ...(needsBackfill ? { history_backfilled: true } : {}),
    }).eq('id', account.id)

    return res.json({ synced: imported, message: `${imported} trades synced`, needsBackfill })
  } catch (err) {
    console.error('[ea/sync]', err)
    return res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/broker/ea/status/:brokerAccountId ───────────────────────────────
// Lets the UI show "EA connected ✓ — last ping 2m ago" without waiting for
// a full trade sync.
router.get('/ea/status/:brokerAccountId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('broker_accounts')
      .select('last_ea_ping_at, last_synced_at, ea_token, last_ea_error, last_ea_error_at')
      .eq('id', req.params.brokerAccountId).single()
    if (error) throw error

    // The EA pings on every tick (throttled to a ~1s floor) with a 5s timer
    // fallback in quiet periods — 10 minutes was hiding failures for far
    // too long behind a stale "still connected" badge. 20s comfortably
    // covers the timer fallback with margin for network hiccups.
    const connected = !!data.last_ea_ping_at &&
      (Date.now() - new Date(data.last_ea_ping_at).getTime()) < 20 * 1000

    // Surface a recent failed sync attempt even if an earlier ping still
    // falls inside the "connected" window — a live mismatch/error happening
    // right now shouldn't be masked by a stale success from before it started.
    const errorIsRecent = !!data.last_ea_error_at &&
      (Date.now() - new Date(data.last_ea_error_at).getTime()) < 2 * 60 * 1000

    return res.json({
      connected,
      lastPing:  data.last_ea_ping_at,
      lastSynced: data.last_synced_at,
      error:     errorIsRecent ? data.last_ea_error : null,
      errorAt:   errorIsRecent ? data.last_ea_error_at : null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

export default router