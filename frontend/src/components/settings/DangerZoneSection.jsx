import { useState } from 'react'
import { AlertTriangle, Trash2, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'

function ConfirmModal({ email, onCancel, onConfirm, deleting }) {
  const [input, setInput] = useState('')
  const matches = input.trim().toLowerCase() === email.toLowerCase()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#19181C', border: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)' }}>
            <AlertTriangle size={18} style={{ color: 'var(--negative-red)' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>This can't be undone</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Type your email address <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{email}</span> to confirm permanent deletion of your account and all data.
        </p>
        <input className="input-dark mb-4" value={input} onChange={e => setInput(e.target.value)}
               placeholder={email} autoFocus />
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="btn-outline flex-1 text-sm py-2.5">Cancel</button>
          <button onClick={onConfirm} disabled={!matches || deleting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'var(--negative-red)', opacity: (!matches || deleting) ? 0.5 : 1 }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DangerZoneSection() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting]       = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete('/user/account')
      toast.success('Your account has been deleted')
      await signOut()
      navigate('/login')
    } catch (err) {
      toast.error(err.message || 'Failed to delete account')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--negative-red)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--negative-red)' }}>Danger Zone</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Irreversible and destructive actions</p>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ height: 3, background: 'var(--negative-red)' }} />
        <div className="p-6 flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)' }}>
              <AlertTriangle size={16} style={{ color: 'var(--negative-red)' }} />
            </div>
            <div>
              <h3 className="text-base font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>Delete Account</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Permanently delete your Trado account and all associated data including trades, journals, and settings. This action cannot be undone.
              </p>
              <p className="flex items-center gap-1.5 text-xs font-semibold mt-3" style={{ color: 'var(--negative-red)' }}>
                <AlertTriangle size={12} /> All your data will be permanently erased
              </p>
            </div>
          </div>
          <button onClick={() => setShowConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--negative-red)', border: '1px solid rgba(239,68,68,0.35)' }}>
            <Trash2 size={14} /> Delete Account
          </button>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <p className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: 'var(--warning-orange)' }}>
          <AlertTriangle size={13} /> Before you go
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          If you're having issues with your account, our support team might be able to help. Consider reaching out before deleting your account.
        </p>
      </div>

      {showConfirm && (
        <ConfirmModal email={user?.email} deleting={deleting}
                      onCancel={() => setShowConfirm(false)} onConfirm={handleDelete} />
      )}
    </div>
  )
}