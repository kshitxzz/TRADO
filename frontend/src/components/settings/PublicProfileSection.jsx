import { useState } from 'react'
import { Share2, Eye, AlertCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { SectionHeader, Toggle } from './shared'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function PublicProfileSection() {
  const { user, profile, fetchProfile } = useAuth()
  const [enabled, setEnabled] = useState(!!profile?.public_profile_enabled)
  const [saving, setSaving]   = useState(false)

  async function handleToggle(next) {
    setEnabled(next)
    setSaving(true)
    const payload = { public_profile_enabled: next }
    if (next && !profile?.public_slug) {
      const base = slugify(`${profile?.first_name || ''}-${profile?.last_name || ''}`.trim()) || slugify(user.email.split('@')[0])
      payload.public_slug = `${base}-${user.id.slice(0, 6)}`
    }
    const { error } = await supabase.from('users').update(payload).eq('id', user.id)
    setSaving(false)
    if (error) { setEnabled(!next); toast.error(error.message); return }
    await fetchProfile(user.id)
    toast.success(next ? 'Public profile enabled' : 'Public profile disabled')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionHeader icon={Share2} title="Public Profile" sub="Share your trading stats with others" />
        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning-orange)' }}>
          <AlertCircle size={12} /> Unverified
        </span>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <Eye size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Enable Public Profile</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Make your stats visible to others</p>
            </div>
          </div>
          {saving ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} /> : <Toggle on={enabled} onToggle={() => handleToggle(!enabled)} />}
        </div>
      </div>
    </div>
  )
}