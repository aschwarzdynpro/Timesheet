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

  return (
    <div className="flex min-h-full flex-col sm:flex-row">
      {/* min-w-0: ohne das waechst ein Flex-Element auf seinen Inhalt und schiebt
          die ganze Seite seitwaerts, statt die Leiste in sich scrollen zu lassen. */}
      <nav className="flex min-w-0 shrink-0 flex-col border-b border-ink-200 bg-white sm:w-56 sm:border-r sm:border-b-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="rounded bg-accent-500 px-1.5 py-0.5 text-xs font-bold text-white">ZE</span>
          <span className="text-sm font-semibold text-ink-800">Zeiterfassung</span>
        </div>

        <ul className="flex min-w-0 gap-1 overflow-x-auto px-3 pb-3 sm:flex-1 sm:flex-col sm:overflow-visible">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? path === '/' : path.startsWith(to)
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition',
                    active
                      ? 'bg-accent-50 font-medium text-accent-700'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-800',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="hidden border-t border-ink-100 px-3 py-3 sm:block">
          {email && <p className="truncate px-3 pb-2 text-xs text-ink-400">{email}</p>}
          <button
            onClick={() => void supabase.auth.signOut()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-800"
          >
            <LogOut className="size-4" /> Abmelden
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
