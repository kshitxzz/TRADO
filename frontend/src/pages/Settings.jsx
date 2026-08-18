import { useState } from 'react'
import { User, Shield, Crown, Share2, Settings as SettingsIcon, AlertTriangle } from 'lucide-react'
import PageWrapper from '../components/layout/PageWrapper'
import { SidebarItem } from '../components/settings/shared'
import ProfileSection from '../components/settings/ProfileSection'
import SecuritySection from '../components/settings/SecuritySection'
import SubscriptionSection from '../components/settings/SubscriptionSection'
import PublicProfileSection from '../components/settings/PublicProfileSection'
import PreferencesSection from '../components/settings/PreferencesSection'
import DangerZoneSection from '../components/settings/DangerZoneSection'

const TABS = [
  { value: 'profile',      label: 'Profile',       sub: 'Personal information',      icon: User,          Comp: ProfileSection },
  { value: 'security',     label: 'Security',      sub: 'Password & authentication',  icon: Shield,        Comp: SecuritySection },
  { value: 'subscription', label: 'Subscription',  sub: 'Plan & billing',             icon: Crown,         Comp: SubscriptionSection },
  { value: 'public',       label: 'Public Profile',sub: 'Share your stats',           icon: Share2,        Comp: PublicProfileSection },
  { value: 'preferences',  label: 'Preferences',   sub: 'Theme & notifications',      icon: SettingsIcon,  Comp: PreferencesSection },
  { value: 'danger',       label: 'Danger Zone',   sub: 'Delete account',             icon: AlertTriangle, Comp: DangerZoneSection, danger: true },
]

export default function Settings() {
  const [tab, setTab] = useState('profile')
  const Active = TABS.find(t => t.value === tab)?.Comp || ProfileSection

  return (
    <PageWrapper>
      <div className="glass-card p-6 mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Manage your account settings and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        <div className="glass-card p-2.5 space-y-1">
          {TABS.map(t => (
            <SidebarItem key={t.value} icon={t.icon} label={t.label} sub={t.sub}
                         active={t.value === tab} danger={t.danger}
                         onClick={() => setTab(t.value)} />
          ))}
        </div>

        <div className="min-w-0">
          <Active />
        </div>
      </div>
    </PageWrapper>
  )
}