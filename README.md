# Trado — AI-Powered Trading Journal

> The trading journal that uses AI to find patterns in your behavior, detect emotional leaks, and turn your trade data into a real edge.

Built with **React/Vite + Express + Supabase + Google Gemini + Cashfree**.

---

## Stack

| Layer     | Tech                                               |
|-----------|----------------------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, Framer Motion        |
| Charts    | Recharts                                           |
| Backend   | Node.js, Express 4                                 |
| Database  | Supabase (PostgreSQL + Auth + RLS)                 |
| AI        | Google Gemini 1.5 Flash                            |
| Payments  | Cashfree (INR, sandbox + production)               |
| Auth      | Supabase Auth (Email + Google OAuth)               |

---

## Quick Start

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run `supabase_schema.sql`
3. Under **Authentication → Providers**, enable **Google** OAuth
4. Copy your `Project URL` and `anon key` (Settings → API)

### 2. Google Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Create an API key
3. Keep it for the backend `.env`

### 3. Cashfree Setup (Payments)

1. Create an account at [cashfree.com](https://www.cashfree.com)
2. Get sandbox `Client ID` and `Client Secret` from dashboard
3. For production, switch `CASHFREE_ENV=production`

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BACKEND_URL
npm install
npm run dev        # → http://localhost:5173
```

### 5. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in all env vars
npm install
npm run dev        # → http://localhost:4000
```

---

## Project Structure

```
trado/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── charts/          # EquityCurve, RadarChart
│   │   │   ├── layout/          # Sidebar, Topbar, PageWrapper
│   │   │   └── ui/              # ConnectBrokerModal, PlatformLocked
│   │   ├── hooks/
│   │   │   ├── useAuth.js       # Supabase auth state
│   │   │   └── useTrades.js     # Trade fetching + sync + seeder
│   │   ├── lib/
│   │   │   ├── supabaseClient.js
│   │   │   ├── utils.js         # formatPnl, computeStats, etc.
│   │   │   └── tradeSeeder.js   # Realistic trade generator
│   │   ├── pages/
│   │   │   ├── Landing.jsx      # Marketing landing page
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   ├── Dashboard.jsx    # Main app dashboard
│   │   │   ├── Trades.jsx       # Trade list + filters
│   │   │   ├── Journal.jsx      # Trade journal
│   │   │   ├── TradoAI.jsx      # AI behavioral analysis (6 tabs)
│   │   │   ├── TradoAI2.jsx     # PRO AI chat coach
│   │   │   ├── BrokerHub.jsx    # Broker connection + gold tracker
│   │   │   ├── Settings.jsx     # Profile, notifications, billing
│   │   │   ├── Progress.jsx     # Goals + streak tracker
│   │   │   ├── ShareCards.jsx   # Shareable performance cards
│   │   │   ├── Pricing.jsx      # Public pricing page
│   │   │   └── analytics/
│   │   │       ├── Performance.jsx  # P&L by symbol/session/strategy
│   │   │       ├── Reports.jsx      # Monthly summaries
│   │   │       ├── AdvancedReports.jsx
│   │   │       ├── DayView.jsx
│   │   │       ├── Strategies.jsx
│   │   │       └── TradeReplay.jsx
│   │   └── styles/globals.css   # All CSS tokens + utility classes
│   ├── .env.example
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── backend/
│   ├── routes/
│   │   ├── ai.js                # Gemini insights, chat, trade DNA
│   │   ├── trades.js            # CRUD + stats aggregation
│   │   ├── broker.js            # Connect, verify, disconnect
│   │   ├── payments.js          # Cashfree order create/verify/webhook
│   │   └── stats.js             # Equity curve, heatmap, by-symbol
│   ├── config/supabase.js       # Service role Supabase client
│   ├── server.js                # Express app entrypoint
│   └── .env.example
│
└── supabase_schema.sql          # Full DB schema + RLS policies
```

---

## Key Features

### Platform Lock (Gold Volume Gate)
Users must trade **2.0 lots of XAUUSD** through a connected broker to unlock advanced features. This is tracked in `broker_accounts.gold_volume`. The `PlatformLocked` component gates protected pages.

### MT5 Broker Sync (Simulated)
The `connectBroker()` flow auto-seeds 35 realistic historical trades via `tradeSeeder.js`. `syncTrades()` adds 1–3 new trades each call, mimicking a live MT5 WebSocket connection. Wire up a real MT5 API in `backend/routes/broker.js → /verify`.

### AI Analysis (Gemini)
Three AI endpoints in `backend/routes/ai.js`:
- `/insights` — behavioral & weekly analysis
- `/chat` — free-form AI coach conversation  
- `/trade-dna` — trading archetype generation

### Cashfree Payments
Three plans: Free, Pro (₹999/mo), Lifetime (₹4,999). Orders created via `/api/payments/create-order`, webhook at `/api/payments/webhook` updates user subscription.

---

## Deployment

### Frontend → Vercel
```bash
cd frontend
vercel deploy
# Set VITE_* env vars in Vercel dashboard
```

### Backend → Railway
```bash
cd backend
railway init
railway up
# Set all backend env vars in Railway dashboard
```

### Supabase
- Keep your project URL + keys in both `.env` files
- Google OAuth redirect URL: `https://your-project.supabase.co/auth/v1/callback`
- Cashfree webhook URL: `https://your-backend.railway.app/api/payments/webhook`

---

## Auth Notes

- Google OAuth requires configuring redirect URI in Supabase dashboard
- The `AuthProvider` lives in `useAuth.js` — wrap your app with it if you refactor
- Currently auth is consumed directly via `useAuth()` hook in each component

---

## Color Tokens

All design tokens are CSS variables in `globals.css`:

| Token                  | Value     | Usage                  |
|------------------------|-----------|------------------------|
| `--bg-primary`         | `#0A0A0F` | Main app background    |
| `--bg-sidebar`         | `#0D0C12` | Sidebar background     |
| `--bg-card`            | `#131217` | Cards / panels         |
| `--accent-purple`      | `#8B5CF6` | Primary brand color    |
| `--positive-green`     | `#22C55E` | Profit / wins          |
| `--negative-red`       | `#F43F5E` | Loss / danger          |
| `--warning-orange`     | `#F59E0B` | Warnings / gold        |

---

## License
MIT — built for retail traders in India & globally.