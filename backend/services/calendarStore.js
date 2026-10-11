// ─────────────────────────────────────────────────────────────────────────
// Durable copy of the calendar (Supabase table calendar_cache, see
// supabase/migrations/004_calendar_cache.sql). Render's free tier restarts the server often and wipes its
// memory; without this, a restart that coincides with Forex Factory refusing the request leaves the page
// empty. Every function here fails soft: if Supabase or the table is missing, the calendar simply works
// from memory exactly as before.
// ─────────────────────────────────────────────────────────────────────────
let override = null            // tests
let disabled = false           // table missing → stop trying until the next deploy
let warned = false

const configured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

function failed(err) {
  const msg = String(err?.message || err)
  if (!warned) {
    warned = true
    console.warn(`[calendar] saved copy unavailable (${msg}). Run supabase/migrations/004_calendar_cache.sql in the Supabase SQL editor.`)
  }
  if (err?.code === '42P01' || err?.code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) disabled = true
}

async function client() {
  const { supabase } = await import('../config/supabase.js')
  return supabase
}

// → { payload, updatedAt (ms) } or null
export async function loadCache(key) {
  if (override) return override.load(key)
  if (disabled || !configured()) return null
  try {
    const { data, error } = await (await client()).from('calendar_cache').select('payload, updated_at').eq('key', key).maybeSingle()
    if (error) throw error
    return data ? { payload: data.payload, updatedAt: Date.parse(data.updated_at) } : null
  } catch (err) {
    failed(err)
    return null
  }
}

export async function saveCache(key, payload) {
  if (override) return override.save(key, payload)
  if (disabled || !configured()) return false
  try {
    const { error } = await (await client()).from('calendar_cache').upsert({ key, payload, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
    return true
  } catch (err) {
    failed(err)
    return false
  }
}

export const __setStore = (s) => { override = s }