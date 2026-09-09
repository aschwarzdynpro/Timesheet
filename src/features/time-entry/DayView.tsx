import { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { WEEKDAY_SHORT, isToday, isWeekend, minutesToHours, toIsoDate, weekDays } from '@/lib/week'
import type { Project, ReportingPeriod, TimeEntryFull } from '@/types/database'
import { EntryEditor } from './EntryDialog'
import { QuickEntry } from './QuickEntry'
import { gesperrteTage } from './lock'

/**
 * Der Tag als Hauptansicht.
 *
 * Erfasst wird tageweise: 4,1 Eintraege am Tag auf 3,4 Projekte, sagen die
 * Zahlen dieses Repos. Das Wochenraster ist dafuer der falsche Ort - es zeigt
 * sieben Tage, von denen sechs beim Buchen nicht interessieren, und die
 * Beschreibung, um die es eigentlich geht, sieht man dort ueberhaupt nicht.
 * Die Woche bleibt daneben als Raster, zum Pruefen und Melden.
 */
export function DayView({
  monday, workDate, entries, periods, projects, onSelectDay,
}: {
  monday: Date
  workDate: string
  /** Alle Eintraege der Woche - die Leiste braucht sie, der Tag filtert. */
  entries: TimeEntryFull[]
  periods: ReportingPeriod[]
  projects: Project[]
  onSelectDay: (iso: string) => void
}) {
  const days = useMemo(() => weekDays(monday), [monday])
  const gesperrt = useMemo(() => gesperrteTage(periods, days), [periods, days])

  const desTages = useMemo(
    () => entries.filter((e) => e.work_date === workDate),
    [entries, workDate],
  )

  /** Je Projekt ein Block - in der Reihenfolge, in der die Projekte heissen. */
  const proProjekt = useMemo(() => {
    const map = new Map<string, TimeEntryFull[]>()
    for (const e of desTages) {
      const liste = map.get(e.project_id)
      if (liste) liste.push(e)
      else map.set(e.project_id, [e])
    }
    return [...map.entries()]
      .map(([id, liste]) => ({ project: projects.find((p) => p.id === id), liste }))
      .filter((z): z is { project: Project; liste: TimeEntryFull[] } => Boolean(z.project))
      .sort((a, b) => a.project.name.localeCompare(b.project.name, 'de'))
  }, [desTages, projects])

  const istGesperrt = (project: Project) =>
    gesperrt.get(project.customer_id)?.has(workDate) ?? false

  const summe = desTages.reduce((n, e) => n + e.duration_minutes, 0)

  return (
    <>
      {/* Wochenleiste: sieben Tage mit ihrer Summe, der gewaehlte hervorgehoben. */}
      <Card className="mt-4 overflow-hidden">
        <ul className="grid grid-cols-7">
          {days.map((day) => {
            const iso = toIsoDate(day)
            const tages = entries.filter((e) => e.work_date === iso)
            const minuten = tages.reduce((n, e) => n + e.duration_minutes, 0)
            const aktiv = iso === workDate
            const zu = [...gesperrt.values()].some((set) => set.has(iso))
            return (
              <li key={iso}>
                <button
                  type="button"
                  aria-pressed={aktiv}
                  onClick={() => onSelectDay(iso)}
                  className={cn(
                    'flex w-full flex-col items-center gap-0.5 border-r border-ink-100 px-1 py-2 last:border-r-0 transition',
                    isWeekend(day) && !aktiv && 'bg-ink-50/50',
                    aktiv ? 'bg-accent-100 text-accent-700' : 'hover:bg-ink-50',
                  )}
                >
                  <span className={cn('text-xs font-semibold',
                                      aktiv ? 'text-accent-700'
                                            : isToday(day) ? 'text-accent-600' : 'text-ink-500')}>
                    {WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}
                  </span>
                  <span className="tabular text-xs text-ink-400">
                    {String(day.getDate()).padStart(2, '0')}.{String(day.getMonth() + 1).padStart(2, '0')}.
                  </span>
                  <span className={cn('tabular text-sm font-medium',
                                      minuten > 0 ? 'text-ink-800' : 'text-ink-400')}>
                    {minuten > 0 ? minutesToHours(minuten) : '–'}
                  </span>
                  {zu && <Lock className="size-3 text-ink-400" aria-label="gemeldet" />}
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      {/* Der haeufigste Vorgang steht oben und ist immer sichtbar. */}
      <Card className="mt-3 px-4 py-3">
        <QuickEntry projects={projects} workDate={workDate} locked={istGesperrt} />
      </Card>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-ink-700">{formatDate(workDate)}</h2>
        <p className="tabular text-sm text-ink-500">
          {desTages.length === 0
            ? 'nichts erfasst'
            : `${desTages.length === 1 ? '1 Eintrag' : `${desTages.length} Einträge`} · ${minutesToHours(summe)} h`}
        </p>
      </div>

      {proProjekt.length > 0 && (
        <p className="mt-2 px-1 text-right text-xs text-ink-500">
          Gespeichert wird beim Verlassen des Feldes.
        </p>
      )}

      {proProjekt.length === 0 ? (
        <Card className="mt-2">
          <EmptyState
            title="Für diesen Tag ist nichts erfasst"
            hint="Die Zeile oben legt den ersten Eintrag an — Projekt, Dauer, was gemacht wurde."
          />
        </Card>
      ) : (
        proProjekt.map(({ project, liste }) => (
          <Card key={project.id} className="mt-2 px-4 py-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-ink-800">{project.name}</h3>
              <span className="tabular text-sm text-ink-500">
                {minutesToHours(liste.reduce((n, e) => n + e.duration_minutes, 0))} h
              </span>
            </div>
            {/* Derselbe Editor wie in der aufgeklappten Rasterzeile und im
                Dialog des Telefons. */}
            <EntryEditor
              target={{ project, workDate, locked: istGesperrt(project) }}
              entries={liste}
              speicherhinweis={false}
            />
          </Card>
        ))
      )}
    </>
  )
}
