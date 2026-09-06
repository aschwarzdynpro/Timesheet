import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorNote, Select } from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { CYCLE_LABEL, ROUNDING_LABEL, STATUS_LABEL, formatEuro, formatHours } from '@/lib/format'
import { describeError } from '@/lib/supabase'
import type { Project } from '@/types/database'
import { useCustomers } from '@/features/customers/api'
import { useActivityTypes } from '@/features/activity-types/api'
import { ProjectDialog } from './ProjectDialog'
import { RatePanel } from './RatePanel'
import { useDeleteProject, useProjects } from './api'

export function ProjectsPage() {
  const { data: projects, isPending, error } = useProjects()
  const { data: customers } = useCustomers()
  const { data: activityTypes } = useActivityTypes()
  const remove = useDeleteProject()

  const [customerFilter, setCustomerFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; project: Project | null }>({
    open: false, project: null,
  })
  const [removeError, setRemoveError] = useState<string | null>(null)

  const visible = useMemo(
    () => (projects ?? []).filter((p) => !customerFilter || p.customer_id === customerFilter),
    [projects, customerFilter],
  )

  const customerOf = (id: string) => customers?.find((c) => c.id === id)

  async function onDelete(project: Project) {
    if (!confirm(`Projekt „${project.name}" wirklich löschen?`)) return
    setRemoveError(null)
    try {
      await remove.mutateAsync(project.id)
    } catch (err) {
      setRemoveError(describeError(err))
    }
  }

  const noCustomers = customers && customers.length === 0

  return (
    <>
      <PageHeader
        title="Projekte"
        subtitle="Jedes Projekt trägt seine eigene Satzhistorie. Aufklappen zeigt sie."
        action={
          <Button
            variant="primary"
            disabled={noCustomers}
            onClick={() => setDialog({ open: true, project: null })}
          >
            <Plus className="size-4" /> Neues Projekt
          </Button>
        }
      />

      {error && <ErrorNote message={describeError(error)} />}
      {removeError && <ErrorNote message={removeError} />}

      {customers && customers.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Kunde</span>
          <Select
            className="w-64"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">alle Kunden</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.code} – {c.name}</option>
            ))}
          </Select>
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        {isPending ? (
          <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
        ) : noCustomers ? (
          <EmptyState
            title="Zuerst einen Kunden anlegen"
            hint="Projekte hängen an einem Kunden und erben von dort Rhythmus und Rundung."
          />
        ) : !visible.length ? (
          <EmptyState
            title="Keine Projekte"
            hint="Ein Projekt bündelt Zeiten und trägt den Stundensatz."
            action={
              <Button variant="primary" onClick={() => setDialog({ open: true, project: null })}>
                Erstes Projekt anlegen
              </Button>
            }
          />
        ) : (
          <ul>
            {visible.map((p) => {
              const customer = customerOf(p.customer_id)
              const isOpen = expanded === p.id
              return (
                <li key={p.id} className="border-b border-ink-100 last:border-0">
                  <div className="flex items-start gap-3 px-5 py-3 hover:bg-ink-50/60">
                    <button
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? 'Sätze einklappen' : 'Sätze aufklappen'}
                      className="mt-0.5 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                    >
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink-500">
                          {customer?.code}/{p.code}
                        </span>
                        <span className="font-medium text-ink-800">{p.name}</span>
                        {p.status !== 'active' && <Badge tone="muted">{STATUS_LABEL[p.status]}</Badge>}
                        {!p.is_billable && <Badge tone="warn">nicht abrechenbar</Badge>}
                      </div>

                      <p className="mt-0.5 text-sm text-ink-500">
                        {customer?.name}
                        {p.description && ` · ${p.description}`}
                      </p>

                      <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
                        <div>
                          <dt className="inline text-ink-400">Meldung: </dt>
                          <dd className="inline">
                            {CYCLE_LABEL[p.reporting_cycle ?? customer?.reporting_cycle ?? 'monthly']}
                            {!p.reporting_cycle && <span className="text-ink-400"> (vom Kunden)</span>}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-ink-400">Rundung: </dt>
                          <dd className="inline">
                            {(p.rounding_mode ?? customer?.rounding_mode) === 'none'
                              ? 'minutengenau'
                              : `${p.rounding_minutes ?? customer?.rounding_minutes} Min., ${
                                  ROUNDING_LABEL[p.rounding_mode ?? customer?.rounding_mode ?? 'up']
                                }`}
                            {!p.rounding_minutes && !p.rounding_mode && (
                              <span className="text-ink-400"> (vom Kunden)</span>
                            )}
                          </dd>
                        </div>
                        {p.budget_hours && (
                          <div>
                            <dt className="inline text-ink-400">Budget: </dt>
                            <dd className="inline tabular">{formatHours(p.budget_hours * 60)}</dd>
                          </div>
                        )}
                        {p.budget_amount && (
                          <div>
                            <dt className="inline text-ink-400">Budget: </dt>
                            <dd className="inline tabular">{formatEuro(p.budget_amount)}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div className="whitespace-nowrap">
                      <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                              onClick={() => setDialog({ open: true, project: p })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Löschen" onClick={() => onDelete(p)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {isOpen && <RatePanel project={p} activityTypes={activityTypes ?? []} />}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <ProjectDialog
        open={dialog.open}
        project={dialog.project}
        customers={customers ?? []}
        defaultCustomerId={customerFilter || null}
        onClose={() => setDialog({ open: false, project: null })}
      />
    </>
  )
}
