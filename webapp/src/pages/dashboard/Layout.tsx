import { useEffect, useState, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase, getProfile, upsertProfile, getMyRelationships, getPendingForPartner } from '../../lib/supabase'
import type { Profile, Relationship } from '../../types'

export interface DashboardOutletContext {
  profile: Profile
  ownerRelationships: Relationship[]
  partnerRelationships: Relationship[]
  pendingCount: number
  setPendingCount: (n: number) => void
  refetchRels: () => void
}

export function DashboardLayout() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ownerRelationships, setOwnerRelationships] = useState<Relationship[]>([])
  const [partnerRelationships, setPartnerRelationships] = useState<Relationship[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchRels = useCallback(async (userId: string) => {
    const result = await getMyRelationships(userId)
    setOwnerRelationships(result.asOwner)
    setPartnerRelationships(result.asPartner)

    // Badge count — how many requests need my response as a partner
    const partnerRelIds = result.asPartner.filter(r => r.status === 'active').map(r => r.id)
    if (partnerRelIds.length) {
      const pending = await getPendingForPartner(partnerRelIds)
      setPendingCount(pending.length)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { navigate('/login'); return }

      const { user } = data.session
      let p = await getProfile(user.id)
      if (!p) {
        p = await upsertProfile(user.id, {
          email: user.email ?? '',
          display_name: user.email?.split('@')[0] ?? 'User',
          subscription_status: 'inactive',
        })
      }
      setProfile(p)
      await fetchRels(user.id)
      setLoading(false)
    }
    init()
  }, [navigate, fetchRels])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const refetchRels = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) fetchRels(data.session.user.id)
  }, [fetchRels])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-neutral-600 border-t-red-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile) return null

  const context: DashboardOutletContext = {
    profile,
    ownerRelationships,
    partnerRelationships,
    pendingCount,
    setPendingCount,
    refetchRels,
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-56 bg-neutral-900 border-r border-neutral-800 z-40">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-neutral-800">
          <span className="text-red-600 text-xl font-bold tracking-tight">YT−</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <NavItem to="/dashboard/home" icon={<IconHome />} label="Home" />
          <NavItem to="/dashboard/activity" icon={<IconActivity />} label="Activity" />
          <NavItem to="/dashboard/approvals" icon={<IconApprovals />} label="Approvals" badge={pendingCount} />
          <NavItem to="/dashboard/partners" icon={<IconPartners />} label="Partners" />
        </nav>

        {/* Bottom: settings + user */}
        <div className="px-3 py-4 border-t border-neutral-800 flex flex-col gap-1">
          <NavItem to="/dashboard/settings" icon={<IconSettings />} label="Settings" />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors text-sm w-full text-left"
          >
            <IconSignOut />
            Sign out
          </button>
        </div>

        {/* User identity */}
        <div className="px-4 py-3 border-t border-neutral-800">
          <p className="text-neutral-400 text-xs truncate">{profile.display_name || profile.email}</p>
          <p className="text-neutral-600 text-xs truncate">{profile.email}</p>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-56 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-30 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
          <span className="text-red-600 text-xl font-bold">YT−</span>
          <span className="text-neutral-400 text-sm truncate max-w-[200px]">{profile.display_name || profile.email}</span>
        </header>

        {/* Page content */}
        <div className="flex-1 pb-20 md:pb-0">
          <Outlet context={context} />
        </div>
      </main>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-900 border-t border-neutral-800 flex">
        <MobileTab to="/dashboard/home" icon={<IconHome />} label="Home" />
        <MobileTab to="/dashboard/activity" icon={<IconActivity />} label="Activity" />
        <MobileTab to="/dashboard/approvals" icon={<IconApprovals />} label="Approvals" badge={pendingCount} />
        <MobileTab to="/dashboard/partners" icon={<IconPartners />} label="Partners" />
        <MobileTab to="/dashboard/settings" icon={<IconSettings />} label="Settings" />
      </nav>
    </div>
  )
}

// ── Nav item components ──────────────────────────────────────────────────────

function NavItem({
  to, icon, label, badge,
}: {
  to: string
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-neutral-800 text-white'
            : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
        }`
      }
    >
      <span className="w-5 h-5 flex-shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {!!badge && (
        <span className="bg-red-600 text-white text-xs font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

function MobileTab({
  to, icon, label, badge,
}: {
  to: string
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center gap-1 py-2 px-1 text-xs font-medium transition-colors relative ${
          isActive ? 'text-white' : 'text-neutral-500'
        }`
      }
    >
      <span className="w-5 h-5 relative">
        {icon}
        {!!badge && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {label}
    </NavLink>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M3 12L12 3l9 9" />
      <path d="M9 21V12h6v9" />
      <path d="M3 12v9h18v-9" />
    </svg>
  )
}

function IconActivity() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconApprovals() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  )
}

function IconPartners() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconSignOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// Re-export for sub-pages to use
export { useLocation }
