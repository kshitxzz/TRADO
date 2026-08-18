import { useState } from 'react'
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { SectionHeader, Toggle, BLUE } from './shared'
import { useAuth } from '../../hooks/useAuth'

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input className="input-dark pr-10" type={show ? 'text' : 'password'} value={value}
             placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export default function SecuritySection() {
  const { user, signIn, updatePassword } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function submit() {
    if (!form.current) { toast.error('Enter your current password'); return }
    if (form.next.length < 6) { toast.error('New password must be at least 6 characters'); return }
    if (form.next !== form.confirm) { toast.error('Passwords do not match'); return }

    setSaving(true)
    // Verify the current password by re-authenticating before allowing the change.
    const { error: signInError } = await signIn(user.email, form.current)
    if (signInError) {
      setSaving(false)
      toast.error('Current password is incorrect')
      return
    }
    const { error } = await updatePassword(form.next)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Password updated successfully')
    setForm({ current: '', next: '', confirm: '' })
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <SectionHeader icon={Lock} title="Change Password" sub="Update your password to keep your account secure" />
        <div className="space-y-4 mt-5">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>Current Password</label>
            <PasswordInput value={form.current} onChange={v => set('current', v)} placeholder="Enter current password" />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>New Password</label>
            <PasswordInput value={form.next} onChange={v => set('next', v)} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>Confirm New Password</label>
            <PasswordInput value={form.confirm} onChange={v => set('confirm', v)} placeholder="Re-enter new password" />
          </div>
          <button onClick={submit} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: BLUE, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <ShieldAlert size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Two-Factor Authentication</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning-orange)' }}>COMING SOON</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Add an extra layer of security to your account</p>
            </div>
          </div>
          <Toggle on={false} disabled />
        </div>
      </div>
    </div>
  )
}