import {
  createRootRoute, createRoute, createRouter, Outlet, redirect,
} from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ConfigNotice } from '@/features/auth/ConfigNotice'
import { isConfigured } from '@/lib/supabase'
import { MasterDataPage } from '@/features/master-data/MasterDataPage'
import { TimeEntryPage } from '@/features/time-entry/TimeEntryPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ActivityTypesPage } from '@/features/activity-types/ActivityTypesPage'
import { ReportingPage } from '@/features/reporting/ReportingPage'
import { PeriodsPage } from '@/features/periods/PeriodsPage'
import { ExportPage } from '@/features/export/ExportPage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { ExpenseCategoriesPage } from '@/features/expenses/ExpenseCategoriesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AccountPage } from '@/features/account/AccountPage'

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
// Die fuenf Stammdatenbereiche haengen unter einer Seite, statt einzeln in der
// Navigation zu stehen - taeglich braucht man sie nicht.
const masterDataRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/stammdaten', component: MasterDataPage,
})

// Der alte Pfad bleibt erreichbar: auf dem Telefon liegt er als Lesezeichen.
const overviewRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: '/uebersicht',
  beforeLoad: () => { throw redirect({ to: '/stammdaten' }) },
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
const exportRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/export', component: ExportPage,
})
const expensesRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/spesen', component: ExpensesPage,
})
const expenseCategoriesRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/spesenarten', component: ExpenseCategoriesPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/einstellungen', component: SettingsPage,
})

const accountRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/konto', component: AccountPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute, expensesRoute, reportingRoute, periodsRoute, exportRoute,
  masterDataRoute, overviewRedirect, customersRoute, projectsRoute, activityTypesRoute,
  expenseCategoriesRoute, settingsRoute, accountRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
