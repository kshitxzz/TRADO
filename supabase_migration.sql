-- ─────────────────────────────────────────────────────────────
-- Trado DB Migration — Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- 1. Add account_type to broker_accounts
--    Values: 'mt5' | 'prop_firm' | 'live'
ALTER TABLE broker_accounts
  ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'mt5';

-- 2. Add settings JSONB (stores prop firm / live account config)
ALTER TABLE broker_accounts
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- 3. Add source to trades
--    Values: 'manual' | 'mt5_sync'
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'mt5_sync';

-- 4. Backfill existing rows
UPDATE broker_accounts SET account_type = 'mt5' WHERE account_type IS NULL;
UPDATE trades SET source = 'mt5_sync' WHERE source IS NULL;
