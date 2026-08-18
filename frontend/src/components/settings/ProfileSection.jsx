import { useState } from 'react'
import { User, Mail, Phone, Globe2, FileText, Pencil, Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import CountrySelect from './CountrySelect'
import { BLUE } from './shared'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

function Field({ icon: Icon, label, value, onChange, editing, placeholder, type = 'text' }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} style={{ color: 'var(--text-muted)' }} />
        <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</label>
      </div>
      {editing ? (
        <input className="input-dark" type={type} value={value ?? ''} placeholder={placeholder}
               onChange={e => onChange(e.target.value)} />
      ) : (
        <p className="text-sm font-medium py-2.5" style={{ color: 'var(--text-primary)' }}>{value || '—'}</p>
      )}
    </div>
  )
}

export default function ProfileSection() {
  const { user, profile, fetchProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name:  profile?.last_name  || '',
    country:    profile?.country    || '',
    phone:      profile?.phone      || '',
    bio:        profile?.bio        || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function startEdit() {
    setForm({
      first_name: profile?.first_name || '',
      last_name:  profile?.last_name  || '',
      country:    profile?.country    || '',
      phone:      profile?.phone      || '',
      bio:        profile?.bio        || '',
    })
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    const full_name = `${form.first_name} ${form.last_name}`.trim()
    const { error } = await supabase.from('users').update({
      first_name: form.first_name || null,
      last_name:  form.last_name  || null,
      country:    form.country    || null,
      phone:      form.phone      || null,
      bio:        form.bio        || null,
      full_name:  full_name || null,
    }).eq('id', user.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    await fetchProfile(user.id)
    setEditing(false)
    toast.success('Profile saved successfully!')
  }

  const displayName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
    || profile?.full_name || 'Trader'
  const initial = (profile?.first_name?.[0] || user?.email?.[0] || 'T').toUpperCase()

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
                 style={{ background: 'var(--gradient-primary)' }}>
              {initial}
            </div>
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>Personal information</p>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <Mail size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{user?.email}</span>
              </div>
            </div>
          </div>
          {!editing ? (
            <button onClick={startEdit}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex-shrink-0"
                    style={{ background: BLUE }}>
              <Pencil size={14} /> Edit Profile
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setEditing(false)} className="btn-outline text-sm px-4 py-2.5">Cancel</button>
              <button onClick={save} disabled={saving}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                      style={{ background: BLUE, opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Personal Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field icon={User} label="First Name" value={editing ? form.first_name : profile?.first_name}
                   editing={editing} placeholder="First name" onChange={v => set('first_name', v)} />
            <Field icon={User} label="Last Name" value={editing ? form.last_name : profile?.last_name}
                   editing={editing} placeholder="Last name" onChange={v => set('last_name', v)} />
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Globe2 size={12} style={{ color: 'var(--text-muted)' }} />
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Country</label>
            </div>
            {editing ? (
              <div className="input-dark flex items-center">
                <CountrySelect value={form.country} onChange={v => set('country', v)} />
              </div>
            ) : (
              <p className="text-sm font-medium py-2.5" style={{ color: 'var(--text-primary)' }}>{profile?.country || '—'}</p>
            )}
          </div>
        </div>

        <div className="pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Contact &amp; Reach</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field icon={Phone} label="Phone Number" value={editing ? form.phone : profile?.phone}
                   editing={editing} placeholder="Phone number" onChange={v => set('phone', v)} />
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Mail size={12} style={{ color: 'var(--text-muted)' }} />
                <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Email Address</label>
              </div>
              <p className="text-sm font-medium py-2.5" style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>About You</p>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText size={12} style={{ color: 'var(--text-muted)' }} />
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Biography</label>
          </div>
          {editing ? (
            <textarea className="input-dark" rows={3} value={form.bio}
                      placeholder="Tell us about your trading journey..."
                      onChange={e => set('bio', e.target.value)} />
          ) : (
            <p className="text-sm py-2.5" style={{ color: profile?.bio ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {profile?.bio || 'Tell us about your trading journey...'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}