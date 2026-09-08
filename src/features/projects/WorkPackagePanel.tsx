import { useState, type FormEvent } from 'react'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import {
  Badge, Button, Dialog, EmptyState, ErrorNote, Field, Input, Textarea,
} from '@/components/ui/primitives'
import { BudgetBadge } from '@/components/ui/BudgetBadge'
import { formatEuro } from '@/lib/format'
import { minutesToHours, parseDuration } from '@/lib/week'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import type {
  Project, WorkPackage, WorkPackageBudget, WorkPackageInsert,
} from '@/types/database'
import { useDeleteWorkPackage, useSaveWorkPackage, useWorkPackageBudget } from './api'

const schema = z.object({
  code: z.string().trim().min(1, 'Kürzel fehlt').max(20, 'Höchstens 20 Zeichen'),
  name: z.string().trim().min(1, 'Name fehlt'),
  description: z.string(),
  sort_order: z.coerce.number().int().min(0, 'Keine negative Reihenfolge'),
  is_active: z.boolean(),
})

/** Leer heisst "kein Budget", nicht "null". */
function budgetWert(roh: string, alsStunden: boolean): number | null | 'fehler' {
  const text = roh.trim()
  if (!text) return null
  if (alsStunden) {
    const minuten = parseDuration(text)
    return minuten === null || minuten <= 0 ? 'fehler' : Math.round((minuten / 60) * 100) / 100
  }
  const zahl = Number(text.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(zahl) && zahl > 0 ? zahl : 'fehler'
}

function WorkPackageDialog({
  projectId, item, onClose,
}: { projectId: string; item: WorkPackage | null; onClose: () => void }) {
  const save = useSaveWorkPackage(projectId)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)

    const raw = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = schema.safeParse({ ...raw, is_active: raw.is_active === 'on' })
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next)
      return
    }

    const stunden = budgetWert(String(raw.budget_hours ?? ''), true)
    const betrag = budgetWert(String(raw.budget_amount ?? ''), false)
    if (stunden === 'fehler' || betrag === 'fehler') {
      setErrors({
        ...(stunden === 'fehler' ? { budget_hours: 'Stundenzahl nicht verstanden' } : {}),
        ...(betrag === 'fehler' ? { budget_amount: 'Betrag nicht verstanden' } : {}),
      })
      return
    }

    const values: WorkPackageInsert = {
      project_id: projectId,
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description.trim() || null,
      sort_order: parsed.data.sort_order,
      is_active: parsed.data.is_active,
      budget_hours: stunden,
      budget_amount: betrag,
    }

    try {
      await save.mutateAsync(item ? { id: item.id, values } : { values })
      onClose()
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Arbeitspaket ändern' : 'Neues Arbeitspaket'}
      description="Woran gearbeitet wird — im Unterschied zur Tätigkeitsart, die sagt, welcher Art die Arbeit ist."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kürzel" error={errors.code}>
            <Input name="code" defaultValue={item?.code ?? ''} placeholder="MIGR" autoFocus />
          </Field>
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            <Input name="name" defaultValue={item?.name ?? ''} placeholder="Datenmigration" />
          </Field>
        </div>

        <Field label="Beschreibung" hint="optional" error={errors.description}>
          <Textarea name="description" rows={2} defaultValue={item?.description ?? ''} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Budget (Stunden)" hint="optional" error={errors.budget_hours}>
            <Input name="budget_hours" inputMode="decimal" placeholder="40"
                   defaultValue={item?.budget_hours ?? ''} />
          </Field>
          <Field label="Budget (EUR)" hint="optional" error={errors.budget_amount}>
            <Input name="budget_amount" inputMode="decimal" placeholder="6.000"
                   defaultValue={item?.budget_amount ?? ''} />
          </Field>
          <Field label="Reihenfolge" hint="kleinere Zahl steht oben" error={errors.sort_order}>
            <Input name="sort_order" type="number" min={0} defaultValue={item?.sort_order ?? 0} />
          </Field>
        </div>
        <p className="text-xs text-ink-400">
          Beides ist optional und lässt sich auch gemeinsam setzen. Der Stand zählt über die
          gesamte Laufzeit des Pakets, nicht je Jahr.
        </p>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true}
                 className="size-4 rounded border-ink-300" />
          Paket ist aktiv
        </label>
        <p className="text-xs text-ink-400">
          Ein inaktives Paket steht nicht mehr zur Auswahl, bereits gebuchte Zeiten behalten es.
        </p>

        <ErrorNote message={formError} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function WorkPackagePanel({ project }: { project: Project }) {
  // Die Sicht liefert Stammdaten und Verbrauch in einem Zug - zwei Abfragen
  // waeren zwei Zeitpunkte und koennten sich widersprechen.
  const { data: packages, isPending } = useWorkPackageBudget(project.id)
  const remove = useDeleteWorkPackage(project.id)
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; item: WorkPackage | null }>(
    { open: false, item: null })
  const [error, setError] = useState<string | null>(null)

  async function onDelete(item: WorkPackageBudget) {
    if (!await confirm(loeschFrage('Arbeitspaket', `${item.code} · ${item.name}`))) return
    setError(null)
    try {
      await remove.mutateAsync(item.work_package_id)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <div className="border-t border-ink-200 bg-ink-50/50 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <Package className="size-4 text-ink-400" /> Arbeitspakete
          </h3>
          <p className="text-xs text-ink-400">
            Gliedert das Projekt. Beim Erfassen lässt sich je Zeile eines auswählen.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true, item: null })}>
          <Plus className="size-4" /> Arbeitspaket
        </Button>
      </div>

      {error && <div className="mb-3"><ErrorNote message={error} /></div>}

      {isPending ? (
        <p className="py-3 text-sm text-ink-400">Wird geladen …</p>
      ) : !packages?.length ? (
        <EmptyState
          title="Keine Arbeitspakete"
          hint="Ohne Pakete wird schlicht auf das Projekt gebucht — das reicht, solange du nichts feiner auswerten willst."
        />
      ) : (
        <ul className="divide-y divide-ink-200 rounded-md border border-ink-200 bg-surface">
          {packages.map((w) => (
            <li key={w.work_package_id} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs font-semibold text-ink-700">{w.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-800">{w.name}</span>
                  {w.description && (
                    <span className="block truncate text-xs text-ink-400">{w.description}</span>
                  )}
                </span>
                <span className="tabular shrink-0 text-xs text-ink-500">
                  {minutesToHours(w.tracked_minutes)} h
                  {w.fees > 0 && ` · ${formatEuro(Number(w.fees))}`}
                </span>
                {!w.is_active && <Badge tone="muted">inaktiv</Badge>}
                <span className="shrink-0">
                  <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                          onClick={() => setDialog({
                            open: true,
                            item: {
                              id: w.work_package_id, project_id: w.project_id, code: w.code,
                              name: w.name, description: w.description, is_active: w.is_active,
                              sort_order: w.sort_order, budget_hours: w.budget_hours,
                              budget_amount: w.budget_amount, created_at: '',
                            },
                          })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Löschen"
                          onClick={() => void onDelete(w)}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </div>

              {/* Beide Budgets koennen gesetzt sein - dann stehen beide da. */}
              {(w.budget_hours || w.budget_amount) && (
                <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
                  {w.budget_hours && (
                    <BudgetBadge used={w.tracked_minutes / 60} budget={Number(w.budget_hours)}
                                 unit={`von ${minutesToHours(Number(w.budget_hours) * 60)} h`} />
                  )}
                  {w.budget_amount && (
                    <BudgetBadge used={Number(w.fees)} budget={Number(w.budget_amount)}
                                 unit={`von ${formatEuro(Number(w.budget_amount))}`} />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog.open && (
        <WorkPackageDialog projectId={project.id} item={dialog.item}
                           onClose={() => setDialog({ open: false, item: null })} />
      )}
    </div>
  )
}
