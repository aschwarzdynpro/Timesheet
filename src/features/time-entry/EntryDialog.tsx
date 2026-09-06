import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Dialog, ErrorNote, Field, Input, Textarea } from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { minutesToHours, parseDuration } from '@/lib/week'
import type { ActivityType, Project, TimeEntryFull } from '@/types/database'
import { useDeleteTimeEntry, useRecentDescriptions, useSaveTimeEntry } from './api'

/** Identitaet der Zelle. Die Eintraege kommen getrennt und immer frisch dazu. */
export type EntryDialogTarget = {
  project: Project
  activity: ActivityType | null
  workDate: string
  /** Vorbelegte Dauer, wenn die Zelle direkt im Raster getippt wurde. */
  presetMinutes?: number
}

/**
 * Ein Tag einer Rasterzeile: bestehende Eintraege bearbeiten und neue anlegen.
 * Die Beschreibung ist Pflicht – sie ist die Position im Kundenreport.
 */
export function EntryDialog(props: {
  target: EntryDialogTarget | null
  entries: TimeEntryFull[]
  onClose: () => void
}) {
  if (!props.target) return null
  // Der Schluessel setzt den Formularzustand zurueck, sobald eine andere Zelle
  // geoeffnet wird - ohne Effekt, der beim Rendern nachtraeglich State setzt.
  const key = `${props.target.project.id}|${props.target.activity?.id ?? ''}|${props.target.workDate}`
  return <EntryDialogForm key={key} {...props} target={props.target} />
}

function EntryDialogForm({
  target, entries, onClose,
}: { target: EntryDialogTarget; entries: TimeEntryFull[]; onClose: () => void }) {
  const save = useSaveTimeEntry()
  const remove = useDeleteTimeEntry()
  const { data: suggestions } = useRecentDescriptions(target?.project.id ?? null)

  const [duration, setDuration] = useState(
    target.presetMinutes ? minutesToHours(target.presetMinutes) : '')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(target.project.is_billable)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { project, activity, workDate } = target
  const locked = entries.some((e) => e.status !== 'draft')

  function startEdit(entry: TimeEntryFull) {
    setEditing(entry.id)
    setDuration(minutesToHours(entry.duration_minutes))
    setDescription(entry.description)
    setBillable(entry.is_billable)
    setError(null)
  }

  function resetForm() {
    setEditing(null)
    setDuration('')
    setDescription('')
    setBillable(project.is_billable)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const minutes = parseDuration(duration)
    if (minutes === null || minutes <= 0) {
      setError('Dauer nicht verstanden. Möglich sind etwa 1,5 · 1:30 · 90m.')
      return
    }
    if (minutes > 1440) {
      setError('Mehr als 24 Stunden an einem Tag sind nicht möglich.')
      return
    }
    if (!description.trim()) {
      setError('Ohne Beschreibung geht es nicht — sie ist die Position im Kundenreport.')
      return
    }

    try {
      await save.mutateAsync({
        id: editing ?? undefined,
        values: {
          project_id: project.id,
          activity_type_id: activity?.id ?? null,
          work_date: workDate,
          duration_minutes: minutes,
          description: description.trim(),
          is_billable: billable,
        },
      })
      resetForm()
      if (editing) onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function onDelete(entry: TimeEntryFull) {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return
    setError(null)
    try {
      await remove.mutateAsync(entry.id)
      if (editing === entry.id) resetForm()
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${project.name} · ${formatDate(workDate)}`}
      description={activity ? activity.name : 'ohne Tätigkeitsart'}
    >
      {entries.length > 0 && (
        <ul className="mb-4 divide-y divide-ink-100 border-y border-ink-100">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2">
              <span className="tabular w-14 shrink-0 text-sm font-medium text-ink-800">
                {minutesToHours(e.duration_minutes)} h
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-600">
                {e.description}
                {!e.is_billable && <span className="ml-1.5 text-xs text-ink-400">(nicht abrechenbar)</span>}
              </span>
              {e.status === 'draft' ? (
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(e)}>Ändern</Button>
                  <Button size="sm" variant="ghost" aria-label="Löschen" onClick={() => onDelete(e)}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              ) : (
                <span className="shrink-0 text-xs text-ink-400">gemeldet</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {locked && entries.every((e) => e.status !== 'draft') ? (
        <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">
          Dieser Tag gehört zu einer bereits gemeldeten Periode und ist gesperrt.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Dauer" hint="1,5 · 1:30 · 90m">
              <Input value={duration} onChange={(e) => setDuration(e.target.value)}
                     placeholder="1,5" autoFocus inputMode="decimal" />
            </Field>
            <Field label="Beschreibung" className="col-span-2">
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                        placeholder="Was wurde gemacht?" />
            </Field>
          </div>

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

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={billable} disabled={!project.is_billable}
                   onChange={(e) => setBillable(e.target.checked)}
                   className="size-4 rounded border-ink-300" />
            abrechenbar
            {!project.is_billable && (
              <span className="text-xs text-ink-400">— das Projekt ist nicht abrechenbar</span>
            )}
          </label>

          <ErrorNote message={error} />

          <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
            {editing && <Button type="button" onClick={resetForm}>Abbrechen</Button>}
            <Button type="button" onClick={onClose}>Schließen</Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {editing ? 'Ändern' : 'Hinzufügen'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
