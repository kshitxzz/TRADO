-- =============================================================
-- TRADO - Trading Journal SaaS: Complete Database Migration
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- 1. USERS (public profile, linked to auth.users)
-- =============================================================
CREATE TABLE public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  avatar_url  TEXT,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  currency    TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  gold_volume_traded NUMERIC(18, 4) NOT NULL DEFAULT 0,
  platform_unlocked  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_users_updated
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- 2. BROKER ACCOUNTS
-- =============================================================
CREATE TABLE public.broker_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker_name     TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  server          TEXT,
  ib_name         TEXT,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  UNIQUE (user_id, broker_name, account_number)
);

CREATE INDEX idx_broker_accounts_user_id ON public.broker_accounts(user_id);

-- =============================================================
-- 3. TRADES
-- =============================================================
CREATE TABLE public.trades (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker_account_id UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  symbol            TEXT NOT NULL,
  side              TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price       NUMERIC(18, 8) NOT NULL,
  exit_price        NUMERIC(18, 8),
  size              NUMERIC(18, 8) NOT NULL,
  pnl               NUMERIC(18, 4),
  duration_seconds  INTEGER,
  session           TEXT CHECK (session IN ('asian', 'london', 'new_york', NULL)),
  strategy          TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trades_user_id ON public.trades(user_id);
CREATE INDEX idx_trades_user_opened_at ON public.trades(user_id, opened_at DESC);
CREATE INDEX idx_trades_user_symbol ON public.trades(user_id, symbol);

-- =============================================================
-- 4. JOURNAL ENTRIES
-- =============================================================
CREATE TABLE public.journal_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  content          TEXT,
  emotions         TEXT[] DEFAULT '{}',
  linked_trade_ids UUID[] DEFAULT '{}',
  screenshots      TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX idx_journal_user_date ON public.journal_entries(user_id, date DESC);

CREATE TRIGGER on_journal_entries_updated
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================
-- 5. AI INSIGHTS CACHE
-- =============================================================
CREATE TABLE public.ai_insights_cache (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL,
  response_data  JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_ai_insights_user_scope ON public.ai_insights_cache(user_id, scope);

-- =============================================================
-- 6. SUBSCRIPTIONS (for future payment integration)
-- =============================================================
CREATE TABLE public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan              TEXT NOT NULL CHECK (plan IN ('free', 'pro')),
  payment_order_id  TEXT UNIQUE,
  amount            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'failed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users: select own" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users: update own" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

ALTER TABLE public.broker_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brokers: select own" ON public.broker_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Brokers: insert own" ON public.broker_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brokers: update own" ON public.broker_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Brokers: delete own" ON public.broker_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trades: select own" ON public.trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Trades: insert own" ON public.trades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Trades: update own" ON public.trades FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Trades: delete own" ON public.trades FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Journal: select own" ON public.journal_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Journal: insert own" ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Journal: update own" ON public.journal_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Journal: delete own" ON public.journal_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.ai_insights_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AI Cache: select own" ON public.ai_insights_cache FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "AI Cache: insert own" ON public.ai_insights_cache FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "AI Cache: delete own" ON public.ai_insights_cache FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subs: select own" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
