import { useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button, ErrorNote, Input, Select } from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { parseDuration } from '@/lib/week'
import type { Project } from '@/types/database'
import { standardArt, useActivityTypes } from '@/features/activity-types/api'
import { nachKuerzel, useAllWorkPackageBudgets, useWorkPackages } from '@/features/projects/api'
import { paketLabel } from './PackageBudget'
import { useSaveTimeEntry } from './api'

/**
 * Eine Zeile, in der ein Eintrag entsteht - ohne Dialog, ohne Aufklappen.
 *
 * Der haeufigste Vorgang dieses Programms ist "zwei Stunden auf Ticket X von
 * heute". Er kostete bisher vier Schritte: Zelle waehlen, Zeile ergaenzen,
 * Paket suchen, tippen. Hier ist er einer.
 *
 * Projekt und Paket bleiben nach dem Speichern stehen, Dauer und Beschreibung
 * werden leer und der Fokus springt zurueck auf die Dauer: vier Eintraege
 * hintereinander sind vier mal tippen, Tab, tippen, Enter.
 */
export function QuickEntry({
  projects, workDate, locked, onGesperrt,
}: {
  projects: Project[]
  workDate: string
  /** Prueft, ob dieser Tag fuer das Projekt in einer gemeldeten Periode liegt. */
  locked: (project: Project) => boolean
  onGesperrt?: () => void
}) {
  const save = useSaveTimeEntry()
  const { data: activityTypes } = useActivityTypes()
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0]!.id : '')
  const [packageId, setPackageId] = useState('')
  const [dauer, setDauer] = useState('')
  const [text, setText] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const dauerFeld = useRef<HTMLInputElement>(null)

  const { data: workPackages } = useWorkPackages(projectId || null)
  // Derselbe Abfrageschluessel wie im Wochenraster: die Budgets liegen beim
  // Erfassen laengst im Zwischenspeicher, die Liste kostet keine Anfrage.
  const { data: budgets } = useAllWorkPackageBudgets()
  const pakete = (workPackages ?? []).filter((w) => w.is_active).sort(nachKuerzel)
  const budgetVon = new Map((budgets ?? []).map((b) => [b.work_package_id, b]))
  const project = projects.find((p) => p.id === projectId) ?? null
  const gesperrt = project ? locked(project) : false

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFehler(null)

    if (!project) return setFehler('Bitte ein Projekt wählen.')
    if (gesperrt) {
      onGesperrt?.()
      return setFehler(`Der ${formatDate(workDate)} gehört bei diesem Kunden zu einer `
        + 'bereits gemeldeten Periode und ist gesperrt.')
    }

    const minutes = parseDuration(dauer)
    if (minutes === null || minutes <= 0) {
      return setFehler('Dauer nicht verstanden. Möglich sind etwa 1,5 · 1:30 · 90m.')
    }
    if (minutes > 1440) return setFehler('Mehr als 24 Stunden an einem Tag sind nicht möglich.')
    if (!text.trim()) {
      return setFehler('Ohne Beschreibung geht es nicht — sie ist die Position im Kundenreport.')
    }

    try {
      await save.mutateAsync({
        values: {
          project_id: project.id,
          activity_type_id: standardArt(activityTypes) || null,
          work_package_id: packageId || null,
          work_date: workDate,
          duration_minutes: minutes,
          description: text.trim(),
          is_billable: project.is_billable,
        },
      })
      // Projekt und Paket bleiben stehen: der naechste Eintrag betrifft meist
      // dasselbe Ticket oder wenigstens dasselbe Projekt.
      setDauer('')
      setText('')
      dauerFeld.current?.focus()
    } catch (err) {
      setFehler(describeError(err))
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Projekt" className="w-56" value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setPackageId('') }}>
          <option value="">Projekt wählen …</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>

        {/* Nur zeigen, wenn das Projekt ueberhaupt gegliedert ist. Breiter als
            das Kuerzel allein: zugeklappt steht dort auch der Budgetstand. */}
        {pakete.length > 0 && (
          <Select aria-label="Arbeitspaket" className="w-56" value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}>
            <option value="">ohne Arbeitspaket</option>
            {pakete.map((w) => (
              <option key={w.id} value={w.id}>{paketLabel(w.code, budgetVon.get(w.id))}</option>
            ))}
          </Select>
        )}

        <Input ref={dauerFeld} aria-label="Dauer" inputMode="decimal" placeholder="1,5"
               className="tabular w-20 text-right" value={dauer}
               onChange={(e) => setDauer(e.target.value)} />

        <Input aria-label="Beschreibung" placeholder="Was wurde gemacht?"
               className="min-w-[12rem] flex-1" value={text}
               onChange={(e) => setText(e.target.value)} />

        <Button type="submit" variant="primary" disabled={save.isPending || gesperrt}>
          <Plus className="size-4" /> Erfassen
        </Button>
      </div>

      {gesperrt && (
        <p className="text-xs text-ink-500">
          Der {formatDate(workDate)} ist bei diesem Kunden bereits gemeldet.
        </p>
      )}
      <ErrorNote message={fehler} />
    </form>
  )
}
