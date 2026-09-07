import { useMemo, useState, type FormEvent } from 'react'
import {
  Button, Dialog, ErrorNote, Field, Input, Select, Textarea,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { minutesToHours, parseDuration, toIsoDate } from '@/lib/week'
import type { ActivityType, Project } from '@/types/database'
import { useRecentDescriptions, useSaveTimeEntry } from './api'

/**
 * Schnelleintrag: eine Zeile - Projekt, Datum, Dauer, Text.
 *
 * Der Weg fuer Nachtraege zwischendurch und der einzige manuelle Weg auf dem
 * Telefon, wo das Wochenraster keinen Platz hat.
 */
export function QuickEntryDialog(props: {
  open: boolean
  workDate?: string
  projects: Project[]
  activityTypes: ActivityType[]
  onClose: () => void
}) {
  if (!props.open) return null
  return <QuickEntryForm key={props.workDate ?? 'heute'} {...props} />
}

function QuickEntryForm({
  workDate, projects, activityTypes, onClose,
}: {
  workDate?: string
  projects: Project[]
  activityTypes: ActivityType[]
  onClose: () => void
}) {
  const save = useSaveTimeEntry()
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0]!.id : '')
  const [activityId, setActivityId] = useState('')
  const [duration, setDuration] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: suggestions } = useRecentDescriptions(projectId || null)
  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  )
  const minutes = parseDuration(duration)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)
    const date = String(form.get('work_date') ?? '')

    if (!projectId) return setError('Bitte ein Projekt wählen.')
    if (minutes === null || minutes <= 0) {
      return setError('Dauer nicht verstanden. Möglich sind etwa 1,5 · 1:30 · 90m.')
    }
    if (minutes > 1440) return setError('Mehr als 24 Stunden an einem Tag sind nicht möglich.')
    if (!description.trim()) {
      return setError('Ohne Beschreibung geht es nicht — sie ist die Position im Kundenreport.')
    }

    try {
      await save.mutateAsync({
        values: {
          project_id: projectId,
          activity_type_id: activityId || null,
          work_date: date,
          duration_minutes: minutes,
          description: description.trim(),
          is_billable: project?.is_billable ?? true,
        },
      })
      onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog open onClose={onClose}
            title="Zeit erfassen"
            description="Projekt, Dauer, was gemacht wurde — mehr braucht ein Eintrag nicht.">
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Projekt">
          {/* Kein autoFocus: auf dem Telefon faehrt sonst beim Oeffnen sofort
              die Projektauswahl hoch und verdeckt den halben Dialog. */}
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Bitte wählen</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tätigkeitsart" hint="optional">
            <Select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              <option value="">ohne Art</option>
              {activityTypes.filter((a) => a.is_active)
                .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Datum">
            <Input type="date" name="work_date" required
                   defaultValue={workDate ?? toIsoDate(new Date())} />
          </Field>
        </div>

        <Field
          label="Dauer"
          hint={minutes !== null && minutes > 0
            ? `entspricht ${minutesToHours(minutes)} Stunden`
            : '1,5 · 1:30 · 90m'}
        >
          <Input value={duration} onChange={(e) => setDuration(e.target.value)}
                 inputMode="decimal" placeholder="1,5" />
        </Field>

        <Field label="Beschreibung">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="Was wurde gemacht?" />
        </Field>

        {suggestions && suggestions.length > 0 && !description && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 4).map((text) => (
              <button key={text} type="button" onClick={() => setDescription(text)}
                      className="max-w-full truncate rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-600 hover:border-accent-500 hover:text-accent-700">
                {text}
              </button>
            ))}
          </div>
        )}

        {project && !project.is_billable && (
          <p className="text-xs text-ink-500">
            Dieses Projekt ist nicht abrechenbar — der Eintrag zählt zur internen Zeit.
          </p>
        )}

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
