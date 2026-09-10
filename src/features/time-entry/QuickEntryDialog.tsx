import { useMemo, useState, type FormEvent } from 'react'
import {
  Button, Dialog, ErrorNote, Field, Input, Select, Textarea, WarnNote,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { minutesToHours, parseDuration, toIsoDate } from '@/lib/week'
import type { ActivityType, Project } from '@/types/database'
import { standardArt } from '@/features/activity-types/api'
import { nachKuerzel, useAllWorkPackageBudgets, useWorkPackages } from '@/features/projects/api'
import { paketLabel } from './PackageBudget'
import { useRateFor, useRecentDescriptions, useSaveTimeEntry } from './api'

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
  // null heisst "noch nicht gewaehlt" - dann gilt die Standardart. Eine
  // Vorbelegung per useState haette leer bleiben koennen: die Arten kommen
  // moeglicherweise erst nach dem ersten Rendern an.
  const [artWahl, setArtWahl] = useState<string | null>(null)
  const activityId = artWahl ?? standardArt(activityTypes)
  const [packageId, setPackageId] = useState('')
  // Nur die Pakete des gewaehlten Projekts - ein fremdes lehnt die Datenbank ab.
  const { data: workPackages } = useWorkPackages(projectId || null)
  // Derselbe Abfrageschluessel wie im Raster - eine Abfrage, mehrere Orte.
  const { data: budgets } = useAllWorkPackageBudgets()
  const waehlbarePakete = (workPackages ?? []).filter((w) => w.is_active).sort(nachKuerzel)
  const budgetVon = useMemo(
    () => new Map((budgets ?? []).map((b) => [b.work_package_id, b])),
    [budgets],
  )
  const [date, setDate] = useState(workDate ?? toIsoDate(new Date()))
  const { data: satz, isPending: satzLaeuft } =
    useRateFor(projectId || null, activityId || null, date)
  const [duration, setDuration] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: suggestions } = useRecentDescriptions(projectId || null)
  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  )
  const minutes = parseDuration(duration)
  // Nur bei abrechenbaren Projekten ein Thema: intern sind 0,00 EUR richtig.
  const ohneSatz = Boolean(projectId) && !satzLaeuft && satz === null && (project?.is_billable ?? false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

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
          work_package_id: packageId || null,
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
          <Select value={projectId}
                  onChange={(e) => { setProjectId(e.target.value); setPackageId('') }}>
            <option value="">Bitte wählen</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>

        {/* Nur zeigen, wenn das Projekt ueberhaupt gegliedert ist. */}
        {waehlbarePakete.length > 0 && (
          <Field label="Arbeitspaket" hint="optional">
            <Select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              <option value="">ohne Arbeitspaket</option>
              {waehlbarePakete.map((w) => (
                <option key={w.id} value={w.id}>
                  {paketLabel(`${w.code} · ${w.name}`, budgetVon.get(w.id))}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tätigkeitsart" hint="optional">
            <Select value={activityId} onChange={(e) => setArtWahl(e.target.value)}>
              <option value="">ohne Art</option>
              {activityTypes.filter((a) => a.is_active)
                .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Datum">
            <Input type="date" name="work_date" required
                   value={date} onChange={(e) => setDate(e.target.value)} />
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
                      className="max-w-full truncate rounded border border-ink-200 bg-surface px-2 py-1 text-xs text-ink-600 hover:border-accent-500 hover:text-accent-700">
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

        {/* Ohne Satz waere die Zeit 0,00 EUR wert. Das faellt sonst erst in der
            Auswertung auf - dort steht dann eine Null ohne Erklaerung. */}
        {ohneSatz && (
          <WarnNote>
            Für dieses Projekt gibt es {activityId ? 'mit dieser Tätigkeitsart ' : 'ohne Tätigkeitsart '}
            keinen Stundensatz zum {formatDate(date)}. Die Zeit wird gespeichert, aber mit 0,00 €
            bewertet.
          </WarnNote>
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
