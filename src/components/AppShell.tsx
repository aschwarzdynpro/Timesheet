import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart3, Building2, CalendarCheck, Clock3, Download, FolderKanban, LayoutDashboard,
  LogOut, Receipt, SlidersHorizontal, Tags, Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/',              label: 'Zeiten',          icon: Clock3 },
  { to: '/spesen',        label: 'Spesen',          icon: Receipt },
  { to: '/auswertungen',  label: 'Auswertungen',    icon: BarChart3 },
  { to: '/perioden',      label: 'Perioden',        icon: CalendarCheck },
  { to: '/export',        label: 'Export',          icon: Download },
  { to: '/uebersicht',    label: 'Übersicht',       icon: LayoutDashboard },
  { to: '/kunden',        label: 'Kunden',          icon: Building2 },
  { to: '/projekte',      label: 'Projekte',        icon: FolderKanban },
  { to: '/taetigkeiten',  label: 'Tätigkeitsarten', icon: Tags },
  { to: '/spesenarten',   label: 'Spesenarten',     icon: Wallet },
  { to: '/einstellungen', label: 'Arbeitszeit',     icon: SlidersHorizontal },
] as const

export function AppShell({ children, email }: { children: ReactNode; email?: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname })

  const primary = NAV.slice(0, 3)
  const groups = [
    { label: 'Arbeitsplatz', items: NAV.slice(0, 3) },
    { label: 'Abrechnung', items: NAV.slice(3, 5) },
    { label: 'Verwaltung', items: NAV.slice(5) },
  ]
  const navLink = ({ to, label, icon: Icon }: typeof NAV[number]) => {
    const active = to === '/' ? path === '/' : path.startsWith(to)
    return <Link key={to} to={to} aria-current={active ? 'page' : undefined}
      className={cn('workspace-link', active && 'is-active')}>
      <Icon className="size-[18px] shrink-0" aria-hidden="true" /><span>{label}</span>
    </Link>
  }

  return (
    <div className="workspace">
      <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
      <aside className="workspace-sidebar">
        <Link to="/" className="workspace-brand" aria-label="Timesheet – Zeiterfassung">
          <span className="brand-icon"><Clock3 className="size-6" /></span>
          <span>Timesheet<span className="brand-caption">Dein Arbeitsalltag. Im Blick.</span></span>
        </Link>
        <nav aria-label="Hauptnavigation" className="desktop-navigation">
          {groups.map(group => <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map(navLink)}
          </div>)}
        </nav>
        <nav aria-label="Mobile Navigation" className="mobile-navigation">
          {primary.map(navLink)}
          <details className="mobile-more" key={path}>
            <summary className={cn('workspace-link', NAV.slice(3).some(item => path.startsWith(item.to)) && 'is-active')}>
              <SlidersHorizontal className="size-[18px]" />Mehr
            </summary>
            <div className="mobile-more-panel">{NAV.slice(3).map(navLink)}
              <button className="workspace-link" onClick={() => void supabase.auth.signOut()}><LogOut className="size-4" />Abmelden</button>
            </div>
          </details>
        </nav>
        <div className="workspace-account">
          <span className="account-avatar">{email?.slice(0, 1).toUpperCase() || 'T'}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Mein Workspace</p><p className="truncate text-xs text-ink-500">{email}</p></div>
          <button aria-label="Abmelden" title="Abmelden" className="rounded-lg p-2 hover:bg-ink-100" onClick={() => void supabase.auth.signOut()}><LogOut className="size-4" /></button>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="workspace-main">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
