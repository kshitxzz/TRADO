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
//|                                                                    |
//| CALENDAR FEEDER (optional, for ONE terminal only — normally yours) |
//| Set InpPushCalendar = true and TradoSync also pushes the actual    |
//| values of MT5's built-in economic calendar to Trado's shared       |
//| calendar. Your Trado user ID must be listed in the server's        |
//| CALENDAR_FEEDER_USER_IDS. Leave it false on every other terminal — |
//| then none of the calendar code ever runs and trade sync is exactly |
//| as before. The calendar push never runs inside the trade-sync path.|
//+------------------------------------------------------------------+
#property copyright "Trado"
#property version   "1.21"
#property strict

//──── Inputs ─────────────────────────────────────────────────────────
input string InpApiKey              = "";                                     // Sync Key (from Trado Accounts page)
input string InpServerUrl           = "https://your-backend.example.com/api/broker/ea/sync"; // Webhook URL (from Trado Accounts page)
input int    InpMinTickSyncMs       = 1000;                                    // Fastest allowed sync on price ticks (ms) — floor, not a fixed interval
input int    InpSyncIntervalSeconds = 5;                                       // Fallback timer — catches symbols/quiet periods with no ticks
input int    InpHistoryLookbackDays = 7;                                      // Rolling window after the first full sync
input bool   InpSendCandles         = true;                                   // Upload this broker's own candles around each closed trade (Trade Replay)
input bool   InpPushCalendar        = false;                                  // FEEDER ONLY: push MT5 economic-calendar actuals to Trado. Leave OFF on normal terminals.
input int    InpCalendarPollSeconds = 10;                                     // Feeder: how often to look for new calendar values (min 5)

//──── State ──────────────────────────────────────────────────────────
int      g_offsetSeconds = 0;     // broker-server-time -> UTC offset, auto-detected
datetime g_lastSyncAt     = 0;
ulong    g_lastSyncMs     = 0;    // ms clock — throttle floor for tick-driven syncs
string   g_gvFirstRun;            // GlobalVariable name — persists across terminal restarts

// Calendar feeder state (only touched when InpPushCalendar = true)
ulong    g_calChangeId      = 0;  // MT5 calendar change cursor
ulong    g_calLastPollMs    = 0;
ulong    g_calLastHistMs    = 0;  // last 24 h refresh
int      g_calBackfillDay   = 0;  // 0..7 = back-filling that many days ago; 8 = done
ulong    g_calLastFullMs    = 0;  // when the last full 8-day back-fill started
string   g_calBoot          = ""; // Trado server restart id from the last reply
ulong    g_calBackoffUntil  = 0;
int      g_calFails         = 0;
bool     g_calRefusedLogged = false;
ulong    g_ceId[];                // event info cache: name + currency never change
string   g_ceName[];
string   g_ceCur[];

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
   if(InpPushCalendar)
      Print("TradoSync: calendar feeder is ON — new MT5 economic-calendar actuals are pushed to Trado (checked every ",
            MathMax(InpCalendarPollSeconds, 5), " s). Use an English-language terminal for the clearest names.");
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

void OnTimer() { SyncIfDue(); CalendarTick(); }

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
int PostJson(const string url, const string body, string &response, const int timeoutMs = 15000)
{
   char post[];
   int len = StringToCharArray(body, post, 0, -1, CP_UTF8);
   if(len > 0 && post[len - 1] == 0) len--;
   ArrayResize(post, len);

   char   result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   ResetLastError();
   int status = WebRequest("POST", url, headers, timeoutMs, post, result, resultHeaders);
   if(status == -1)
   {
      Print("TradoSync: request failed, WebRequest error ", GetLastError());
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
   if(!covered)
      Print("TradoSync: no complete candle history yet for position ", posId, " (", rawSymbol, ")",
            lastChance ? " - giving up on this trade" : " - will retry");
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
   Print("TradoSync: ", count, " closed trade(s) awaiting broker candles");
   for(int i = 0; i < count; i++)
   {
      string parts[];
      if(StringSplit(lines[i], '|', parts) < 4) continue;

      long posId    = StringToInteger(parts[0]);
      long openUtc  = StringToInteger(parts[2]);
      long closeUtc = StringToInteger(parts[3]);
      if(posId <= 0 || openUtc <= 0 || closeUtc < openUtc) continue;

      int  attempt    = NextAttempt(posId);
      bool lastChance = (attempt >= 6);   // ~90 s: MT5 downloads missing history in the background
      if(CaptureAndSendCandles(baseUrl, posId, parts[1], openUtc, closeUtc, lastChance))
         Print("TradoSync: broker candles stored for position ", posId);
   }
}


//+------------------------------------------------------------------+
//| CALENDAR FEEDER (InpPushCalendar = true only)                      |
//| Reads actual values from MT5's built-in economic calendar and       |
//| pushes them to Trado. Local lookups first; the network is touched   |
//| only when there is something new, with a short timeout and an       |
//| exponential back-off, and never from inside DoSync().               |
//| After every start (and whenever the Trado server restarts) the last |
//| 8 days are re-sent, one day per poll, so the whole week fills in.   |
//+------------------------------------------------------------------+

// The currencies Trado's calendar lists.
bool CalWantedCurrency(const string cur)
{
   return (cur == "USD" || cur == "EUR" || cur == "GBP" || cur == "JPY" || cur == "AUD" ||
           cur == "NZD" || cur == "CAD" || cur == "CHF" || cur == "CNY");
}

// Pull "key":"value" out of a flat JSON reply.
string JsonStringField(const string json, const string key)
{
   string needle = "\"" + key + "\":\"";
   int p = StringFind(json, needle);
   if(p < 0) return "";
   p += StringLen(needle);
   int q = StringFind(json, "\"", p);
   if(q < 0) return "";
   return StringSubstr(json, p, q - p);
}

// Event name + currency, cached (they never change for an event id).
bool CalEventInfo(const ulong eventId, string &name, string &cur)
{
   int n = ArraySize(g_ceId);
   for(int i = 0; i < n; i++)
   {
      if(g_ceId[i] == eventId)
      {
         name = g_ceName[i];
         cur  = g_ceCur[i];
         return true;
      }
   }

   MqlCalendarEvent calEvent;
   if(!CalendarEventById(eventId, calEvent)) return false;
   MqlCalendarCountry country;
   if(!CalendarCountryById((long)calEvent.country_id, country)) return false;
   if(StringLen(country.currency) != 3) return false;      // pseudo-countries without a real currency

   if(n >= 800)                                            // keep the cache bounded
   {
      ArrayResize(g_ceId, 0);
      ArrayResize(g_ceName, 0);
      ArrayResize(g_ceCur, 0);
      n = 0;
   }
   ArrayResize(g_ceId,   n + 1);
   ArrayResize(g_ceName, n + 1);
   ArrayResize(g_ceCur,  n + 1);
   g_ceId[n]   = eventId;
   g_ceName[n] = calEvent.name;
   g_ceCur[n]  = country.currency;
   name = calEvent.name;
   cur  = country.currency;
   return true;
}

string CalNum(const double v)
{
   if(!MathIsValidNumber(v)) return "null";
   return DoubleToString(v, 6);
}

// One calendar value as a JSON object, or "" when it has no actual yet / no usable event info.
string CalValueJson(MqlCalendarValue &v, const int offsetSeconds)
{
   if(!v.HasActualValue()) return "";

   string name = "", cur = "";
   if(!CalEventInfo(v.event_id, name, cur)) return "";
   if(!CalWantedCurrency(cur)) return "";

   string prev = "null", revised = "null", fcst = "null";
   if(v.HasPreviousValue()) prev    = CalNum(v.GetPreviousValue());
   if(v.HasRevisedValue())  revised = CalNum(v.GetRevisedValue());
   if(v.HasForecastValue()) fcst    = CalNum(v.GetForecastValue());

   long utc = (long)v.time - (long)offsetSeconds;           // calendar times are trade-server time
   return "{\"id\":" + IntegerToString((long)v.id) +
          ",\"cur\":\"" + JsonEscape(cur) + "\"" +
          ",\"name\":\"" + JsonEscape(name) + "\"" +
          ",\"t\":" + IntegerToString(utc) +
          ",\"a\":" + CalNum(v.GetActualValue()) +
          ",\"p\":" + prev +
          ",\"rp\":" + revised +
          ",\"f\":" + fcst + "}";
}

// Append released values that have an actual to `items`, newest first, at most 200 per push.
void CalCollect(MqlCalendarValue &vals[], const int n, const int offsetSeconds, string &items, int &count)
{
   datetime nowServer = TimeTradeServer();
   for(int i = n - 1; i >= 0 && count < 200; i--)
   {
      if(vals[i].time > nowServer + 600) continue;          // not released yet
      string one = CalValueJson(vals[i], offsetSeconds);
      if(one == "") continue;
      if(count > 0) items += ",";
      items += one;
      count++;
   }
}

// A history window was handled (sent, or had nothing to send): move on.
void CalHistDone(const int histKind, const ulong now)
{
   if(histKind == 1) g_calBackfillDay++;
   else if(histKind == 2) g_calLastHistMs = now;
}

void CalendarTick()
{
   if(!InpPushCalendar) return;

   ulong now = GetTickCount64();
   if(now < g_calBackoffUntil) return;
   if(g_calLastPollMs != 0 && (now - g_calLastPollMs) < (ulong)MathMax(InpCalendarPollSeconds, 5) * 1000) return;
   g_calLastPollMs = now;

   int      offsetSeconds = (int)(TimeTradeServer() - TimeGMT());
   datetime serverNow     = TimeTradeServer();
   string   items = "";
   int      count = 0;

   // 1) What changed since the last poll (new actuals, revisions) — local lookup, no network.
   if(g_calChangeId == 0)
   {
      MqlCalendarValue none[];
      ulong cid = 0;
      CalendarValueLast(cid, none);       // the first call only returns the current change id
      g_calChangeId = cid;
   }
   else
   {
      MqlCalendarValue changes[];
      int nChanges = CalendarValueLast(g_calChangeId, changes);
      if(nChanges > 0) CalCollect(changes, nChanges, offsetSeconds, items, count);
   }

   // 2) One history window per poll: first the 8-day back-fill (one day at a time, newest day first), then a
   //    24 h refresh every 20 minutes. The back-fill repeats every 3 h and whenever the Trado server restarts.
   if(g_calLastFullMs == 0) g_calLastFullMs = now;
   if(g_calBackfillDay >= 8 && (now - g_calLastFullMs) >= 3 * 3600 * 1000)
   {
      g_calBackfillDay = 0;
      g_calLastFullMs  = now;
   }

   int histKind = 0;                      // 0 = none, 1 = back-fill day g_calBackfillDay, 2 = 24 h refresh
   int histDay  = 0;
   if(g_calBackfillDay < 8)
   {
      histKind = 1;
      histDay  = g_calBackfillDay;
   }
   else if(g_calLastHistMs == 0 || (now - g_calLastHistMs) >= 20 * 60 * 1000)
   {
      histKind = 2;
   }

   if(histKind != 0)
   {
      MqlCalendarValue hist[];
      long     span = (long)histDay * 86400;
      datetime to   = (datetime)((long)serverNow + 300 - span);
      datetime from = (datetime)((long)to - 86400);
      int nHist = CalendarValueHistory(hist, from, to);
      if(nHist > 0) CalCollect(hist, nHist, offsetSeconds, items, count);
   }

   if(count == 0)
   {
      CalHistDone(histKind, now);         // nothing to send for this window: just move on
      return;
   }

   string url = InpServerUrl;
   if(StringReplace(url, "/broker/ea/sync", "/calendar/feed") <= 0)
   {
      Print("TradoSync: calendar feed switched off — cannot derive its URL from the Server URL input.");
      g_calBackoffUntil = now + 3600 * 1000;
      return;
   }

   string body = "{\"token\":\"" + JsonEscape(InpApiKey) + "\"" +
                 ",\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) +
                 ",\"values\":[" + items + "]}";
   string response = "";
   int status = PostJson(url, body, response, 4000);

   if(status == 200)
   {
      g_calFails = 0;
      g_calRefusedLogged = false;
      CalHistDone(histKind, now);

      string boot = JsonStringField(response, "boot");
      if(StringLen(boot) > 0)
      {
         if(StringLen(g_calBoot) > 0 && boot != g_calBoot)
         {
            g_calBackfillDay = 0;         // the server restarted and lost its in-memory feed: send the last 8 days again
            g_calLastFullMs  = now;
            Print("TradoSync: Trado server restarted — re-sending the last 8 days of calendar values");
         }
         g_calBoot = boot;
      }
      Print("TradoSync: calendar feed sent ", count, " value(s)");
      return;
   }

   if(status == 401 || status == 403 || status == 503)
   {
      if(!g_calRefusedLogged)
         Print("TradoSync: calendar feed refused (HTTP ", status, ") — this Trado user is not an allowed feeder, or the feed is off on the server (CALENDAR_FEEDER_USER_IDS).");
      g_calRefusedLogged = true;
      g_calBackoffUntil  = now + 10 * 60 * 1000;
      return;
   }

   // Network / server trouble: retry the same window, and wait longer after every failure (30 s … 5 min).
   g_calFails++;
   g_calLastHistMs = 0;                   // changes read above are not re-delivered — do a 24 h refresh soon
   int waitSec = MathMin(300, 15 * (1 << MathMin(g_calFails, 5)));
   g_calBackoffUntil = now + (ulong)waitSec * 1000;
   Print("TradoSync: calendar feed push failed (HTTP ", status, ") — retrying in ", waitSec, " s");
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