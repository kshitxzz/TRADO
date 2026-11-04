const UNITS = [['months', 2592000], ['weeks', 604800], ['days', 86400], ['hours', 3600], ['minutes', 60], ['seconds', 1]];
/** Is drawing `d` visible on a chart whose timeframe is `tfSec` seconds? (Visibility tab of the settings dialog) */
export function visibleOnTf(d, tfSec) {
  const v = d.visibility; if (!v || !tfSec) return true;
  for (const [u, secs] of UNITS) {
    if (tfSec >= secs) { const [min, max, on] = v[u]; const n = tfSec / secs; return !!on && n >= min && n <= max; }
  }
  return v.ticks !== false;
}