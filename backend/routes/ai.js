import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { GoogleGenAI } from '@google/genai'

const router = Router()
const AI_LIMITER = rateLimit({ windowMs: 60_000, max: 20, message: { error: 'AI rate limit' } })

// Gemini retires model IDs on a rolling basis (see ai.google.dev/gemini-api/docs/deprecations).
// PRIMARY is a mature, well-tested model for structured JSON output. FALLBACK is a lighter
// Gemini 3.x model with a long support runway, used if PRIMARY looks retired/unavailable.
// (gemini-3.5-flash was deliberately avoided here: it has documented issues producing large
// structured JSON reliably — see githubusercontent googleapis/js-genai#1619 — and it drops
// support for the temperature/topP/topK params entirely.)
const PRIMARY_MODEL  = 'gemini-2.5-flash'
const FALLBACK_MODEL = 'gemini-3.1-flash-lite'

function classifyError(message = '') {
  if (/503|UNAVAILABLE|overloaded|high demand/i.test(message))                     return 'overloaded'
  if (/404|not found|no longer available|is not supported for/i.test(message))     return 'model_unavailable'
  if (/api key|api_key|unauthenticated|permission.?denied|401|403/i.test(message)) return 'invalid_key'
  if (/quota|429|rate.?limit|resource.?exhausted/i.test(message))                  return 'quota_exceeded'
  return 'api_error'
}

function humanizeError(reason, message) {
  switch (reason) {
    case 'invalid_key':       return 'Gemini rejected the API key — check GEMINI_API_KEY in the backend .env.'
    case 'quota_exceeded':    return 'Gemini quota or rate limit reached — try again shortly.'
    case 'model_unavailable': return 'The configured Gemini models are currently unavailable (they may have been retired).'
    case 'overloaded':        return "Gemini's servers are overloaded with traffic right now on all configured models — this is temporary and unrelated to your API key. Try again shortly."
    case 'parse_error':       return 'Gemini responded, but the reply got cut off or malformed before it could be read as JSON — try Regenerate.'
    default:                  return `Gemini request failed: ${message}`
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Gemini 2.5 and 3.x models "think" before answering by default, and those
// reasoning tokens are deducted from maxOutputTokens — on non-trivial prompts
// thinking can silently consume 90%+ of the budget, leaving little/nothing
// for the actual answer (this is what was truncating/mangling our JSON).
// Since our prompts are narration over facts we already computed, not
// multi-step reasoning, thinking effort is capped to (near-)zero. The two
// model families use incompatible knobs for this, hence the branch below.
function modelConfig(model, { json, temperature, maxOutputTokens }) {
  const config = {}
  if (json) config.responseMimeType = 'application/json'
  if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens

  if (model.startsWith('gemini-3')) {
    // Gemini 3.x: temperature/topP/topK are deprecated in favor of thinkingLevel.
    config.thinkingConfig = { thinkingLevel: 'low' }
  } else {
    if (temperature != null) config.temperature = temperature
    config.thinkingConfig = { thinkingBudget: 0 } // fully disable thinking
  }
  return config
}

async function attemptOnce(model, apiKey, prompt, config) {
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({ model, contents: prompt, config })
  return { text: response.text, finishReason: response.candidates?.[0]?.finishReason }
}

// Single call point for every Gemini request in this file. Always resolves
// (never throws) with either { ok:true, text } or { ok:false, reason, message }
// so every route can hand the frontend an honest, structured "AI unavailable"
// signal instead of guessing from an HTTP status code.
//
// Retry strategy: a 503/"high demand" error is transient server-side overload,
// not a real failure — it's retried once on the SAME model before falling
// back to a different model. Auth/quota errors are not retried at all since
// no amount of retrying fixes those.
async function callGemini(prompt, { json = false, temperature = 0.6, maxOutputTokens } = {}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { ok: false, reason: 'no_api_key', message: 'No Gemini API key is configured on the server (GEMINI_API_KEY is missing).' }

  let lastErr = null
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    const config = modelConfig(model, { json, temperature, maxOutputTokens })
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { text, finishReason } = await attemptOnce(model, apiKey, prompt, config)
        if (!text) { lastErr = new Error(`Empty response from Gemini (finishReason: ${finishReason || 'unknown'})`); break }
        return { ok: true, text, model, finishReason }
      } catch (err) {
        lastErr = err
        const reason = classifyError(err.message)
        console.error(`[Gemini ${model} attempt ${attempt + 1} failed: ${reason}]`, err.message)
        if (reason === 'overloaded' && attempt === 0) {
          await sleep(1000)
          continue // quick retry on the same model — spikes are usually brief
        }
        if (reason === 'invalid_key' || reason === 'quota_exceeded') {
          return { ok: false, reason, message: humanizeError(reason, err.message) } // retrying won't help
        }
        break // try the next model
      }
    }
  }

  const reason = classifyError(lastErr?.message || '')
  return { ok: false, reason, message: humanizeError(reason, lastErr?.message || 'unknown error') }
}

// Strips markdown fences and, if that alone doesn't parse, falls back to
// extracting the first {...} block in case the model added stray preamble.
function parseJsonLoose(text) {
  const clean = text.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch { /* fall through */ }
  const match = clean.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch { /* fall through */ } }
  return null
}


function formatPnl(val) { return (parseFloat(val) || 0) >= 0 ? `+$${Math.abs(val).toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}` }
function formatPct(val) { return `${(parseFloat(val) || 0).toFixed(1)}%` }

function buildTradeContext(trades = []) {
  const closed = trades.filter(t => t.status === 'closed')
  const wins   = closed.filter(t => t.pnl > 0)
  const losses = closed.filter(t => t.pnl < 0)
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate  = closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : 0
  const avgWin   = wins.length   ? (wins.reduce((s,t) => s+t.pnl, 0) / wins.length).toFixed(2) : 0
  const avgLoss  = losses.length ? (Math.abs(losses.reduce((s,t) => s+t.pnl, 0)) / losses.length).toFixed(2) : 0

  const bySymbol = {}
  closed.forEach(t => {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { pnl:0, count:0 }
    bySymbol[t.symbol].pnl += t.pnl; bySymbol[t.symbol].count++
  })
  const topPairs = Object.entries(bySymbol).sort((a,b)=>b[1].pnl-a[1].pnl).slice(0,3).map(([s,v])=>`${s}(${formatPnl(v.pnl)})`).join(', ')

  return {
    summary: `${closed.length} closed trades. Win rate: ${winRate}%. Total PnL: ${formatPnl(totalPnl)}. Avg win: $${avgWin}, Avg loss: $${avgLoss}. Top pairs: ${topPairs}.`,
    rawSample: closed.slice(0,10).map(t => `${t.symbol} ${t.side} P&L:${t.pnl?.toFixed(2)} ${t.strategy||''} ${t.session||''} ${t.duration||''}`).join('\n')
  }
}

// ── Trade DNA (single trade) helpers ────────────────────────────────────
// Builds the grounded facts sheet Gemini narrates for the /trade-insight
// route below — same philosophy as buildTradeContext above, but scoped to
// exactly one trade instead of the whole account.
function buildTradeInsightFacts(trade, quality) {
  const lines = []
  const size = trade.size ?? trade.quantity ?? '—'
  const durationMin = trade.duration_seconds != null ? Math.round(trade.duration_seconds / 60)
    : (trade.opened_at && trade.closed_at) ? Math.round((new Date(trade.closed_at) - new Date(trade.opened_at)) / 60000)
    : null

  lines.push(`TRADE: ${trade.symbol} ${(trade.side || '').toUpperCase()}, entry $${trade.entry_price}, exit ${trade.exit_price != null ? `$${trade.exit_price}` : 'still open'}, size ${size}, P&L ${formatPnl(trade.pnl)}${durationMin != null ? `, held ${durationMin} min` : ''}.`)

  if (trade.rr_risk != null && trade.rr_reward != null && Number(trade.rr_risk) > 0) {
    lines.push(`RISK:REWARD PLANNED: ${trade.rr_risk} : ${trade.rr_reward} (targeting ${(Number(trade.rr_reward) / Number(trade.rr_risk)).toFixed(2)}x the amount risked).`)
  }

  if (quality) {
    lines.push(`TRADE QUALITY SCORE: ${quality.total}/100 (${quality.grade}) — Profitability ${quality.profitability}/30, Execution ${quality.execution}/40 (${quality.checklistChecked}/${quality.checklistTotal} checklist items completed), Journal completeness ${quality.journal}/20, Self-rating ${quality.rating}/10.`)
  }

  const checklist = Array.isArray(trade.execution_checklist) ? trade.execution_checklist : []
  if (checklist.length) lines.push('EXECUTION CHECKLIST: ' + checklist.map(c => `${c.checked ? '✓' : '✗'} ${c.label}`).join('; ') + '.')

  lines.push(trade.pre_trade_analysis?.trim() ? `PRE-TRADE ANALYSIS (trader's own words): "${trade.pre_trade_analysis.trim()}"` : 'PRE-TRADE ANALYSIS: not journaled.')
  lines.push(trade.post_trade_review?.trim()  ? `POST-TRADE REVIEW (trader's own words): "${trade.post_trade_review.trim()}"`   : 'POST-TRADE REVIEW: not journaled.')
  lines.push(trade.emotions?.trim()           ? `EMOTIONS LOGGED: "${trade.emotions.trim()}"`                                  : 'EMOTIONS: not logged.')
  lines.push(trade.lessons_learned?.trim()    ? `LESSONS LEARNED (trader's own words): "${trade.lessons_learned.trim()}"`      : 'LESSONS LEARNED: not logged.')
  if (trade.journal_tags?.length) lines.push(`TAGS: ${trade.journal_tags.join(', ')}.`)

  return lines.join('\n')
}

// Converts the trade's stored screenshot data-URLs into Gemini `inlineData`
// parts. Capped at 3 images to keep the request fast and reasonably priced;
// anything not a recognizable base64 image data-URL is silently skipped.
function extractImageParts(screenshots = []) {
  const parts = []
  for (const s of Array.isArray(screenshots) ? screenshots.slice(0, 3) : []) {
    if (typeof s !== 'string') continue
    const match = s.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/)
    if (!match) continue
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
  }
  return parts
}

// ── POST /api/ai/insights ── Legacy scopes — kept for Dashboard.jsx's
// `trade_score_take` card, which already degrades gracefully to nothing
// if `content` comes back empty, so no frontend change needed there.
router.post('/insights', AI_LIMITER, async (req, res) => {
  const { scope = 'weekly_summary', trades = [], axes = null, overall = null } = req.body
  const ctx = buildTradeContext(trades)
  const axesLine = axes ? Object.entries(axes).map(([k,v]) => `${k}: ${v}/100`).join(', ') : ''

  const PROMPTS = {
    weekly_summary: `You are an expert trading coach. Analyze this trader's weekly performance and give 3–4 specific, actionable insights.

Trading data:
${ctx.summary}

Recent trades:
${ctx.rawSample}

Write a concise, insightful weekly summary (150–200 words). Be direct, specific, and practical. Focus on patterns you notice, what's working, and 1 concrete improvement suggestion. Do not use bullet points — write as flowing paragraphs.`,

    behavioral_score: `You are a trading psychologist. Rate this trader's behavior across these dimensions (0–100): discipline, riskManagement, consistency, patience, emotionalControl, strategyAdherence, timing, positionSizing, adaptability, selfAwareness.

Trading data:
${ctx.summary}

Respond ONLY with a JSON object like: {"discipline":72,"riskManagement":85,...}`,

    pattern_detection: `You are a quant analyst. Identify behavioral patterns in this trader's history.

${ctx.summary}

Trades:
${ctx.rawSample}

List 2–3 specific, data-backed behavioral patterns. Format: Pattern name | Observation | Impact | Suggestion. Keep each under 30 words.`,

    trade_score_take: `You are a sharp, encouraging trading coach. A trader's Trade Score has just been computed (0–100 per dimension) directly from their real trade history: ${axesLine}. Overall: ${overall}/100.

Trading data:
${ctx.summary}

In ONE short sentence (under 22 words), call out their single biggest strength or weakness right now. Be specific and reference an actual dimension or number. No preamble, no quotes, just the sentence.`,
  }

  const prompt = PROMPTS[scope] || PROMPTS.weekly_summary
  const wantsJson = scope === 'behavioral_score'
  const result = await callGemini(prompt, { json: wantsJson, temperature: 0.5 })

  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message })

  if (scope === 'behavioral_score') {
    const parsed = parseJsonLoose(result.text)
    if (!parsed) {
      console.error('[Gemini JSON parse failed: behavioral_score] raw:', result.text.slice(0, 500))
      return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error') })
    }
    return res.json({ aiAvailable: true, scores: parsed })
  }

  res.json({ aiAvailable: true, content: result.text, scope })
})

// ── POST /api/ai/chat ── Free-form AI coach chat
router.post('/chat', AI_LIMITER, async (req, res) => {
  const { message, tradeContext = [], conversationHistory = [] } = req.body
  const ctx = buildTradeContext(tradeContext)

  const systemCtx = `You are Trado AI — an expert, empathetic trading coach.
You have access to this trader's real data:
${ctx.summary}

Be concise, specific, and helpful. Use the trader's actual data when answering. If you don't have enough data, say so. Never make up numbers.

LANGUAGE — critical: respond in the SAME language (and the same casual/formal tone) as the user's latest message below. If they write in Hindi, reply in Hindi. If they write in Hinglish (a Hindi-English mix, e.g. "yaar mujhe nahi pata mai kaha galti krr raha hu"), reply in that same natural Hinglish mix — don't switch to pure English or pure Hindi. If they write in English, reply in English. Match whatever language or mix they use, every message, even if it changes partway through the conversation.`

  const history = conversationHistory.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Trado AI'}: ${m.text}`).join('\n')
  const fullPrompt = `${systemCtx}\n\n${history}\nUser: ${message}\nTrado AI:`

  const result = await callGemini(fullPrompt, { temperature: 0.7, maxOutputTokens: 800 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message })
  res.json({ aiAvailable: true, content: result.text })
})

// ── POST /api/ai/trade-dna ── Trading archetype, grounded in pre-computed
// context — Gemini only ever names/describes, never computes a figure.
router.post('/trade-dna', AI_LIMITER, async (req, res) => {
  const { trades = [], context = {} } = req.body
  const ctx = buildTradeContext(trades)

  const factsLine = [
    context.topSymbol ? `Most-traded symbol: ${context.topSymbol}` : null,
    context.topSessionByProfit ? `Most profitable session: ${context.topSessionByProfit}` : null,
    context.avgDurationMin != null ? `Average hold time: ${context.avgDurationMin.toFixed(1)} minutes` : null,
    context.riskProfile ? `Position-sizing risk profile: ${context.riskProfile}` : null,
    context.tradeFrequency ? `Trade frequency: ${context.tradeFrequency} (${(context.tradesPerDay||0).toFixed(1)} trades/day)` : null,
  ].filter(Boolean).join('. ')

  const prompt = `You are a trading coach naming a trader's archetype. Use ONLY the facts given below — do not invent or recalculate any numbers.

Facts: ${factsLine}
Overall stats: ${ctx.summary}

Respond ONLY with JSON:
{
  "archetype": "e.g. Momentum Scalper (2-4 words)",
  "subtitle": "e.g. London Session Specialist (short, references a real fact above)",
  "description": "2 sentences describing their style and edge, referencing the facts above by name — do not state any number not given above",
  "tags": ["tag1","tag2","tag3","tag4"]
}`

  const result = await callGemini(prompt, { json: true, temperature: 0.6, maxOutputTokens: 600 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    console.error('[Gemini JSON parse failed: trade-dna] raw:', result.text.slice(0, 500))
    return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error') })
  }
  res.json({ aiAvailable: true, ...parsed })
})

// ── Fact-block builder for /behavioral-analysis ─────────────────────────
// Converts the frontend's pre-computed analytics bundle into a plain-text
// "facts sheet" that gets dropped into the Gemini prompt verbatim. Nothing
// here is calculated by the model — it only ever narrates these lines.
function buildFactsBlock(context = {}) {
  const lines = []
  const { overall, week, risk, patterns = [], tradeScore } = context

  if (overall) lines.push(
    `OVERALL: ${overall.tradeCount} closed trades, win rate ${formatPct(overall.winRate)}, profit factor ${(overall.profitFactor||0).toFixed(2)}, total P&L ${formatPnl(overall.totalPnl)}, current streak: ${overall.streak} ${overall.streakType}${overall.streak===1?'':'s'} in a row.`
  )

  if (tradeScore) lines.push(
    `TRADE SCORE: overall ${tradeScore.overall}/100. ` +
    (tradeScore.axes||[]).map(a => `${a.dimension}: ${a.value}/100`).join(', ') + '.'
  )

  if (week) lines.push(
    `THIS WEEK (${week.rangeLabel}): ${week.tradeCount} trades over ${week.tradingDays} trading day(s), avg ${week.avgPerDay.toFixed(1)}/day. ` +
    `P&L ${formatPnl(week.totalPnl)} (${week.pnlDeltaPct==null?'no prior week to compare':`${week.pnlDeltaPct>=0?'+':''}${week.pnlDeltaPct.toFixed(1)}% vs last week`}). ` +
    `Win rate ${formatPct(week.winRate)}${week.wrDeltaPts==null?'':` (${week.wrDeltaPts>=0?'+':''}${week.wrDeltaPts.toFixed(1)}pp vs last week)`}. ` +
    `Avg win ${formatPnl(week.avgWin)}, avg loss ${formatPnl(week.avgLoss)}, R:R ${week.rr.toFixed(2)}:1. ` +
    `Largest win ${formatPnl(week.bestTrade)}, largest loss ${formatPnl(week.worstTrade)}. ` +
    (week.bestDay ? `Best day ${week.bestDay.date} at ${formatPnl(week.bestDay.pnl)}. ` : '') +
    (week.mostTraded ? `Most traded: ${week.mostTraded}. ` : '') +
    (week.mostProfitable ? `Most profitable symbol: ${week.mostProfitable.symbol} (${formatPnl(week.mostProfitable.pnl)}). ` : '') +
    (week.avgDurationMin != null ? `Avg hold time ${week.avgDurationMin.toFixed(0)} min. ` : '') +
    (week.longWinRate != null ? `Long win rate ${formatPct(week.longWinRate)}. ` : '') +
    (week.shortWinRate != null ? `Short win rate ${formatPct(week.shortWinRate)}. ` : '') +
    `Weekly process score: ${week.processScore}/100 (grade ${week.grade}) — this reflects HOW they traded (discipline, sizing, consistency), not just the P&L outcome.`
  )

  if (risk) lines.push(
    `RISK BREAKDOWN: Emotional ${risk.emotional}/100, Sizing ${risk.sizing}/100, Consistency ${risk.consistency}/100, Discipline ${risk.discipline}/100. ` +
    `Supporting facts — revenge trades: ${risk.facts.revengeTradeCount} (cost ${formatPnl(risk.facts.revengeTradeCost)}, window ${risk.facts.revengeWindowMin}min, ${risk.facts.revengeSizeEscalations} with size-up). ` +
    `Journaled ${risk.facts.journaledCount}/${risk.facts.closedCount} trades (${formatPct(risk.facts.journaledRate)}). ` +
    (risk.facts.avgRating != null ? `Avg self-rating ${risk.facts.avgRating.toFixed(1)}/10. ` : 'No self-ratings logged yet. ') +
    (risk.facts.avgChecklistCompletion != null ? `Avg pre-trade checklist completion ${formatPct(risk.facts.avgChecklistCompletion)}.` : 'No checklist data yet.')
  )

  if (patterns.length) {
    lines.push('DETECTED PATTERNS (only narrate the ones listed — do not invent others):')
    patterns.forEach(p => {
      const f = p.facts || {}
      lines.push(`- [id:${p.id}] ${p.title} — ` + Object.entries(f).map(([k,v]) => {
        if (typeof v === 'number') {
          if (/pnl|cost/i.test(k)) return `${k}: ${formatPnl(v)}`
          if (/rate|concentration|cov/i.test(k)) return `${k}: ${formatPct(v)}`
          return `${k}: ${v}`
        }
        return `${k}: ${v}`
      }).join(', '))
    })
  }

  return lines.join('\n')
}

// ── POST /api/ai/behavioral-analysis ── The main Trado AI engine.
// Frontend sends pre-computed, real stats; Gemini narrates them into
// deep coaching copy. All numbers shown in the UI come from the
// deterministic analytics engine (lib/analytics.js) — this endpoint
// never supplies a figure the frontend doesn't already have.
router.post('/behavioral-analysis', AI_LIMITER, async (req, res) => {
  const { context = {} } = req.body
  const empty = { overviewCards: [], weeklyAnalysis: null, riskNarrative: null, patterns: [] }

  if (!context.overall || context.overall.tradeCount === 0) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Not enough closed trades yet to analyze.', ...empty })
  }

  const facts = buildFactsBlock(context)

  const prompt = `You are Trado AI — a sharp, direct trading performance coach. Below is a FACTS SHEET computed from a real trader's actual trade and journal history. Every number in it is already correct and final.

RULES (critical):
- Use ONLY the numbers in the facts sheet. NEVER calculate, estimate, or invent a number that isn't given.
- Go beyond restating numbers: connect at least two different facts together into a real insight (e.g. tie session performance to sizing behavior, or revenge trades to the weekly grade). A sharp coach explains the story behind the numbers, not just the numbers themselves.
- Be specific — cite the exact figures given (dollar amounts, percentages, counts) inside your sentences, the way a sharp coach would.
- Be direct and a little blunt where warranted — call out bad process even if P&L was positive, and credit good process even in a losing stretch.
- No generic filler like "keep up the good work" without a specific reason tied to a number above.
- Keep every string SHORT except the weekly paragraph: 1–2 sentences max per field unless noted otherwise.
- For the letter grade: the facts sheet gives you a formula-computed process score/grade as a *starting point* — don't just echo it. Use your own judgment as a coach across ALL the facts given (discipline, sizing, revenge trades, journaling, sample size, etc.) to assign the grade you actually believe is right, and justify it in the paragraph. It's fine to agree with the formula, but don't do so by default — decide for yourself.

FACTS SHEET:
${facts}

Respond ONLY with valid JSON (no markdown fences, no preamble), matching this exact shape:
{
  "overviewCards": [
    { "severity": "positive|warning|info", "type": "SHORT LABEL", "title": "short headline", "text": "1-2 sentences citing real numbers" }
    // exactly 3 cards: one strength, one risk, one edge/opportunity
  ],
  "weeklyAnalysis": {
    "grade": "your own letter grade for this week's PROCESS (not just P&L) — must be exactly one of: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, F",
    "paragraph": "4-6 sentences of DEEP analysis: don't just restate the stats — explain what they mean together, justify the grade you chose above, and give the single highest-leverage fix right now. Blunt coach voice.",
    "highlights": ["short bullet citing a number", "..."],
    "areasToImprove": ["short bullet citing a number", "..."]
    // 2-4 items each
  },
  "riskNarrative": {
    "strengths": ["short bullet citing a real number from RISK BREAKDOWN or OVERALL", "..."],
    "areasToImprove": ["short bullet citing a real number, phrased as current -> target with why", "..."]
    // 2-3 items each
  },
  "patterns": [
    { "id": "must exactly match one of the [id:...] tags in DETECTED PATTERNS above", "text": "1-2 sentences citing the pattern's facts, plus the 'so what' — why it matters" }
    // one entry per detected pattern given, same order
  ]
}

If OVERALL trade count is under 5, keep everything short and focus on "not enough data yet" framing rather than strong claims.`

  const result = await callGemini(prompt, { json: true, temperature: 0.65, maxOutputTokens: 3000 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    const cutOff = result.finishReason === 'MAX_TOKENS'
    console.error(`[Gemini JSON parse failed: behavioral-analysis, finishReason=${result.finishReason}] raw:`, result.text.slice(0, 800))
    return res.json({
      aiAvailable: false, reason: 'parse_error',
      message: cutOff ? "Gemini's response was cut off before finishing — try Regenerate." : humanizeError('parse_error'),
      ...empty,
    })
  }
  res.json({ aiAvailable: true, ...empty, ...parsed })
})

// ── POST /api/ai/trade-insight ── Per-trade "Trade DNA" analysis. Scoped to
// ONE trade only (never the trader's broader history) — grounded in the
// deterministic facts sheet built above, plus that trade's own screenshots
// (if any) for qualitative visual context.
router.post('/trade-insight', AI_LIMITER, async (req, res) => {
  const { trade = null, qualityScore = null } = req.body
  const empty = {
    grade: null, verdict: null, summary: null, riskManagement: null, psychology: null,
    strengths: [], improvements: [], keyTakeaway: null, screenshotObservations: null,
  }

  if (!trade || trade.pnl == null || !trade.symbol) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Not enough trade data to analyze.', ...empty })
  }

  const facts = buildTradeInsightFacts(trade, qualityScore)
  const imageParts = extractImageParts(trade.screenshots)

  const promptText = `You are Trado AI, reviewing ONE SPECIFIC trade for a retail trader — a single-trade autopsy, not a review of their overall history. Everything in the FACTS SHEET below is already computed and true; the trader's own journal words are quoted directly where present.

RULES (critical):
- Use ONLY the numbers in the facts sheet. Never invent or recompute a number.
- Reference the specific numbers, the R:R, and the trader's own journal words throughout — be concrete, not generic.
- Explicitly cover risk management (position sizing / R:R quality / stop discipline) and execution quality.
- If a journal field is marked "not journaled" / "not logged", say so plainly and treat it as a real gap — never invent what the trader might have felt or thought.
${imageParts.length
    ? '- One or more chart screenshots from this trade are attached. Use them ONLY for qualitative visual context (candle structure, where the entry/exit sits on the chart, visible support/resistance/trend). Never state a specific price or number from the image — you cannot read exact values reliably from a screenshot, so stick to the numbers already in the facts sheet for anything numeric.'
    : '- No chart screenshot was provided for this trade — do not reference any chart visuals, and omit "screenshotObservations" entirely.'}
- Tone: a sharp, direct coach reviewing game film. No filler, no generic trading-education platitudes.

FACTS SHEET:
${facts}

Respond ONLY with valid JSON (no markdown fences), matching exactly:
{
  "grade": "single letter grade for THIS trade only — one of: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, F",
  "verdict": "3-6 word headline capturing the essence of this trade",
  "summary": "2-4 sentences: what happened and the overall verdict on this specific trade",
  "riskManagement": "2-3 sentences on position sizing / R:R / stop discipline, citing the actual numbers given",
  "psychology": "2-3 sentences on emotional state and discipline based on the journal fields — explicitly note if data is missing",
  "strengths": ["short bullet", "up to 3"],
  "improvements": ["short bullet", "up to 3"],
  "keyTakeaway": "one sentence — the single most important lesson to carry into the next trade"${imageParts.length ? ',\n  "screenshotObservations": "1-2 sentences on what the chart screenshot shows qualitatively"' : ''}
}`

  const contents = imageParts.length ? [...imageParts, promptText] : promptText
  const result = await callGemini(contents, { json: true, temperature: 0.6, maxOutputTokens: 1300 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    const cutOff = result.finishReason === 'MAX_TOKENS'
    console.error(`[Gemini JSON parse failed: trade-insight, finishReason=${result.finishReason}] raw:`, result.text.slice(0, 500))
    return res.json({
      aiAvailable: false, reason: 'parse_error',
      message: cutOff ? "Gemini's response was cut off before finishing — try Regenerate." : humanizeError('parse_error'),
      ...empty,
    })
  }
  res.json({ aiAvailable: true, ...empty, ...parsed, generatedAt: new Date().toISOString() })
})

// ═══════════════════════════════════════════════════════════════════════
// Trado AI 2.0 — Today's Plan, Patterns, AI Alerts, Chart Vision
// Same philosophy throughout: the frontend (lib/analytics.js) computes every
// number and every verdict deterministically. Gemini is only ever handed
// the finished facts and asked to narrate/phrase them — it never decides
// a verdict, a win rate, or a dollar amount itself.
// ═══════════════════════════════════════════════════════════════════════

function factsToPromptLine(facts = {}) {
  return Object.entries(facts).map(([k, v]) => {
    if (typeof v === 'number') {
      if (/pnl|loss|amount|overby|cost/i.test(k)) return `${k}: ${formatPnl(v)}`
      if (/rate|pct|multiple/i.test(k)) return `${k}: ${v.toFixed ? v.toFixed(1) : v}`
      return `${k}: ${v}`
    }
    return `${k}: ${v}`
  }).join(', ')
}

// ── POST /api/ai/todays-plan ── Narrates the pre-computed Today's Plan
// verdict (GO / CAUTION / STAND DOWN — decided in lib/analytics.js).
router.post('/todays-plan', AI_LIMITER, async (req, res) => {
  const { facts = null } = req.body
  const empty = { headline: null, edge: null, maxLoss: null, thePlay: null }

  if (!facts || !facts.verdict || facts.lifetime?.tradeCount === 0) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Not enough trade history yet to build a plan.', ...empty })
  }

  const f = facts
  const factsLine = `VERDICT (already decided by the rules engine — do not change, soften, or contradict it): ${f.verdict}
LIFETIME: ${f.lifetime.tradeCount} closed trades, win rate ${formatPct(f.lifetime.winRate)}, P&L ${formatPnl(f.lifetime.pnl)}, profit factor ${(f.lifetime.profitFactor || 0).toFixed(2)}.
LAST 7 DAYS: ${f.last7d.tradeCount} trades, win rate ${formatPct(f.last7d.winRate)}, P&L ${formatPnl(f.last7d.pnl)}.
TODAY SO FAR: P&L ${formatPnl(f.today.pnl)}, ${f.today.tradeCount} trade(s).
DAILY LOSS LIMIT: $${f.dailyLoss.limit}, today's loss so far $${f.dailyLoss.loss.toFixed(2)} (${f.dailyLoss.isBreached ? `BREACHED — ${f.dailyLoss.multiple.toFixed(1)}x over the limit` : `${f.dailyLoss.pctOfLimit.toFixed(0)}% of the limit used`}).
STREAK: ${f.streak.count} ${f.streak.type}${f.streak.count === 1 ? '' : 's'} in a row${f.streak.breached ? ' — over the loss-streak threshold' : ''}.
WHY this verdict was chosen (reason code): ${f.reason}`

  const prompt = `You are Trado AI, writing today's pre-market trading plan for a retail trader. A verdict has ALREADY been decided deterministically from their real trade history (given below) — your job is only to explain and justify it in a sharp, punchy coach voice. Never state a different verdict than the one given.

FACTS:
${factsLine}

Respond ONLY with JSON:
{
  "headline": "one short punchy sentence (under 16 words) justifying the verdict using a real number above",
  "edge": "1-2 sentences on their current form/edge, citing real numbers above",
  "maxLoss": "1 short sentence on their loss budget right now, citing real numbers — if the daily loss limit is breached, say so plainly and tell them to stop",
  "thePlay": "1 short sentence telling them concretely what to do right now, consistent with the verdict (e.g. stand down and paper-trade only, trade reduced size, trade normally)"
}

Tone: direct, a little blunt, zero fluff — a coach with their P&L pulled up in front of them, not a motivational poster.`

  const result = await callGemini(prompt, { json: true, temperature: 0.65, maxOutputTokens: 700 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    console.error('[Gemini JSON parse failed: todays-plan] raw:', result.text.slice(0, 500))
    return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error'), ...empty })
  }
  res.json({ aiAvailable: true, verdict: f.verdict, ...parsed })
})

// ── POST /api/ai/patterns-narrate ── Writes a one-line headline + short
// action label for each pattern already detected by detectAdvancedPatterns().
const PATTERN_ACTION_TONE = {
  edge:     'a short "lean into this" call to action, e.g. "lean in"',
  bleed:    'a short "avoid/skip this setup" call to action, e.g. "skip this combo"',
  fatigue:  'a short call to action capping trades per day, e.g. "cap at 2"',
  holdtime: 'a short call to action about exit timing, e.g. "exit by 6h" or "hold past 30m"',
  eerie:    'a short call to action to sit that window out, e.g. "skip this window"',
}

router.post('/patterns-narrate', AI_LIMITER, async (req, res) => {
  const { patterns = [] } = req.body
  if (!patterns.length) return res.json({ aiAvailable: true, patterns: [] })

  const block = patterns.map(p => `- [id:${p.id}] category:${p.category} — ${factsToPromptLine(p.facts)}`).join('\n')
  const toneGuide = [...new Set(patterns.map(p => p.category))]
    .map(c => `- ${c}: ${PATTERN_ACTION_TONE[c] || 'a short, specific call to action'}`).join('\n')

  const prompt = `You are Trado AI. Each line below is a pattern ALREADY detected deterministically from a trader's real trade history — the numbers are final and correct. Write one punchy one-line headline per pattern (under 26 words, citing the real numbers given) plus a short action label (2-5 words, no arrow/prefix — the UI adds that).

PATTERNS:
${block}

Action label tone by category:
${toneGuide}

Respond ONLY with JSON:
{ "patterns": [ { "id": "must match one of the [id:...] tags above", "headline": "...", "action": "..." } ] }
Exactly one entry per pattern given, same order, same ids.`

  const result = await callGemini(prompt, { json: true, temperature: 0.7, maxOutputTokens: 900 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, patterns: [] })

  const parsed = parseJsonLoose(result.text)
  if (!parsed?.patterns) {
    console.error('[Gemini JSON parse failed: patterns-narrate] raw:', result.text.slice(0, 500))
    return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error'), patterns: [] })
  }
  res.json({ aiAvailable: true, patterns: parsed.patterns })
})

// ── POST /api/ai/alert-message ── Writes one fresh, specific alert for a
// single rule breach already detected by evaluateCoachRules(). Called with
// temperature 0.85 on purpose — the same underlying breach should read as a
// newly-observed alert each time the coach re-checks it, not a copy-pasted
// template.
const ALERT_RULE_LABELS = {
  daily_loss:      'Daily loss limit breached',
  loss_streak:     'Losing streak at/above threshold',
  position_size:   'A trade risked more than the max-risk-per-trade rule allows',
  session_pattern: 'Trading is happening in a session that has historically been costly for this trader',
  symbol_warning:  'Trading is happening on a symbol that has historically been a net loser for this trader',
}

router.post('/alert-message', AI_LIMITER, async (req, res) => {
  const { ruleType, severity = 'warning', facts = {} } = req.body
  if (!ruleType || !ALERT_RULE_LABELS[ruleType]) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Unknown coach rule type.' })
  }

  const prompt = `You are Trado AI's real-time coach. It just detected a live rule breach in a trader's account and needs to fire a short alert. Write it fresh and specific — vary your phrasing, don't sound templated — using ONLY the real numbers given below.

RULE BREACHED: ${ALERT_RULE_LABELS[ruleType]}
SEVERITY: ${severity}
FACTS: ${factsToPromptLine(facts)}

Respond ONLY with JSON:
{ "title": "short punchy title, under 8 words, built around the core number", "message": "1-2 sentences, direct and specific, citing the real numbers above, telling the trader plainly what's happening and what to do about it right now" }`

  const result = await callGemini(prompt, { json: true, temperature: 0.85, maxOutputTokens: 400 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    console.error('[Gemini JSON parse failed: alert-message] raw:', result.text.slice(0, 300))
    return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error') })
  }
  res.json({ aiAvailable: true, ...parsed })
})

// ── POST /api/ai/chart-vision ── Uploads a chart screenshot for analysis.
// Unlike /trade-insight (which deliberately forbids reading numbers off a
// screenshot), Chart Vision's entire purpose is reading price levels off the
// chart's own axis — that's disclosed to the user in the UI as "a second
// opinion, not a signal." The verdict is still weighted against the
// trader's REAL historical edge on that symbol, computed deterministically
// and passed in as symbolEdge — Gemini cannot invent that win rate.
router.post('/chart-vision', AI_LIMITER, async (req, res) => {
  const { image, symbol = '', timeframe = '', question = '', symbolEdge = null } = req.body
  const empty = { verdict: null, verdictNote: null, bias: null, setupType: null, riskPlan: null, edgeOnSymbol: null, whyCouldFail: null, keyInsights: [] }

  if (!image || typeof image !== 'string') {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'No chart image was provided.', ...empty })
  }
  const match = image.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/)
  if (!match) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Chart image format not recognized — use PNG or JPG.', ...empty })
  }
  const imagePart = { inlineData: { mimeType: match[1], data: match[2] } }

  const edgeLine = symbolEdge && symbolEdge.count > 0
    ? `TRADER'S REAL HISTORY ON ${symbol || 'THIS SYMBOL'}: ${symbolEdge.count} closed trades, win rate ${formatPct(symbolEdge.winRate)}, net P&L ${formatPnl(symbolEdge.pnl)}.`
    : `TRADER'S REAL HISTORY ON ${symbol || 'THIS SYMBOL'}: no closed-trade history yet on this symbol.`

  const promptText = `You are Trado AI's Chart Vision — analyzing an uploaded chart screenshot as a second opinion, not a trading signal (the trader has already been shown that disclaimer).

CONTEXT:
Symbol: ${symbol || 'not specified — infer from the chart if visible'}
Timeframe: ${timeframe || 'not specified'}
Trader's question: ${question || 'none given — provide a general read'}
${edgeLine}

INSTRUCTIONS:
- Read the chart image directly: trend/structure, visible support/resistance zones, any drawn levels or shaded zones, and the visible price axis to estimate concrete price levels.
- You may state specific price levels as your best read of the chart's own axis/labels — that is the point of this feature — but weight your verdict heavily by the trader's REAL historical edge on this symbol above. If their history on this symbol is weak or losing, lean toward SKIP even if the setup looks technically clean, and say so explicitly.
- Keep the risk plan (entry/stop/target) internally consistent with your stated bias and the levels visible on the chart.
- Be concretely honest about what could invalidate this specific setup (session/liquidity, nearby resistance, momentum, etc.) — not generic disclaimers.

Respond ONLY with JSON:
{
  "verdict": "one of exactly: STRONG BUY, BUY, SKIP, STRONG SKIP",
  "verdictNote": "one sentence explaining the verdict — cite the trader's real win rate on this symbol if given above",
  "bias": "1-2 sentences on the visible trend/structure",
  "setupType": "1-2 sentences naming the setup (e.g. support retest, breakout, range) and what price is doing right now",
  "riskPlan": { "entry": "price level + short reason", "stop": "price level + short reason", "target": "price level + short reason", "rr": "e.g. 1:3.3" },
  "edgeOnSymbol": "1-2 sentences using ONLY the real history numbers given above — never invent a win rate or trade count",
  "whyCouldFail": "2-3 sentences on concrete risks to this specific setup",
  "keyInsights": ["short punchy bullet citing a real fact or number — 4 to 6 bullets total, mixing chart-read facts and the trader's real symbol history"]
}`

  const result = await callGemini([imagePart, promptText], { json: true, temperature: 0.6, maxOutputTokens: 1500 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    console.error('[Gemini JSON parse failed: chart-vision] raw:', result.text.slice(0, 500))
    return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error'), ...empty })
  }
  res.json({ aiAvailable: true, ...empty, ...parsed })
})

// ═══════════════════════════════════════════════════════════════════════
// AI Analysis page — Performance / Risk & Sizing / Patterns & Timing tabs.
// One call covers all three tabs' narrative needs so a page load only ever
// costs 2 Gemini calls total (this one + /behavioral-analysis for Overview
// & Behavioral Flags). Every figure quoted below is already computed by
// lib/analytics.js on the frontend — Gemini only ever narrates on top of
// the exact facts sheet given; it never calculates or invents a number.
// ═══════════════════════════════════════════════════════════════════════
function buildDeepAnalysisFacts(context = {}) {
  const { streaks, benchmarks, quality, risk, time, correlations } = context
  const lines = []

  if (streaks) lines.push(
    `STREAK ANALYSIS: current streak ${streaks.current} ${streaks.currentType}${streaks.current === 1 ? '' : 's'} in a row. Best win streak ${streaks.best}, worst loss streak ${streaks.worst}, avg streak length ${streaks.avgStreakLength.toFixed(1)} trades.`
  )

  if (benchmarks) lines.push(
    `PERFORMANCE BENCHMARKS: meeting ${benchmarks.benchmarks.filter(b => b.pass).length}/${benchmarks.benchmarks.length} professional thresholds (benchmark score ${benchmarks.score}/100). ` +
    benchmarks.benchmarks.map(b => `${b.label}: yours ${typeof b.yours === 'number' ? b.yours.toFixed(2) : b.yours}${b.unit}, target ${b.target}${b.unit} (${b.pass ? 'PASS' : 'FAIL'})`).join('; ') + '.'
  )

  if (quality) lines.push(
    `TRADE QUALITY: avg score ${quality.avgScore}/100 across ${quality.scoredCount} scored trades. Score distribution: ${quality.distribution.map(d => `${d.label}: ${d.count}`).join(', ')}. ` +
    (quality.trend ? `Trend: first-half avg ${quality.trend.firstAvg}, second-half avg ${quality.trend.secondAvg} (${quality.trend.improving ? 'improving' : 'not improving'}). ` : '') +
    (quality.commonIssues.length ? `Most commonly missed execution-checklist items: ${quality.commonIssues.map(i => `"${i.label}" missed ${i.missRate}% of the time (${i.missed}/${i.total})`).join('; ')}.` : 'No recurring checklist gaps detected.')
  )

  if (risk) lines.push(
    `RISK & SIZING: avg risk per losing trade ${formatPnl(-Math.abs(risk.avgRiskAmount))}${risk.avgRiskPct != null ? ` (${formatPct(risk.avgRiskPct)} of account)` : ''}. Avg reward:risk ${risk.avgRR.toFixed(2)}:1. Current balance ${formatPnl(risk.currentBalance).replace('+','')}, peak balance ${formatPnl(risk.peakBalance).replace('+','')}, max drawdown ${formatPct(risk.maxDrawdownPct)}. Sizing consistency ${risk.sizingConsistency}/100.` +
    (risk.avgAfterWin != null && risk.avgAfterLoss != null ? ` Avg size after a win: ${risk.avgAfterWin.toFixed(2)}, avg size after a loss: ${risk.avgAfterLoss.toFixed(2)}.` : '')
  )

  if (time?.trueEdge) lines.push(
    `TIME EDGE: best trading window is ${time.trueEdge.day} around ${time.trueEdge.hour}:00 UTC — ${formatPct(time.trueEdge.winRate)} win rate across ${time.trueEdge.count} trades, netting ${formatPnl(time.trueEdge.pnl)}.`
  )
  if (time?.sessions?.length) lines.push(
    `SESSION BREAKDOWN: ` + time.sessions.map(s => `${s.session}: ${s.count} trades, ${formatPct(s.winRate)} win rate, ${formatPnl(s.pnl)}`).join('; ') + '.'
  )

  if (correlations?.insight) lines.push(
    `SYMBOL CORRELATION: best symbol is ${correlations.insight.symbol} — ${formatPct(correlations.insight.winRate)} win rate across ${correlations.insight.count} trades, netting ${formatPnl(correlations.insight.pnl)}.`
  )

  return lines.join('\n')
}

router.post('/deep-analysis', AI_LIMITER, async (req, res) => {
  const { context = {} } = req.body
  const empty = { qualityInsights: [], streakInsight: null, riskInsight: null, timeInsight: null, correlationInsight: null }

  const hasAnyData = context.streaks || context.quality || context.risk
  if (!hasAnyData) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Not enough closed trades yet to analyze.', ...empty })
  }

  const facts = buildDeepAnalysisFacts(context)

  const prompt = `You are Trado AI — a sharp, direct trading performance coach. Below is a FACTS SHEET computed from a real trader's actual trade history. Every number in it is already correct and final.

RULES (critical):
- Use ONLY the numbers in the facts sheet. NEVER calculate, estimate, or invent a number that isn't given.
- Be specific — cite exact figures (dollar amounts, percentages, counts) the way a sharp coach would.
- Connect facts together into a real insight where possible (e.g. tie a missed checklist item to the quality score trend, or sizing-after-loss to the risk numbers).
- Be direct — call out bad process even if P&L was positive, and credit good process even in a rough stretch.
- Keep every string SHORT: 1-2 sentences max per field.
- If a section of the facts sheet is missing, omit the corresponding field(s) from your JSON response entirely rather than guessing.

FACTS SHEET:
${facts}

Respond ONLY with valid JSON (no markdown fences, no preamble), matching this exact shape:
{
  "qualityInsights": [
    { "severity": "positive|warning|info", "title": "short headline", "text": "1-2 sentences citing real numbers from TRADE QUALITY" }
    // 1-2 cards, only if TRADE QUALITY data was given
  ],
  "streakInsight": "1-2 sentences of coaching on the STREAK ANALYSIS numbers, or null if not given",
  "riskInsight": "1-2 sentences of coaching on the RISK & SIZING numbers, or null if not given",
  "timeInsight": "1-2 sentences of coaching on the TIME EDGE / SESSION numbers, or null if not given",
  "correlationInsight": "1-2 sentences of coaching on the SYMBOL CORRELATION numbers, or null if not given"
}`

  const result = await callGemini(prompt, { json: true, temperature: 0.65, maxOutputTokens: 1600 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    const cutOff = result.finishReason === 'MAX_TOKENS'
    console.error(`[Gemini JSON parse failed: deep-analysis, finishReason=${result.finishReason}] raw:`, result.text.slice(0, 800))
    return res.json({
      aiAvailable: false, reason: 'parse_error',
      message: cutOff ? "Gemini's response was cut off before finishing — try Regenerate." : humanizeError('parse_error'),
      ...empty,
    })
  }
  res.json({ aiAvailable: true, ...empty, ...parsed })
})

// ═══════════════════════════════════════════════════════════════════════
// Growth Roadmap — narrates a short coaching tip on top of the trader's
// deterministic status/health-score/opportunity facts computed in
// lib/analytics.js. Gemini never invents a number or opportunity of its
// own — it only ever picks the single best thing to say about what's given.
// ═══════════════════════════════════════════════════════════════════════
function buildGrowthRoadmapFacts(context = {}) {
  const { status, healthScore, focusMessage, stats = {}, opportunities = [], weaknesses = [], strengths = [] } = context
  const lines = []
  lines.push(`STATUS: "${status}" (Health Score ${healthScore}/100). Focus: ${focusMessage}`)
  lines.push(`CORE STATS: Win Rate ${stats.winRate?.toFixed(1)}%, Profit Factor ${stats.profitFactor?.toFixed(2)}, Total P&L ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl?.toFixed(2)}, Trades ${stats.tradeCount}.`)
  if (strengths.length) lines.push(`STRENGTHS: ${strengths.map(s => `${s.title} (${s.detail})`).join('; ')}.`)
  if (weaknesses.length) lines.push(`WEAKNESSES: ${weaknesses.map(w => `${w.title} (${w.detail})`).join('; ')}.`)
  if (opportunities.length) {
    lines.push('SCALE-UP OPPORTUNITIES (reference ONLY these — never invent others):')
    opportunities.forEach(o => lines.push(`- "${o.title}" (${o.risk} risk) — ${o.description} Potential: +$${o.potentialPerDay}/day.`))
  }
  return lines.join('\n')
}

router.post('/growth-roadmap', AI_LIMITER, async (req, res) => {
  const { context = {} } = req.body
  const empty = { coachTip: null }
  if (!context.status) return res.json({ aiAvailable: false, reason: 'no_data', message: 'Not enough trade data yet.', ...empty })

  const facts = buildGrowthRoadmapFacts(context)

  const prompt = `You are Trado AI — a sharp, motivating trading coach speaking directly to the trader. Below is a FACTS SHEET computed from their real, actual trade history. Every number is already correct and final.

RULES (critical):
- Use ONLY the numbers, opportunities, strengths, and weaknesses given. NEVER invent a fact, number, or opportunity not in the sheet.
- If weaknesses are given, prioritize addressing the biggest one before talking about scaling up.
- If no weaknesses are given but opportunities are, recommend the single best opportunity and say why (cite its potential $/day).
- Be specific — cite exact figures.
- Be motivating but honest — a good coach, not a hype machine.
- Keep it to 2-3 sentences total.

FACTS SHEET:
${facts}

Respond ONLY with valid JSON (no markdown fences, no preamble), matching this exact shape:
{ "coachTip": "2-3 sentences of specific, motivating coaching citing real numbers" }`

  const result = await callGemini(prompt, { json: true, temperature: 0.7, maxOutputTokens: 500 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    console.error('[Gemini JSON parse failed: growth-roadmap] raw:', result.text.slice(0, 500))
    return res.json({ aiAvailable: false, reason: 'parse_error', message: humanizeError('parse_error'), ...empty })
  }
  res.json({ aiAvailable: true, ...empty, ...parsed })
})

// ═══════════════════════════════════════════════════════════════════════
// Smart Insights Report — the full AI-generated performance report shown
// on the "Smart Insights" tab. Every number in the facts sheet below (P&L,
// win rate, pair/session breakdowns, sizing, journal compliance) was
// computed on the frontend by lib/analytics.js#computeSmartReportFacts.
// Gemini's job here is narrow and strict: pick which of the given
// blindspot/pattern CANDIDATES are worth surfacing (by id only — it cannot
// invent a new one) and write the coaching copy around the evidence
// numbers it was handed. It never calculates or restates a number that
// isn't already in the facts sheet.
// ═══════════════════════════════════════════════════════════════════════
function buildSmartReportFacts(context = {}) {
  const {
    stats = {}, bestPair, worstPair, topSession, sessionDominancePct,
    riskSizing = {}, avgHoldSec, blindspotCandidates = [], patternCandidates = [],
  } = context
  const lines = []

  lines.push(
    `OVERALL: ${formatPnl(stats.totalPnl)} net P&L across ${stats.tradeCount} trades, ${formatPct(stats.winRate)} win rate, ` +
    `profit factor ${stats.profitFactor >= 999 ? '∞' : (stats.profitFactor || 0).toFixed(2)}. ` +
    `Biggest win ${formatPnl(stats.bestTrade)}, biggest loss ${formatPnl(stats.worstTrade)}. ` +
    `Avg reward:risk ${(riskSizing.avgRR || 0).toFixed(2)}:1.` +
    (avgHoldSec != null ? ` Avg hold time ${Math.round(avgHoldSec / 60)}m.` : '')
  )
  if (bestPair) lines.push(`BEST SYMBOL: ${bestPair.symbol} — ${bestPair.count} trades, ${formatPct(bestPair.winRate)} win rate, ${formatPnl(bestPair.pnl)}.`)
  if (worstPair) lines.push(`WORST SYMBOL: ${worstPair.symbol} — ${worstPair.count} trades, ${formatPct(worstPair.winRate)} win rate, ${formatPnl(worstPair.pnl)}.`)
  else lines.push('WORST SYMBOL: none — no losing symbol this period.')
  if (topSession) lines.push(`TOP SESSION: ${topSession.session} — ${formatPct(sessionDominancePct)} of volume, ${formatPct(topSession.winRate)} win rate, ${formatPnl(topSession.pnl)}.`)

  if (blindspotCandidates.length) {
    lines.push('BLINDSPOT CANDIDATES (choose the most important 1-3 by id; use ONLY these ids; do not invent others; if none feel significant, return fewer):')
    blindspotCandidates.forEach(c => lines.push(`- id="${c.id}" severity="${c.severity}": ${c.evidence}`))
  } else {
    lines.push('BLINDSPOT CANDIDATES: none given — return an empty blindspots array.')
  }

  if (patternCandidates.length) {
    lines.push('RECURRING PATTERN CANDIDATES (use ONLY these ids; do not invent others):')
    patternCandidates.forEach(p => lines.push(`- id="${p.id}" title="${p.title}": ${p.evidence}, net ${formatPnl(p.pnl)}.`))
  } else {
    lines.push('RECURRING PATTERN CANDIDATES: none given — return an empty recurringPatterns array.')
  }

  return lines.join('\n')
}

router.post('/smart-report', AI_LIMITER, async (req, res) => {
  const { context = {} } = req.body
  const empty = { title: null, narrative: null, blindspots: [], recurringPatterns: [], actionPlan: [] }

  if (!context.stats || !context.stats.tradeCount) {
    return res.json({ aiAvailable: false, reason: 'no_data', message: 'Not enough closed trades yet to generate a report.', ...empty })
  }

  const facts = buildSmartReportFacts(context)
  const positive = !!context.verdict?.positive

  const prompt = `You are Trado AI — a sharp, direct trading performance coach writing a personalized report for a trader. Below is a FACTS SHEET computed from their real trade history. Every number in it is already correct and final — this trader is currently ${positive ? 'profitable' : 'not yet net-profitable'} for this period.

RULES (critical):
- Use ONLY the numbers and ids given in the facts sheet. NEVER calculate, estimate, invent, or restate a number differently than given.
- For "blindspots" and "recurringPatterns", the "id" field MUST exactly match one of the candidate ids listed in the facts sheet. Never invent a new id. Only include candidates that are genuinely worth surfacing — quality over quantity.
- Be specific and direct — write like a sharp coach reviewing real performance, not a generic motivational message.
- Keep every field SHORT and punchy as specified below.
- "actionPlan" must have exactly 3 items, ordered by priority, grounded in the blindspots/patterns you identified above (or in the overall stats if there are no blindspots).

FACTS SHEET:
${facts}

Respond ONLY with valid JSON (no markdown fences, no preamble), matching this exact shape:
{
  "reportLabel": "3-4 word all-caps-style label like PROFITABLE PERIOD, STRONG MOMENTUM, CHOPPY PERIOD, or NOT YET PROFITABLE — must match whether the trader is profitable (given above)",
  "title": "a punchy 4-8 word headline capturing this trader's defining edge or issue this period, e.g. 'Elite Precision with a Gold Specialization'",
  "narrative": "2-3 sentences in a coaching voice, citing real numbers from OVERALL, explaining WHY the period went the way it did",
  "blindspots": [
    { "id": "<candidate id from the facts sheet>", "description": "2-3 sentences on why this matters for this trader, referencing the evidence given", "recommendation": "1 short, concrete, specific action sentence" }
  ],
  "recurringPatterns": [
    { "id": "<candidate id from the facts sheet>", "description": "1-2 sentences on the likely technical or psychological reason behind this pattern" }
  ],
  "actionPlan": [
    { "title": "short imperative headline, e.g. 'Cap Maximum Lot Size to 4.00'", "priority": "Do this first" or "Important" or "Nice to have", "description": "1-2 sentences on what to do and why it matters", "measure": "1 short sentence on how to measure success, e.g. 'Zero trades exceeding 4.00 lots for the next 14 days.'" }
  ]
}`

  const result = await callGemini(prompt, { json: true, temperature: 0.65, maxOutputTokens: 2000 })
  if (!result.ok) return res.json({ aiAvailable: false, reason: result.reason, message: result.message, ...empty })

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    const cutOff = result.finishReason === 'MAX_TOKENS'
    console.error(`[Gemini JSON parse failed: smart-report, finishReason=${result.finishReason}] raw:`, result.text.slice(0, 800))
    return res.json({
      aiAvailable: false, reason: 'parse_error',
      message: cutOff ? "Gemini's response was cut off before finishing — try again." : humanizeError('parse_error'),
      ...empty,
    })
  }

  // Guard against Gemini surfacing a candidate id that wasn't offered.
  const validBlindspotIds = new Set((context.blindspotCandidates || []).map(c => c.id))
  const validPatternIds = new Set((context.patternCandidates || []).map(p => p.id))
  if (Array.isArray(parsed.blindspots)) parsed.blindspots = parsed.blindspots.filter(b => validBlindspotIds.has(b.id))
  if (Array.isArray(parsed.recurringPatterns)) parsed.recurringPatterns = parsed.recurringPatterns.filter(p => validPatternIds.has(p.id))

  res.json({ aiAvailable: true, ...empty, ...parsed })
})

export default router