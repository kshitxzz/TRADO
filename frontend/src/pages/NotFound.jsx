import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'var(--bg-primary)' }}>
      <div className="text-center">
        <p className="text-8xl font-black gradient-text mb-4">404</p>
        <p className="text-xl font-bold text-white mb-2">Page Not Found</p>
        <p className="text-sm mb-6" style={{ color:'var(--text-muted)' }}>The page you're looking for doesn't exist.</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">Back to Dashboard</button>
      </div>
    </div>
  )
}
