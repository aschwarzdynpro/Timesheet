import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ConfigNotice } from '@/features/auth/ConfigNotice'
import { isConfigured } from '@/lib/supabase'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { TimeEntryPage } from '@/features/time-entry/TimeEntryPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ActivityTypesPage } from '@/features/activity-types/ActivityTypesPage'
import { ReportingPage } from '@/features/reporting/ReportingPage'
import { PeriodsPage } from '@/features/periods/PeriodsPage'

/** Alles hinter der Anmeldung liegt unter derselben Huelle. */
function RootLayout() {
  const { session, loading } = useAuth()

  if (!isConfigured) return <ConfigNotice />
  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-sm text-ink-400">Wird geladen …</div>
  }
  if (!session) return <LoginPage />

  return (
    <AppShell email={session.user.email ?? undefined}>
      <Outlet />
    </AppShell>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })

// Das Wochenraster ist der Hauptweg und damit die Startseite.
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: TimeEntryPage })
const overviewRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/uebersicht', component: OverviewPage,
})
const customersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/kunden', component: CustomersPage })
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projekte', component: ProjectsPage })
const activityTypesRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/taetigkeiten', component: ActivityTypesPage,
})
const reportingRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/auswertungen', component: ReportingPage,
})
const periodsRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/perioden', component: PeriodsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute, reportingRoute, periodsRoute, overviewRoute,
  customersRoute, projectsRoute, activityTypesRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
