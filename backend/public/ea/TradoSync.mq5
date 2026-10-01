//+------------------------------------------------------------------+
//|                                                    TradoSync.mq5 |
//|            Trado — real-time MT5 -> Trado trade journal sync    |
//|                                                                    |
//| WHAT THIS DOES                                                     |
//| Runs inside your MT5 terminal (which is already logged into your   |
//| account) and pushes your closed trades + open positions to your    |
//| Trado account over HTTPS. No password ever leaves the terminal —   |
//| the only credential is the Sync Key generated on the Accounts page.|
//|                                                                    |
//| SETUP                                                               |
//| 1. Copy this file into your MT5 "Experts" folder                    |
//|    (File -> Open Data Folder -> MQL5 -> Experts), then in           |
//|    MetaEditor press F7 to compile it.                               |
//| 2. In MT5: Tools -> Options -> Expert Advisors -> tick "Allow       |
//|    WebRequest for listed URL" and add your Trado backend URL        |
//|    (the one shown on the Accounts page, e.g.                        |
//|    https://your-backend.example.com).                               |
//| 3. Drag TradoSync onto any chart. In the Inputs tab, paste the      |
//|    Sync Key and Server URL shown on the Accounts page.              |
//| 4. Make sure "Allow Algo Trading" is enabled (top toolbar).         |
//+------------------------------------------------------------------+
#property copyright "Trado"
#property version   "1.10"
#property strict

//──── Inputs ─────────────────────────────────────────────────────────
input string InpApiKey              = "";                                     // Sync Key (from Trado Accounts page)
input string InpServerUrl           = "https://your-backend.example.com/api/broker/ea/sync"; // Webhook URL (from Trado Accounts page)
input int    InpMinTickSyncMs       = 1000;                                    // Fastest allowed sync on price ticks (ms) — floor, not a fixed interval
input int    InpSyncIntervalSeconds = 5;                                       // Fallback timer — catches symbols/quiet periods with no ticks
input int    InpHistoryLookbackDays = 7;                                      // Rolling window after the first full sync
input bool   InpSendCandles         = true;                                   // Upload this broker's own candles around each closed trade (Trade Replay)

//──── State ──────────────────────────────────────────────────────────
int      g_offsetSeconds = 0;     // broker-server-time -> UTC offset, auto-detected
datetime g_lastSyncAt     = 0;
ulong    g_lastSyncMs     = 0;    // ms clock — throttle floor for tick-driven syncs
string   g_gvFirstRun;            // GlobalVariable name — persists across terminal restarts

struct PositionAgg
{
   long     positionId;
   string   symbol;
   string   side;       // "BUY" / "SELL"
   double   volume;
   double   openPrice;
   double   closePrice;
   datetime openTime;
   datetime closeTime;
   double   commission;
   double   swap;
   double   profit;
   string   comment;
   bool     hasOpen;
   bool     hasClose;
};

//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpApiKey) == 0)
   {
      Alert("TradoSync: paste your Sync Key from the Trado Accounts page into the Inputs tab.");
      return INIT_PARAMETERS_INCORRECT;
   }

   // MT5's broker-server clock is rarely UTC. TimeGMT() is the terminal's
   // notion of true GMT (synced internally); TimeTradeServer() is the
   // server's own clock — the difference is the offset we need to convert
   // every trade timestamp to a real UTC instant before sending it.
   g_offsetSeconds = (int)(TimeTradeServer() - TimeGMT());

   g_gvFirstRun = "TradoSync_FirstRun_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));

   // Timer is now just a fallback (catches quiet periods / other symbols) —
   // the real "live" feel comes from OnTick below, which fires exactly
   // when MT5's own Profit column updates.
   EventSetTimer(MathMax(InpSyncIntervalSeconds, 1));
   Comment("Trado Sync: starting…");
   DoSync(); // initial push on attach
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

// Shared throttle: never sync more often than InpMinTickSyncMs, regardless
// of whether OnTick or OnTimer triggered it. Ticks on a busy symbol can
// arrive many times a second — without this floor we'd hammer the backend
// on every single one instead of tracking it closely.
void SyncIfDue()
{
   ulong now = GetTickCount64();
   if(g_lastSyncMs != 0 && (now - g_lastSyncMs) < (ulong)MathMax(InpMinTickSyncMs, 0)) return;
   g_lastSyncMs = now;
   DoSync();
}

void OnTimer() { SyncIfDue(); }

// Fires on every real price tick for this chart's symbol — the same event
// MT5's own Trade tab uses to update its Profit column live. This is what
// actually closes the gap with MT5's native speed; the timer above is just
// a safety net for open positions in a different symbol than this chart.
void OnTick() { SyncIfDue(); }

// Push immediately when a trade actually happens, bypassing the throttle
// — this is what makes fills/closes feel instant instead of waiting for
// the next tick or timer.
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) DoSync();
}

//+------------------------------------------------------------------+
string JsonEscape(const string rawText)
{
   string s = rawText;
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", "");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\t", " ");
   return s;
}

string ToIso8601Utc(datetime serverTime)
{
   if(serverTime <= 0) return "";
   datetime utc = serverTime - g_offsetSeconds;
   MqlDateTime dt;
   TimeToStruct(utc, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

int FindOrCreateAgg(PositionAgg &aggs[], long positionId)
{
   for(int i = 0; i < ArraySize(aggs); i++)
      if(aggs[i].positionId == positionId) return i;

   int n = ArraySize(aggs);
   ArrayResize(aggs, n + 1);
   aggs[n].positionId = positionId;
   aggs[n].hasOpen  = false;
   aggs[n].hasClose = false;
   aggs[n].commission = 0;
   aggs[n].swap       = 0;
   aggs[n].profit      = 0;
   aggs[n].comment       = "";
   return n;
}

//+------------------------------------------------------------------+
//| Builds the closed-trades JSON array by pairing history deals per   |
//| position (mirrors how Trado's MetaAPI sync groups deals).          |
//+------------------------------------------------------------------+
string BuildClosedDealsJson(bool firstRun)
{
   datetime toTime   = TimeTradeServer();
   datetime fromTime = firstRun ? 0 : (toTime - (datetime)InpHistoryLookbackDays * 86400);
   HistorySelect(fromTime, toTime);

   PositionAgg aggs[];
   int total = HistoryDealsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      ENUM_DEAL_TYPE dtype = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue; // skip balance/credit/correction/etc.

      long positionId = (long)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      if(positionId == 0) continue;

      int idx = FindOrCreateAgg(aggs, positionId);
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);

      if(entry == DEAL_ENTRY_IN)
      {
         if(!aggs[idx].hasOpen)
         {
            aggs[idx].symbol    = HistoryDealGetString(ticket, DEAL_SYMBOL);
            aggs[idx].side      = (dtype == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            aggs[idx].volume    = HistoryDealGetDouble(ticket, DEAL_VOLUME);
            aggs[idx].openPrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
            aggs[idx].openTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
            aggs[idx].hasOpen   = true;
         }
         aggs[idx].commission += HistoryDealGetDouble(ticket, DEAL_COMMISSION);
         aggs[idx].swap        += HistoryDealGetDouble(ticket, DEAL_SWAP);
      }
      else // DEAL_ENTRY_OUT or DEAL_ENTRY_OUT_BY — a close (possibly partial)
      {
         aggs[idx].closePrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
         aggs[idx].closeTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
         aggs[idx].profit    += HistoryDealGetDouble(ticket, DEAL_PROFIT);
         aggs[idx].commission += HistoryDealGetDouble(ticket, DEAL_COMMISSION);
         aggs[idx].swap        += HistoryDealGetDouble(ticket, DEAL_SWAP);
         string cm = HistoryDealGetString(ticket, DEAL_COMMENT);
         if(StringLen(cm) > 0) aggs[idx].comment = cm;
         aggs[idx].hasClose = true;
         if(!aggs[idx].hasOpen)
         {
            // Position was opened before our lookback window — still worth
            // sending with what we know so it shows up as closed.
            aggs[idx].symbol   = HistoryDealGetString(ticket, DEAL_SYMBOL);
            aggs[idx].side     = (dtype == DEAL_TYPE_SELL) ? "BUY" : "SELL"; // exit is opposite side of entry
            aggs[idx].volume   = HistoryDealGetDouble(ticket, DEAL_VOLUME);
         }
      }
   }

   string json = "[";
   bool first = true;
   for(int i = 0; i < ArraySize(aggs); i++)
   {
      if(!aggs[i].hasClose) continue;
      if(!first) json += ",";
      first = false;
      json += StringFormat(
         "{\"positionId\":%I64d,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,\"openPrice\":%.5f,\"closePrice\":%.5f,\"openTime\":\"%s\",\"closeTime\":\"%s\",\"commission\":%.2f,\"swap\":%.2f,\"profit\":%.2f,\"comment\":\"%s\"}",
         aggs[i].positionId, JsonEscape(aggs[i].symbol), aggs[i].side, aggs[i].volume,
         aggs[i].openPrice, aggs[i].closePrice, ToIso8601Utc(aggs[i].openTime), ToIso8601Utc(aggs[i].closeTime),
         aggs[i].commission, aggs[i].swap, aggs[i].profit, JsonEscape(aggs[i].comment)
      );
   }
   json += "]";
   return json;
}

string BuildOpenPositionsJson()
{
   string json = "[";
   bool first = true;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket)) continue;

      long   posId   = (long)PositionGetInteger(POSITION_IDENTIFIER);
      string symbol  = PositionGetString(POSITION_SYMBOL);
      double volume  = PositionGetDouble(POSITION_VOLUME);
      double price   = PositionGetDouble(POSITION_PRICE_OPEN);
      double profit  = PositionGetDouble(POSITION_PROFIT);
      datetime otime = (datetime)PositionGetInteger(POSITION_TIME);
      ENUM_POSITION_TYPE ptype = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      string side = (ptype == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      string comment = PositionGetString(POSITION_COMMENT);

      if(!first) json += ",";
      first = false;
      json += StringFormat(
         "{\"positionId\":%I64d,\"symbol\":\"%s\",\"side\":\"%s\",\"volume\":%.2f,\"openPrice\":%.5f,\"profit\":%.2f,\"openTime\":\"%s\",\"comment\":\"%s\"}",
         posId, JsonEscape(symbol), side, volume, price, profit, ToIso8601Utc(otime), JsonEscape(comment)
      );
   }
   json += "]";
   return json;
}

string BuildAccountInfoJson()
{
   return StringFormat(
      "{\"login\":%I64d,\"balance\":%.2f,\"equity\":%.2f,\"currency\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\"}",
      AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY),
      JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)), JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
      JsonEscape(AccountInfoString(ACCOUNT_SERVER))
   );
}

//+------------------------------------------------------------------+
//| BROKER-CANDLE CAPTURE (for Trade Replay)                           |
//| A free market-data feed never matches a broker's prices exactly, so |
//| the EA copies the candles this terminal actually saw around each    |
//| closed trade and uploads them. After every sync it asks the backend |
//| which closed trades still lack candles (a couple at a time, at most |
//| once every 15 s), reads them with CopyRates() and posts them. Old   |
//| trades backfill gradually; nothing here blocks trade syncing.       |
//+------------------------------------------------------------------+
#define CANDLE_BARS_BEFORE 40   // keep in step with WINDOW_BEFORE in the web app (replayUtils.js)
#define CANDLE_BARS_AFTER  20   // keep in step with WINDOW_AFTER
#define CANDLE_MAX_BARS    1500

int    g_tfList[6] = {PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};
int    g_tfSecs[6] = {60, 300, 900, 3600, 14400, 86400};
string g_tfKeys[6] = {"1m", "5m", "15m", "1h", "4h", "1d"};

ulong  g_lastCandleMs = 0;
long   g_attPos[];      // positions we have already tried (in-memory only)
int    g_attCnt[];

int NextAttempt(const long posId)
{
   for(int i = 0; i < ArraySize(g_attPos); i++)
      if(g_attPos[i] == posId) { g_attCnt[i]++; return g_attCnt[i]; }
   int n = ArraySize(g_attPos);
   ArrayResize(g_attPos, n + 1);
   ArrayResize(g_attCnt, n + 1);
   g_attPos[n] = posId;
   g_attCnt[n] = 1;
   return 1;
}

// POST a JSON body, return the HTTP status (or -1) and the response text.
int PostJson(const string url, const string body, string &response)
{
   char post[];
   int len = StringToCharArray(body, post, 0, -1, CP_UTF8);
   if(len > 0 && post[len - 1] == 0) len--;
   ArrayResize(post, len);

   char   result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   ResetLastError();
   int status = WebRequest("POST", url, headers, 15000, post, result, resultHeaders);
   if(status == -1)
   {
      Print("TradoSync: candle upload failed, WebRequest error ", GetLastError());
      response = "";
      return -1;
   }
   response = CharArrayToString(result, 0, -1, CP_UTF8);
   return status;
}

// Backend stores symbols upper-cased ("XAUUSDM"); the terminal may call it
// "XAUUSDm" or "XAUUSD.pro" — find the real name, ignoring case.
string ResolveSymbol(const string name)
{
   if(SymbolSelect(name, true)) return name;
   string wanted = name;
   StringToUpper(wanted);
   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
   {
      string s = SymbolName(i, false);
      string up = s;
      StringToUpper(up);
      if(up == wanted)
      {
         SymbolSelect(s, true);
         return s;
      }
   }
   return "";
}

// Server-time -> UTC offset valid AT THE TRADE (not just right now), derived
// from the position's own entry deal. This keeps candles aligned with the
// trade timestamps already stored in Trado even if the broker's clock changed
// (daylight saving) since the trade happened.
long OffsetForPosition(const long posId, const long openUtc)
{
   long offs = g_offsetSeconds;
   if(HistorySelectByPosition(posId))
   {
      int total = HistoryDealsTotal();
      for(int i = 0; i < total; i++)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;
         if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         offs = (long)HistoryDealGetInteger(ticket, DEAL_TIME) - openUtc;
         break;
      }
   }
   if(MathAbs((double)(offs - g_offsetSeconds)) > 7200.0) offs = g_offsetSeconds; // sanity
   return offs;
}

// Copy this trade's candles for every replay timeframe and upload them.
// Returns true once the backend has stored them.
bool CaptureAndSendCandles(const string url, const long posId, const string rawSymbol,
                           const long openUtc, const long closeUtc, const bool lastChance)
{
   string sym    = ResolveSymbol(rawSymbol);
   long   offs   = OffsetForPosition(posId, openUtc);
   string series = "{";
   bool   any = false, covered = false, firstSeries = true;

   if(sym != "")
   {
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      for(int k = 0; k < 6; k++)
      {
         long step = g_tfSecs[k];
         long from = (openUtc / step) * step - (long)CANDLE_BARS_BEFORE * step;
         long to   = (closeUtc / step) * step + (long)CANDLE_BARS_AFTER * step + step - 1;

         MqlRates rates[];
         int n = CopyRates(sym, (ENUM_TIMEFRAMES)g_tfList[k], (datetime)(from + offs), (datetime)(to + offs), rates);
         if(n <= 0) continue;

         long firstUtc = (long)rates[0].time - offs;
         long lastUtc  = (long)rates[n - 1].time - offs;
         if(firstUtc <= openUtc && lastUtc >= (closeUtc / step) * step) covered = true;

         int startIdx = (n > CANDLE_MAX_BARS) ? (n - CANDLE_MAX_BARS) : 0;
         string arr = "[";
         for(int i = startIdx; i < n; i++)
         {
            if(i > startIdx) arr += ",";
            arr += "[" + IntegerToString((long)rates[i].time - offs) + "," +
                   DoubleToString(rates[i].open,  digits) + "," + DoubleToString(rates[i].high, digits) + "," +
                   DoubleToString(rates[i].low,   digits) + "," + DoubleToString(rates[i].close, digits) + "]";
         }
         arr += "]";

         if(!firstSeries) series += ",";
         firstSeries = false;
         series += "\"" + g_tfKeys[k] + "\":" + arr;
         any = true;
      }
   }
   series += "}";

   // History may still be downloading from the broker — try again on the next
   // poll. After a few attempts send whatever we have (possibly nothing) so the
   // backend stops asking for this trade.
   if(!covered && !lastChance) return false;

   string body = "{\"token\":\"" + JsonEscape(InpApiKey) + "\"" +
                 ",\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
                 ",\"positionId\":" + IntegerToString(posId) +
                 ",\"series\":" + series + "}";
   string response = "";
   int status = PostJson(url, body, response);
   if(status != 200)
   {
      Print("TradoSync: candle upload for position ", posId, " got HTTP ", status);
      return false;
   }
   return true;
}

void SyncCandles()
{
   if(!InpSendCandles) return;

   ulong now = GetTickCount64();
   if(g_lastCandleMs != 0 && (now - g_lastCandleMs) < 15000) return;
   g_lastCandleMs = now;

   // Derive the candle endpoints from the sync URL (.../ea/sync -> .../ea/candles).
   string baseUrl = InpServerUrl;
   if(StringReplace(baseUrl, "/ea/sync", "/ea/candles") <= 0) return;

   string request = "{\"token\":\"" + JsonEscape(InpApiKey) + "\"" +
                    ",\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
                    ",\"limit\":2}";
   string response = "";
   if(PostJson(baseUrl + "/pending", request, response) != 200) return;
   if(StringLen(response) == 0) return;      // nothing pending

   string lines[];
   int count = StringSplit(response, '\n', lines);
   for(int i = 0; i < count; i++)
   {
      string parts[];
      if(StringSplit(lines[i], '|', parts) < 4) continue;

      long posId    = StringToInteger(parts[0]);
      long openUtc  = StringToInteger(parts[2]);
      long closeUtc = StringToInteger(parts[3]);
      if(posId <= 0 || openUtc <= 0 || closeUtc < openUtc) continue;

      int  attempt    = NextAttempt(posId);
      bool lastChance = (attempt >= 3);
      if(CaptureAndSendCandles(baseUrl, posId, parts[1], openUtc, closeUtc, lastChance))
         Print("TradoSync: broker candles stored for position ", posId);
   }
}

//+------------------------------------------------------------------+
void DoSync()
{
   bool firstRun = (GlobalVariableCheck(g_gvFirstRun) == false);

   string closedJson = BuildClosedDealsJson(firstRun);
   string openJson    = BuildOpenPositionsJson();
   string accInfoJson   = BuildAccountInfoJson();

   string payload = StringFormat(
      "{\"token\":\"%s\",\"accountInfo\":%s,\"deals\":%s,\"openPositions\":%s}",
      JsonEscape(InpApiKey), accInfoJson, closedJson, openJson
   );

   char post[];
   // NOTE: previously this passed an explicit `count` (StringLen(payload))
   // and then blindly subtracted 1 to "drop the trailing null". With an
   // explicit count, StringToCharArray doesn't reliably append that null —
   // so the blind -1 was chopping off the real last byte of the payload
   // (the closing `}`) instead, truncating every single request. Using -1
   // here always null-terminates, and we only trim that null if it's
   // actually there.
   int len = StringToCharArray(payload, post, 0, -1, CP_UTF8);
   if(len > 0 && post[len - 1] == 0) len--;
   ArrayResize(post, len);

   char   result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   ResetLastError();
   int status = WebRequest("POST", InpServerUrl, headers, 10000, post, result, resultHeaders);

   if(status == -1)
   {
      int err = GetLastError();
      if(err == 4060)
         Alert("TradoSync: add this URL to MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL:\n" + InpServerUrl);
      else
         Print("TradoSync: WebRequest failed, error ", err);
      Comment("Trado Sync: connection error (", err, ") — check Experts log");
      return;
   }

   if(status != 200)
   {
      Print("TradoSync: server responded ", status, " — ", CharArrayToString(result));
      Comment("Trado Sync: server error ", status);
      return;
   }

   if(firstRun) GlobalVariableSet(g_gvFirstRun, 1);

   // The backend knows better than this terminal's local memory whether a
   // full history backfill is actually needed (e.g. the account was just
   // auto-provisioned, or was disconnected and reconnected since this
   // terminal last ran) — if it says so, clear our flag so the very next
   // tick re-triggers a full HistorySelect(0, now) instead of the usual
   // InpHistoryLookbackDays-only window.
   string resultStr = CharArrayToString(result);
   if(StringFind(resultStr, "\"needsBackfill\":true") >= 0)
      GlobalVariableDel(g_gvFirstRun);

   g_lastSyncAt = TimeCurrent();
   Comment("Trado Sync: connected ✓  last sync ", TimeToString(g_lastSyncAt, TIME_MINUTES | TIME_SECONDS));

   // Throttled + bounded; never delays the trade sync above.
   SyncCandles();
}
//+------------------------------------------------------------------+