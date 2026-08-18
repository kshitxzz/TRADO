import { useState } from 'react'
import { Sun, Moon, Clock, DollarSign, Mail, Bell, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { SectionHeader, Toggle, SavedBadge, SettingsSelect, BLUE } from './shared'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useTimezone, TIMEZONES } from '../../hooks/useTimezone'

const CURRENCIES = [
  { code: 'INR', symbol: '₹',  label: 'Indian Rupee' },
  { code: 'USD', symbol: '$',  label: 'US Dollar' },
  { code: 'EUR', symbol: '€',  label: 'Euro' },
  { code: 'GBP', symbol: '£',  label: 'British Pound' },
  { code: 'JPY', symbol: '¥',  label: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
]

const NOTIF_KEY = 'trado_notif_prefs'

function flashSaved(setShow) {
  setShow(true)
  setTimeout(() => setShow(false), 1800)
}

export default function PreferencesSection() {
  const { user, profile, fetchProfile } = useAuth()
  const { theme, setTheme } = useTheme()
  const { timezone, setTimezone } = useTimezone()
  const [currency, setCurrencyState] = useState(profile?.currency || 'INR')
  const [notif, setNotif] = useState(() => ({ email: false, push: false, ...(profile?.notification_settings || {}) }))
  const [saved, setSaved] = useState(false)

  async function chooseTheme(next) {
    if (next === theme) return
    setTheme(next)
    flashSaved(setSaved)
    const { error } = await supabase.from('users').update({ theme: next }).eq('id', user.id)
    if (!error) fetchProfile(user.id)
  }

  async function chooseTimezone(tz) {
    setTimezone(tz)
    flashSaved(setSaved)
    const { error } = await supabase.from('users').update({ timezone: tz }).eq('id', user.id)
    if (!error) fetchProfile(user.id)
  }

  async function chooseCurrency(code) {
    setCurrencyState(code)
    flashSaved(setSaved)
    const { error } = await supabase.from('users').update({ currency: code }).eq('id', user.id)
    if (error) toast.error(error.message)
    else fetchProfile(user.id)
  }

  async function toggleNotif(key) {
    const next = { ...notif, [key]: !notif[key] }

    // Turning Push on: ask for browser notification permission right away
    // (rather than silently waiting for the first alert to trigger the
    // prompt) so the toggle's state honestly reflects what will happen.
    if (key === 'push' && next.push && typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') {
        try { next.pushPermission = await Notification.requestPermission() }
        catch { next.pushPermission = 'default' }
      } else {
        next.pushPermission = Notification.permission
      }
      if (next.pushPermission === 'denied') {
        toast.error("Browser notifications are blocked — you'll still get in-app alerts, but not OS-level popups. Enable them in your browser's site settings to get both.")
      }
    }

    setNotif(next)
    localStorage.setItem(NOTIF_KEY, JSON.stringify(next))
    flashSaved(setSaved)

    const { error } = await supabase.from('users').update({ notification_settings: next }).eq('id', user.id)
    if (error) toast.error(error.message)
    else fetchProfile(user.id)
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={Sun} title="Preferences" sub="Customize your experience" right={<SavedBadge show={saved} />} />

      <div className="glass-card p-6">
        <p className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Appearance</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'light', Icon: Sun,  title: 'Light', sub: 'Bright and clean' },
            { key: 'dark',  Icon: Moon, title: 'Dark',  sub: 'Easy on the eyes' },
          ].map(opt => {
            const active = theme === opt.key
            return (
              <button key={opt.key} onClick={() => chooseTheme(opt.key)}
                      className="relative rounded-2xl p-6 flex flex-col items-center text-center transition-colors"
                      style={{
                        background: active ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.025)',
                        border: active ? `1.5px solid ${BLUE}` : '1px solid rgba(255,255,255,0.07)',
                      }}>
                {active && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: BLUE }}>
                    <Check size={12} color="#fff" />
                  </span>
                )}
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)' }}>
                  <opt.Icon size={20} style={{ color: active ? BLUE : 'var(--text-secondary)' }} />
                </div>
                <p className="text-sm font-bold" style={{ color: active ? BLUE : 'var(--text-primary)' }}>{opt.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.sub}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Clock size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Timezone</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Set your local timezone</p>
          </div>
        </div>
        <SettingsSelect value={timezone} onChange={chooseTimezone}
                        options={TIMEZONES.map(tz => ({ value: tz.value, label: tz.label }))} />

        <div className="my-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />

        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <DollarSign size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Display Currency</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Choose your preferred currency</p>
          </div>
        </div>
        <SettingsSelect value={currency} onChange={chooseCurrency}
                        options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} (${c.symbol}) — ${c.label}` }))} />
      </div>

      <div className="glass-card p-6">
        <p className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Notifications</p>
        <div className="space-y-1">
          {[
            { key: 'email', Icon: Mail, title: 'Email Notifications', sub: 'Receive updates and alerts via email' },
            { key: 'push',  Icon: Bell, title: 'Push Notifications',  sub: 'Get real-time browser notifications' },
          ].map(row => (
            <div key={row.key} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <row.Icon size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{row.title}</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.sub}</p>
                  {row.key === 'push' && notif.push && notif.pushPermission === 'denied' && (
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--warning-orange)' }}>Browser popups blocked — in-app alerts still on</p>
                  )}
                </div>
              </div>
              <Toggle on={notif[row.key]} onToggle={() => toggleNotif(row.key)} />
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>Settings are saved automatically</p>
    </div>
  )
}