import { Link } from '@tanstack/react-router'
import {
  ArrowRight, Building2, FolderKanban, SlidersHorizontal, Tags, Wallet,
} from 'lucide-react'
import { Card, ErrorNote } from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { useCustomers } from '@/features/customers/api'
import { useProjects } from '@/features/projects/api'
import { useActivityTypes } from '@/features/activity-types/api'
import { useExpenseCategories } from '@/features/expenses/api'

/**
 * Sammelstelle fuer alles, was einmal eingerichtet wird.
 *
 * Frueher standen die fuenf Bereiche einzeln in der Navigation und drueckten
 * sie auf dem Telefon in einen Endlosscroll. Sie gehoeren aber nicht neben die
 * taeglichen Seiten: man faehrt sie im Monat einmal an, nicht dreimal am Tag.
 */
export function MasterDataPage() {
  const customers = useCustomers()
  const projects = useProjects()
  const activities = useActivityTypes()
  const categories = useExpenseCategories()

  const error = customers.error ?? projects.error ?? activities.error ?? categories.error

  // Die Arbeitszeit zaehlt bewusst nichts: dort stehen Modell, Feiertage und
  // Abwesenheiten nebeneinander, eine einzelne Zahl waere davon nur ein Drittel.
  const bereiche = [
    {
      to: '/kunden', label: 'Kunden', icon: Building2,
      hint: 'Wer beauftragt, wie oft gemeldet und wie gerundet wird',
      count: customers.data?.length,
    },
    {
      to: '/projekte', label: 'Projekte', icon: FolderKanban,
      hint: 'Projekte mit ihren Sätzen und Arbeitspaketen',
      count: projects.data?.length,
    },
    {
      to: '/taetigkeiten', label: 'Tätigkeitsarten', icon: Tags,
      hint: 'Welcher Art die Arbeit ist — Beratung, Reise, intern',
      count: activities.data?.length,
    },
    {
      to: '/spesenarten', label: 'Spesenarten', icon: Wallet,
      hint: 'Was an Auslagen anfällt und mit welchem Aufschlag',
      count: categories.data?.length,
    },
    {
      to: '/einstellungen', label: 'Arbeitszeit', icon: SlidersHorizontal,
      hint: 'Sollzeit, Feiertage und Abwesenheiten',
      count: undefined,
    },
  ] as const

  return (
    <>
      <PageHeader
        title="Stammdaten"
        subtitle="Alles, was einmal eingerichtet wird und danach still im Hintergrund mitrechnet."
      />

      {error && <div className="mt-4"><ErrorNote message={describeError(error)} /></div>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {bereiche.map(({ to, label, icon: Icon, hint, count }) => (
          <Link key={to} to={to} className="group min-w-0">
            <Card className="flex items-center gap-4 p-4 transition group-hover:border-accent-500">
              <span className="shrink-0 rounded-md bg-accent-50 p-2.5 text-accent-500">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-800">{label}</span>
                <span className="block text-xs text-ink-500">{hint}</span>
              </span>
              {count === undefined ? (
                <ArrowRight className="size-4 shrink-0 text-ink-400" aria-hidden />
              ) : (
                <span className="tabular shrink-0 text-2xl font-semibold text-ink-800">
                  {count}
                </span>
              )}
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-ink-700">So richtest du die Stammdaten ein</h2>
        <ol className="mt-3 space-y-2.5 text-sm text-ink-600">
          <li className="flex gap-3">
            <span className="tabular font-mono text-xs text-ink-400">01</span>
            <span>
              <Link to="/taetigkeiten" className="font-medium text-accent-500 hover:underline">
                Tätigkeitsarten
              </Link>{' '}
              anlegen — mindestens Beratung, Reisezeit und Intern. Sie tragen später die
              abweichenden Sätze.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular font-mono text-xs text-ink-400">02</span>
            <span>
              <Link to="/kunden" className="font-medium text-accent-500 hover:underline">Kunden</Link>{' '}
              anlegen und je Kunde festlegen, ob wöchentlich oder monatlich gemeldet wird und mit
              welchem Takt gerundet wird.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular font-mono text-xs text-ink-400">03</span>
            <span>
              <Link to="/projekte" className="font-medium text-accent-500 hover:underline">Projekte</Link>{' '}
              anlegen und je Projekt mindestens einen Stundensatz hinterlegen. Ohne Satz lässt sich
              erfasste Zeit nicht bewerten.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="tabular font-mono text-xs text-ink-400">04</span>
            <span>
              In der{' '}
              <Link to="/einstellungen" className="font-medium text-accent-500 hover:underline">
                Arbeitszeit
              </Link>{' '}
              die Sollzeit hinterlegen. Ohne sie bleibt die Auslastungsquote ausgeblendet — eine
              erfundene Zahl wäre schlimmer als keine.
            </span>
          </li>
        </ol>
        <p className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-4 text-sm text-ink-500">
          Steht das, geht es an die Erfassung.
          <Link to="/" className="inline-flex items-center gap-1 font-medium text-accent-500 hover:underline">
            Zum Wochenraster <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </Card>
    </>
  )
}
