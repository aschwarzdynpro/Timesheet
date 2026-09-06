import { Plus } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { WEEKDAY_SHORT, isToday, minutesToHours, toIsoDate, weekDays } from '@/lib/week'
import type { TimeEntryFull } from '@/types/database'

/**
 * Tagesliste fuer Mobil und Tablet. Das Wochenraster braucht Breite und bleibt
 * dem Laptop vorbehalten; unterwegs zaehlt Ansehen und Korrigieren.
 */
export function DayList({
  monday, entries, onAdd, onEdit,
}: {
  monday: Date
  entries: TimeEntryFull[]
  /** Erfassen fuer einen bestimmten Tag. */
  onAdd: (workDate: string) => void
  onEdit: (entry: TimeEntryFull) => void
}) {
  const days = weekDays(monday).filter((day) => {
    const iso = toIsoDate(day)
    return entries.some((e) => e.work_date === iso) || (day.getDay() !== 0 && day.getDay() !== 6)
  })

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Diese Woche ist noch leer"
        hint="Erfasse eine Zeit oder starte den Timer."
        action={
          <Button variant="primary" onClick={() => onAdd(toIsoDate(new Date()))}>
            <Plus className="size-4" /> Zeit erfassen
          </Button>
        }
      />
    )
  }

  return (
    <ul className="divide-y divide-ink-100">
      {days.map((day) => {
        const iso = toIsoDate(day)
        const ofDay = entries.filter((e) => e.work_date === iso)
        const total = ofDay.reduce((n, e) => n + e.duration_minutes, 0)

        return (
          <li key={iso} className="py-3">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className={cn('text-sm font-semibold',
                                  isToday(day) ? 'text-accent-700' : 'text-ink-600')}>
                {WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}
                {', '}
                {String(day.getDate()).padStart(2, '0')}.{String(day.getMonth() + 1).padStart(2, '0')}.
                {isToday(day) && <span className="ml-1.5 text-xs font-normal">heute</span>}
              </span>
              <span className="flex items-center gap-1">
                <span className="tabular text-sm text-ink-500">
                  {total > 0 ? `${minutesToHours(total)} h` : '–'}
                </span>
                <Button size="sm" variant="ghost" aria-label={`Zeit für ${iso} erfassen`}
                        onClick={() => onAdd(iso)}>
                  <Plus className="size-4" />
                </Button>
              </span>
            </div>

            {ofDay.length === 0 ? (
              <button onClick={() => onAdd(iso)}
                      className="w-full rounded-md border border-dashed border-ink-200 px-3 py-2 text-left text-sm text-ink-400 hover:border-accent-500 hover:text-accent-600">
                nichts erfasst — antippen zum Erfassen
              </button>
            ) : (
              <ul className="space-y-1">
                {ofDay.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => onEdit(e)}
                            className="flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left hover:bg-ink-50">
                      <span className="tabular w-12 shrink-0 text-sm font-medium text-ink-800">
                        {minutesToHours(e.duration_minutes)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-800">{e.description}</span>
                        <span className="block truncate text-xs text-ink-400">
                          {e.customer_name} · {e.project_name}
                          {e.activity_name && ` · ${e.activity_name}`}
                        </span>
                      </span>
                      {e.status !== 'draft' && (
                        <span className="shrink-0 text-xs text-ink-400">gemeldet</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
