//+------------------------------------------------------------------+
//|                                          TradoCalendarFeed.mq5   |
//|  Pushes MetaTrader 5's built-in economic calendar (MetaQuotes)    |
//|  to your Trado backend so the Economic Calendar page can show     |
//|  Actual / Forecast / Previous (incl. revised previous) live.      |
//|                                                                  |
//|  RUN THIS ON ONE TERMINAL ONLY (yours). Every Trado user sees    |
//|  the values it sends.                                            |
//|                                                                  |
//|  SETUP                                                           |
//|   1. Copy to MQL5/Experts, compile (F7) in MetaEditor.            |
//|   2. Tools > Options > Expert Advisors > tick "Allow WebRequest   |
//|      for listed URL" and add your backend address                 |
//|      (e.g. https://your-backend.onrender.com).                    |
//|   3. Attach to ANY chart. Inputs: InpUrl and InpSecret            |
//|      (InpSecret must equal CALENDAR_FEED_SECRET on the server).   |
//|   4. Keep the terminal running (a VPS is ideal). Check the Experts|
//|      tab: it logs every send and any error.                       |
//+------------------------------------------------------------------+
#property copyright "Trado"
#property version   "1.00"
#property strict

input string InpUrl      = "https://YOUR-BACKEND/api/calendar/feed"; // full URL of POST /api/calendar/feed
input string InpSecret   = "";    // same value as CALENDAR_FEED_SECRET on the server
input int    InpPollSec  = 3;     // how often to look for changed values (seconds)
input int    InpFullSec  = 120;   // how often to resend the whole window (seconds)
input int    InpBackHrs  = 12;    // window start, hours before now
input int    InpAheadHrs = 48;    // window end, hours after now

#define BATCH 80

// Remembers what was last sent for each calendar value so only changes are pushed between full snapshots.
ulong    g_ids[];
string   g_sigs[];
datetime g_lastFull = 0;
bool     g_warnedUrl = false;

// country id -> currency cache
long     g_cIds[];
string   g_cCur[];

//+------------------------------------------------------------------+
string JsonEscape(string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '\\')      out += "\\\\";
      else if(c == '"')  out += "\\\"";
      else if(c == '\n') out += "\\n";
      else if(c == '\r') out += "\\r";
      else if(c == '\t') out += "\\t";
      else if(c < 32)    out += " ";
      else               out += ShortToString(c);
     }
   return out;
  }

//+------------------------------------------------------------------+
string CurrencyOf(const long countryId)
  {
   int n = ArraySize(g_cIds);
   for(int i = 0; i < n; i++)
      if(g_cIds[i] == countryId)
         return g_cCur[i];
   MqlCalendarCountry c;
   string cur = "";
   if(CalendarCountryById(countryId, c))
      cur = c.currency;
   ArrayResize(g_cIds, n + 1);
   ArrayResize(g_cCur, n + 1);
   g_cIds[n] = countryId;
   g_cCur[n] = cur;
   return cur;
  }

// Explicit mappings so the backend never depends on enum ordinal values.
int ImportanceCode(const ENUM_CALENDAR_EVENT_IMPORTANCE v)
  {
   switch(v)
     {
      case CALENDAR_IMPORTANCE_LOW:      return 1;
      case CALENDAR_IMPORTANCE_MODERATE: return 2;
      case CALENDAR_IMPORTANCE_HIGH:     return 3;
     }
   return 0;
  }

int MultiplierCode(const ENUM_CALENDAR_EVENT_MULTIPLIER v)
  {
   switch(v)
     {
      case CALENDAR_MULTIPLIER_THOUSANDS: return 1;
      case CALENDAR_MULTIPLIER_MILLIONS:  return 2;
      case CALENDAR_MULTIPLIER_BILLIONS:  return 3;
      case CALENDAR_MULTIPLIER_TRILLIONS: return 4;
     }
   return 0;
  }

string NumOrNull(const bool has, const double v)
  {
   return has ? DoubleToString(v, 6) : "null";
  }

//+------------------------------------------------------------------+
// Builds one JSON event + its change signature. Returns false for rows we do not send.
bool BuildRow(MqlCalendarValue &v, string &json, string &sig)
  {
   MqlCalendarEvent ev;
   if(!CalendarEventById(v.event_id, ev))
      return false;
   string cur = CurrencyOf(ev.country_id);
   if(cur == "")
      return false;

   bool hasA = v.HasActualValue();
   bool hasF = v.HasForecastValue();
   bool hasP = v.HasPreviousValue();
   bool hasR = v.HasRevisedValue();
   string a = NumOrNull(hasA, hasA ? v.GetActualValue() : 0.0);
   string f = NumOrNull(hasF, hasF ? v.GetForecastValue() : 0.0);
   string p = NumOrNull(hasP, hasP ? v.GetPreviousValue() : 0.0);
   string r = NumOrNull(hasR, hasR ? v.GetRevisedValue() : 0.0);

   int type = (ev.type == CALENDAR_TYPE_HOLIDAY) ? 2 : 0;
   int unit = (ev.unit == CALENDAR_UNIT_PERCENT) ? 1 : 0;

   json = "{\"id\":" + IntegerToString((long)v.id) +
          ",\"cur\":\"" + cur + "\"" +
          ",\"name\":\"" + JsonEscape(ev.name) + "\"" +
          ",\"t\":" + IntegerToString((long)v.time) +
          ",\"imp\":" + IntegerToString(ImportanceCode(ev.importance)) +
          ",\"type\":" + IntegerToString(type) +
          ",\"unit\":" + IntegerToString(unit) +
          ",\"mult\":" + IntegerToString(MultiplierCode(ev.multiplier)) +
          ",\"dig\":" + IntegerToString((int)ev.digits) +
          ",\"a\":" + a + ",\"f\":" + f + ",\"p\":" + p + ",\"r\":" + r + "}";
   sig = a + "|" + f + "|" + p + "|" + r + "|" + IntegerToString((long)v.time);
   return true;
  }

//+------------------------------------------------------------------+
int FindSig(const ulong id)
  {
   int n = ArraySize(g_ids);
   for(int i = 0; i < n; i++)
      if(g_ids[i] == id)
         return i;
   return -1;
  }

void StoreSig(const ulong id, const string sig)
  {
   int i = FindSig(id);
   if(i < 0)
     {
      i = ArraySize(g_ids);
      ArrayResize(g_ids, i + 1);
      ArrayResize(g_sigs, i + 1);
      g_ids[i] = id;
     }
   g_sigs[i] = sig;
  }

//+------------------------------------------------------------------+
// POST one batch. Returns true only on HTTP 200.
bool PostBatch(const string events, const bool full)
  {
   long offset = (long)MathRound((double)(TimeTradeServer() - TimeGMT()) / 900.0) * 900;
   string body = "{\"secret\":\"" + JsonEscape(InpSecret) + "\"" +
                 ",\"serverOffsetSec\":" + IntegerToString(offset) +
                 ",\"full\":" + (full ? "true" : "false") +
                 ",\"events\":[" + events + "]}";

   char data[], result[];
   string resHeaders;
   StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, ArraySize(data) - 1);          // drop the trailing zero

   ResetLastError();
   int status = WebRequest("POST", InpUrl, "Content-Type: application/json\r\n", 8000, data, result, resHeaders);
   if(status == -1)
     {
      if(!g_warnedUrl)
        {
         Print("TradoCalendarFeed: WebRequest failed, error ", GetLastError(),
               ". Add the backend address under Tools > Options > Expert Advisors > Allow WebRequest.");
         g_warnedUrl = true;
        }
      return false;
     }
   if(status != 200)
     {
      Print("TradoCalendarFeed: server answered ", status, " ", CharArrayToString(result, 0, 200, CP_UTF8));
      return false;
     }
   g_warnedUrl = false;
   return true;
  }

//+------------------------------------------------------------------+
// Reads the calendar window and sends either everything (full) or only values that changed.
void Sync(const bool full)
  {
   MqlCalendarValue values[];
   datetime now = TimeTradeServer();
   int n = CalendarValueHistory(values, now - InpBackHrs * 3600, now + InpAheadHrs * 3600);
   if(n <= 0)
      return;

   string batch = "";
   int inBatch = 0, sent = 0;
   ulong  pendIds[BATCH];
   string pendSigs[BATCH];

   for(int i = 0; i < n; i++)
     {
      string json, sig;
      if(!BuildRow(values[i], json, sig))
         continue;
      if(!full)
        {
         int k = FindSig(values[i].id);
         if(k >= 0 && g_sigs[k] == sig)
            continue;
        }
      batch += (inBatch > 0 ? "," : "") + json;
      pendIds[inBatch] = values[i].id;
      pendSigs[inBatch] = sig;
      inBatch++;

      if(inBatch == BATCH)
        {
         if(!PostBatch(batch, full && sent == 0))
            return;
         for(int j = 0; j < inBatch; j++)
            StoreSig(pendIds[j], pendSigs[j]);
         sent += inBatch;
         batch = "";
         inBatch = 0;
        }
     }

   if(inBatch > 0)
     {
      if(!PostBatch(batch, full && sent == 0))
         return;
      for(int j = 0; j < inBatch; j++)
         StoreSig(pendIds[j], pendSigs[j]);
      sent += inBatch;
     }

   if(sent > 0)
      Print("TradoCalendarFeed: sent ", sent, full ? " events (full snapshot)" : " changed event(s)");
   if(full)
      g_lastFull = TimeLocal();
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(InpSecret) < 8)
     {
      Print("TradoCalendarFeed: set InpSecret to the CALENDAR_FEED_SECRET value from your server (min 8 chars).");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(StringFind(InpUrl, "YOUR-BACKEND") >= 0)
     {
      Print("TradoCalendarFeed: set InpUrl to your backend's /api/calendar/feed address.");
      return INIT_PARAMETERS_INCORRECT;
     }
   EventSetTimer(MathMax(1, InpPollSec));
   Sync(true);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   bool full = (g_lastFull == 0 || TimeLocal() - g_lastFull >= InpFullSec);
   Sync(full);
  }

void OnTick() {}
//+------------------------------------------------------------------+
