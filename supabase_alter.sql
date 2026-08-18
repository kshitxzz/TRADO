-- Run this in Supabase SQL Editor to add MetaAPI columns
-- Only needed if you already ran the original supabase_schema.sql

ALTER TABLE broker_accounts
  ADD COLUMN IF NOT EXISTS meta_api_id   text,
  ADD COLUMN IF NOT EXISTS balance       numeric(14,2) default 0,
  ADD COLUMN IF NOT EXISTS equity        numeric(14,2) default 0,
  ADD COLUMN IF NOT EXISTS currency      text default 'USD',
  ADD COLUMN IF NOT EXISTS account_name  text;

-- Add index on meta_api_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_broker_meta_api ON broker_accounts(meta_api_id);
