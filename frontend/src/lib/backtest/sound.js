// ─────────────────────────────────────────────────────────────────────────
// Backtesting — execution sounds, synthesised with WebAudio (no audio files).
// Browsers only allow audio after a user gesture; every call is wrapped so a
// blocked or missing AudioContext never throws.
// ─────────────────────────────────────────────────────────────────────────

let ctx = null
const audio = () => {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch { return null }
}

// [frequency Hz, start s, length s, wave]
const KINDS = {
  calling: [[880, 0, 0.12, 'sine'], [1174, 0.14, 0.12, 'sine'], [880, 0.34, 0.12, 'sine'], [1174, 0.48, 0.16, 'sine']],
  chime:   [[1318, 0, 0.18, 'sine'], [1760, 0.12, 0.3, 'sine']],
  ping:    [[1568, 0, 0.22, 'triangle']],
  pop:     [[520, 0, 0.07, 'square'], [320, 0.05, 0.08, 'square']],
  beep:    [[740, 0, 0.16, 'square']],
}

/** @param volume 0..1 */
export function playSound(kind = 'calling', volume = 0.5) {
  const a = audio()
  if (!a || volume <= 0) return
  const t0 = a.currentTime
  for (const [freq, start, len, wave] of KINDS[kind] || KINDS.calling) {
    const osc = a.createOscillator(), gain = a.createGain()
    osc.type = wave; osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0 + start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.25), t0 + start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len)
    osc.connect(gain).connect(a.destination)
    osc.start(t0 + start); osc.stop(t0 + start + len + 0.02)
  }
}