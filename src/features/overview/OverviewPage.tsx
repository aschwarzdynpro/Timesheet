import { Link } from '@tanstack/react-router'
import { Building2, FolderKanban, Tags, ArrowRight } from 'lucide-react'
import { Card, ErrorNote } from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { useCustomers } from '@/features/customers/api'
import { useProjects } from '@/features/projects/api'
import { useActivityTypes } from '@/features/activity-types/api'

export function OverviewPage() {
  const customers = useCustomers()
  const projects = useProjects()
  const activities = useActivityTypes()

  const error = customers.error ?? projects.error ?? activities.error

  const tiles = [
    { to: '/kunden',       label: 'Kunden',          icon: Building2,    count: customers.data?.length },
    { to: '/projekte',     label: 'Projekte',        icon: FolderKanban, count: projects.data?.length },
    { to: '/taetigkeiten', label: 'Tätigkeitsarten', icon: Tags,         count: activities.data?.length },
  ] as const

  const projectsWithoutRate = projects.data?.length ?? 0

  return (
    <>
      <PageHeader
        title="Übersicht"
        subtitle="Phase 1 ist eingerichtet: Stammdaten lassen sich pflegen. Die Zeiterfassung folgt in Phase 2."
      />

      {error && <ErrorNote message={describeError(error)} />}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {tiles.map(({ to, label, icon: Icon, count }) => (
          <Link key={to} to={to} className="group">
            <Card className="flex items-center gap-4 p-5 transition group-hover:border-accent-500">
              <span className="rounded-md bg-accent-50 p-2.5 text-accent-500">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block tabular text-2xl font-semibold text-ink-800">
                  {count ?? '–'}
                </span>
                <span className="block text-sm text-ink-500">{label}</span>
              </span>
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
        </ol>
        {projectsWithoutRate > 0 && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-ink-100 pt-4 text-sm text-ink-500">
            Sätze werden im Projekt gepflegt — Zeile aufklappen.
            <Link to="/projekte" className="inline-flex items-center gap-1 font-medium text-accent-500 hover:underline">
              Zu den Projekten <ArrowRight className="size-3.5" />
            </Link>
          </p>
        )}
      </Card>
    </>
  )
}
