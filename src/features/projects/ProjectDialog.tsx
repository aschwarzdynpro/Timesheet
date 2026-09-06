import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, Dialog, ErrorNote, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import type { Customer, Project, ProjectInsert } from '@/types/database'
import { useSaveProject } from './api'

const optionalNumber = z
  .union([z.literal(''), z.coerce.number().positive('Muss größer als 0 sein')])
  .transform((v) => (v === '' ? null : v))

const optionalDate = z.union([z.literal(''), z.string()]).transform((v) => (v === '' ? null : v))

const schema = z
  .object({
    customer_id: z.string().min(1, 'Bitte einen Kunden wählen'),
    code: z.string().trim().min(1, 'Kürzel fehlt').max(20, 'Höchstens 20 Zeichen'),
    name: z.string().trim().min(1, 'Name fehlt'),
    description: z.string(),
    status: z.enum(['active', 'paused', 'closed']),
    is_billable: z.boolean(),
    start_date: optionalDate,
    end_date: optionalDate,
    budget_hours: optionalNumber,
    budget_amount: optionalNumber,
    // Leerer Wert bedeutet: vom Kunden erben.
    rounding_minutes: z
      .union([z.literal(''), z.coerce.number().int().min(1).max(120)])
      .transform((v) => (v === '' ? null : v)),
    rounding_mode: z
      .union([z.literal(''), z.enum(['up', 'nearest', 'none'])])
      .transform((v) => (v === '' ? null : v)),
    reporting_cycle: z
      .union([z.literal(''), z.enum(['weekly', 'monthly'])])
      .transform((v) => (v === '' ? null : v)),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: 'Das Ende liegt vor dem Beginn',
    path: ['end_date'],
  })

export function ProjectDialog({
  open, project, customers, defaultCustomerId, onClose,
}: {
  open: boolean
  project: Project | null
  customers: Customer[]
  defaultCustomerId?: string | null
  onClose: () => void
}) {
  const save = useSaveProject()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)

    const raw = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = schema.safeParse({ ...raw, is_billable: raw.is_billable === 'on' })

    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next)
      return
    }

    const values: ProjectInsert = {
      ...parsed.data,
      description: parsed.data.description.trim() || null,
      finops_project_id: null,
      finops_activity_number: null,
    }

    try {
      await save.mutateAsync(project ? { id: project.id, values } : { values })
      onClose()
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? 'Projekt bearbeiten' : 'Neues Projekt'}
      description="Leere Felder bei Rundung und Meldung bedeuten: Vorgabe des Kunden gilt."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Kunde"
          error={errors.customer_id}
          hint={project ? 'Der Kunde eines bestehenden Projekts wird nicht gewechselt.' : undefined}
        >
          {project ? (
            <>
              {/* Ein deaktiviertes Feld wird nicht mit abgeschickt, deshalb das versteckte Feld. */}
              <input type="hidden" name="customer_id" value={project.customer_id} />
              <p className="flex h-9 items-center rounded-md border border-ink-200 bg-ink-50 px-3 text-sm text-ink-600">
                {customers.find((c) => c.id === project.customer_id)?.name ?? '–'}
              </p>
            </>
          ) : (
            <Select name="customer_id" defaultValue={defaultCustomerId ?? ''}>
              <option value="">Bitte wählen</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.code} – {c.name}</option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Kürzel" error={errors.code}>
            <Input name="code" defaultValue={project?.code ?? ''} placeholder="CRM" />
          </Field>
          <Field label="Name" error={errors.name} className="col-span-2">
            <Input name="name" defaultValue={project?.name ?? ''} placeholder="CRM-Einführung" />
          </Field>
        </div>

        <Field label="Beschreibung" error={errors.description}>
          <Textarea name="description" rows={2} defaultValue={project?.description ?? ''} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Status" error={errors.status}>
            <Select name="status" defaultValue={project?.status ?? 'active'}>
              <option value="active">aktiv</option>
              <option value="paused">pausiert</option>
              <option value="closed">abgeschlossen</option>
            </Select>
          </Field>
          <Field label="Beginn" error={errors.start_date}>
            <Input name="start_date" type="date" defaultValue={project?.start_date ?? ''} />
          </Field>
          <Field label="Ende" error={errors.end_date}>
            <Input name="end_date" type="date" defaultValue={project?.end_date ?? ''} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget (Stunden)" error={errors.budget_hours}>
            <Input name="budget_hours" type="number" step="0.25" min="0"
                   defaultValue={project?.budget_hours ?? ''} />
          </Field>
          <Field label="Budget (EUR)" error={errors.budget_amount}>
            <Input name="budget_amount" type="number" step="0.01" min="0"
                   defaultValue={project?.budget_amount ?? ''} />
          </Field>
        </div>

        <fieldset className="rounded-md border border-ink-200 p-3">
          <legend className="px-1 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Abweichend vom Kunden
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Meldung" error={errors.reporting_cycle}>
              <Select name="reporting_cycle" defaultValue={project?.reporting_cycle ?? ''}>
                <option value="">wie Kunde</option>
                <option value="monthly">monatlich</option>
                <option value="weekly">wöchentlich</option>
              </Select>
            </Field>
            <Field label="Takt (Min.)" error={errors.rounding_minutes}>
              <Input name="rounding_minutes" type="number" min={1} max={120}
                     placeholder="wie Kunde" defaultValue={project?.rounding_minutes ?? ''} />
            </Field>
            <Field label="Rundung" error={errors.rounding_mode}>
              <Select name="rounding_mode" defaultValue={project?.rounding_mode ?? ''}>
                <option value="">wie Kunde</option>
                <option value="up">aufrunden</option>
                <option value="nearest">kaufmännisch</option>
                <option value="none">keine</option>
              </Select>
            </Field>
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_billable" defaultChecked={project?.is_billable ?? true}
                 className="size-4 rounded border-ink-300" />
          Projekt ist abrechenbar
        </label>

        <ErrorNote message={formError} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}
