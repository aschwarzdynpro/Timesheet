import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import {
  Badge, Button, Dialog, EmptyState, ErrorNote, Field, Input, Select,
} from '@/components/ui/primitives'
import { formatRate, formatValidity, today } from '@/lib/format'
import { describeError } from '@/lib/supabase'
import type { ActivityType, Project, ProjectRate, ProjectRateInsert } from '@/types/database'
import { useDeleteProjectRate, useProjectRates, useSaveProjectRate } from './api'

const schema = z
  .object({
    hourly_rate: z.coerce.number().min(0, 'Der Satz darf nicht negativ sein'),
    activity_type_id: z.string(),
    valid_from: z.string().min(1, 'Beginn fehlt'),
    valid_to: z.union([z.literal(''), z.string()]).transform((v) => (v === '' ? null : v)),
    note: z.string(),
  })
  .refine((v) => !v.valid_to || v.valid_to >= v.valid_from, {
    message: 'Das Ende liegt vor dem Beginn',
    path: ['valid_to'],
  })

function RateDialog({
  open, projectId, activityTypes, onClose,
}: { open: boolean; projectId: string; activityTypes: ActivityType[]; onClose: () => void }) {
  const save = useSaveProjectRate(projectId)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)

    const parsed = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next)
      return
    }

    const values: ProjectRateInsert = {
      project_id: projectId,
      hourly_rate: parsed.data.hourly_rate,
      activity_type_id: parsed.data.activity_type_id || null,
      valid_from: parsed.data.valid_from,
      valid_to: parsed.data.valid_to,
      note: parsed.data.note.trim() || null,
    }

    try {
      await save.mutateAsync({ values })
      onClose()
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Neuer Stundensatz"
      description="Sätze überschneiden sich nicht. Beende den laufenden Satz, bevor ein neuer beginnt."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Satz (EUR/h)" error={errors.hourly_rate}>
            <Input name="hourly_rate" type="number" step="0.01" min="0" required autoFocus
                   placeholder="140,00" />
          </Field>
          <Field label="Gilt für" hint="Leer = alle Tätigkeiten" error={errors.activity_type_id}>
            <Select name="activity_type_id" defaultValue="">
              <option value="">alle Tätigkeiten</option>
              {activityTypes.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Gültig ab" error={errors.valid_from}>
            <Input name="valid_from" type="date" required defaultValue={today()} />
          </Field>
          <Field label="Gültig bis" hint="Leer = offen" error={errors.valid_to}>
            <Input name="valid_to" type="date" />
          </Field>
        </div>

        <Field label="Notiz" error={errors.note}>
          <Input name="note" placeholder="Rahmenvertrag 2026" />
        </Field>

        <ErrorNote message={formError} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function RatePanel({
  project, activityTypes,
}: { project: Project; activityTypes: ActivityType[] }) {
  const { data: rates, isPending } = useProjectRates(project.id)
  const remove = useDeleteProjectRate(project.id)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const now = today()
  const isCurrent = (r: ProjectRate) => r.valid_from <= now && (!r.valid_to || r.valid_to >= now)

  async function onDelete(rate: ProjectRate) {
    if (!confirm('Diesen Satz wirklich löschen?')) return
    setError(null)
    try {
      await remove.mutateAsync(rate.id)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <div className="border-t border-ink-200 bg-ink-50/50 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-700">Stundensätze</h3>
          <p className="text-xs text-ink-400">
            Der Satz ergibt sich aus dem Leistungsdatum. Ein Satz für eine Tätigkeitsart schlägt den
            allgemeinen Projektsatz.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> Satz
        </Button>
      </div>

      <ErrorNote message={error} />

      {isPending ? (
        <p className="py-4 text-sm text-ink-400">Wird geladen …</p>
      ) : !rates?.length ? (
        <EmptyState
          title="Kein Stundensatz hinterlegt"
          hint="Ohne Satz lässt sich erfasste Zeit nicht bewerten."
        />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
              <th className="py-2 font-semibold">Satz</th>
              <th className="py-2 font-semibold">Gilt für</th>
              <th className="py-2 font-semibold">Zeitraum</th>
              <th className="py-2 font-semibold">Notiz</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const activity = activityTypes.find((a) => a.id === r.activity_type_id)
              return (
                <tr key={r.id} className="border-b border-ink-100 last:border-0">
                  <td className="py-2 tabular font-medium text-ink-800">
                    {formatRate(r.hourly_rate)}
                    {isCurrent(r) && <span className="ml-2"><Badge tone="good">aktuell</Badge></span>}
                  </td>
                  <td className="py-2 text-ink-600">
                    {activity ? activity.name : <span className="text-ink-400">alle Tätigkeiten</span>}
                  </td>
                  <td className="py-2 tabular text-ink-600">{formatValidity(r.valid_from, r.valid_to)}</td>
                  <td className="py-2 text-ink-500">{r.note ?? '–'}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" aria-label="Satz löschen" onClick={() => onDelete(r)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <RateDialog
        open={dialogOpen}
        projectId={project.id}
        activityTypes={activityTypes}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
