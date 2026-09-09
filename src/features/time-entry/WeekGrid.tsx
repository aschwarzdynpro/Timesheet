import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WEEKDAY_SHORT, isToday, isWeekend, minutesToHours, parseDuration, toIsoDate, weekDays,
} from '@/lib/week'
import type {
  ActivityType, Project, ReportingPeriod, TimeEntryFull, WorkPackage, WorkPackageBudget,
} from '@/types/database'
import type { EntryDialogTarget } from './EntryDialog'
import { PackageBudget } from './PackageBudget'

export type GridRow = {
  key: string
  project: Project
  activity: ActivityType | null
  workPackage: WorkPackage | null
}

/**
 * Eine Rasterzeile ist eine buchbare Kombination. Das Arbeitspaket gehoert
 * dazu: sonst faenden zwei Buchungen auf verschiedene Pakete in derselben
 * Zelle zusammen und liessen sich dort nicht mehr auseinanderhalten.
 */
export function rowKey(
  projectId: string, activityId: string | null, workPackageId: string | null = null,
): string {
  return `${projectId}|${activityId ?? ''}|${workPackageId ?? ''}`
}

/** Zelle im Raster: Zeile und Tag. */
export function cellKey(rowKey: string, iso: string) {
  return `${rowKey}@${iso}`
}

/**
 * Matrix aus Zeilen (Projekt + Taetigkeitsart) und den sieben Wochentagen.
 *
 * Eine Zelle laesst sich direkt beschreiben. Bei genau einem vorhandenen
 * Eintrag wird dessen Dauer sofort geaendert; bei einem neuen oder mehreren
 * Eintraegen uebernimmt die Tafel darunter, weil dann eine Beschreibung
 * dazugehoert.
 *
 * Ein Klick in eine Zelle waehlt sie aus - darunter stehen dann ihre Eintraege.
 * Das Raster zeigt Summen; wer wissen will, woraus sie bestehen, musste bisher
 * einen Dialog oeffnen, der genau die Woche verdeckte, um die es ging.
 */
export function WeekGrid({
  monday, rows, entries, periods, budgets, selected, onSelect, onQuickUpdate,
}: {
  monday: Date
  rows: GridRow[]
  entries: TimeEntryFull[]
  periods: ReportingPeriod[]
  /** Budgetstand je Arbeitspaket, fuer die Zeilen mit Budget. */
  budgets: Map<string, WorkPackageBudget>
  /** Schluessel der gewaehlten Zelle, siehe `cellKey`. */
  selected: string | null
  onSelect: (target: EntryDialogTarget) => void
  onQuickUpdate: (entry: TimeEntryFull, minutes: number) => void
}) {
  const days = useMemo(() => weekDays(monday), [monday])
  const [draft, setDraft] = useState<Record<string, string>>({})

  // Eintraege nach Zeile und Tag buendeln
  const cells = useMemo(() => {
    const map = new Map<string, TimeEntryFull[]>()
    for (const e of entries) {
      const key = `${rowKey(e.project_id, e.activity_type_id, e.work_package_id)}@${e.work_date}`
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return map
  }, [entries])

  // Gesperrte Tage je Kunde: eine Periode, die nicht mehr offen ist
  const lockedDays = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const p of periods) {
      if (p.status === 'open') continue
      const set = map.get(p.customer_id) ?? new Set<string>()
      for (const day of days) {
        const iso = toIsoDate(day)
        if (iso >= p.period_start && iso <= p.period_end) set.add(iso)
      }
      map.set(p.customer_id, set)
    }
    return map
  }, [periods, days])

  const customerOfRow = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries)
      map.set(rowKey(e.project_id, e.activity_type_id, e.work_package_id), e.customer_id)
    return map
  }, [entries])

  const cellsOf = (row: GridRow, iso: string) => cells.get(cellKey(row.key, iso)) ?? []
  const sumOf = (list: TimeEntryFull[]) => list.reduce((n, e) => n + e.duration_minutes, 0)

  function isLocked(row: GridRow, iso: string): boolean {
    const list = cellsOf(row, iso)
    if (list.some((e) => e.status !== 'draft')) return true
    const customerId = customerOfRow.get(row.key) ?? row.project.customer_id
    return lockedDays.get(customerId)?.has(iso) ?? false
  }

  const zielVon = (row: GridRow, iso: string, presetMinutes?: number): EntryDialogTarget => ({
    project: row.project, activity: row.activity, workPackage: row.workPackage,
    workDate: iso, presetMinutes, locked: isLocked(row, iso),
  })

  function commit(row: GridRow, iso: string, raw: string) {
    const key = cellKey(row.key, iso)
    setDraft((d) => {
      const next = { ...d }
      delete next[key]
      return next
    })

    const list = cellsOf(row, iso)
    const minutes = parseDuration(raw)
    const current = sumOf(list)

    if (raw.trim() === '' || minutes === null) return
    if (minutes === current) return

    if (list.length === 1 && minutes > 0) {
      onQuickUpdate(list[0]!, minutes)   // genau ein Eintrag: direkt aendern
      return
    }
    onSelect(zielVon(row, iso, minutes))
  }

  const dayTotals = days.map((day) => {
    const iso = toIsoDate(day)
    return rows.reduce((sum, row) => sum + sumOf(cellsOf(row, iso)), 0)
  })
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-64 border-b border-ink-200 px-3 py-2 text-left text-xs font-semibold tracking-wide text-ink-400 uppercase">
              Projekt
            </th>
            {days.map((day) => (
              <th key={toIsoDate(day)}
                  className={cn(
                    'w-24 border-b border-ink-200 px-2 py-2 text-center text-xs font-semibold',
                    // Das Wochenende erkennt man an der getoenten Spalte, nicht an
                    // blasser Schrift: ink-300 kam auf 1,7:1 und war praktisch
                    // unlesbar, im dunklen Modus erst recht.
                    'text-ink-500',
                    isWeekend(day) && 'bg-ink-50/50',
                    isToday(day) && 'bg-accent-50 text-accent-700',
                  )}>
                <span className="block">{WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}</span>
                <span className="tabular block font-normal">
                  {String(day.getDate()).padStart(2, '0')}.{String(day.getMonth() + 1).padStart(2, '0')}.
                </span>
              </th>
            ))}
            <th className="w-20 border-b border-ink-200 px-2 py-2 text-right text-xs font-semibold tracking-wide text-ink-400 uppercase">
              Summe
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const rowTotal = days.reduce((sum, day) => sum + sumOf(cellsOf(row, toIsoDate(day))), 0)
            return (
              <tr key={row.key} className="hover:bg-ink-50/40">
                <td className="border-b border-ink-100 px-3 py-1.5">
                  <span className="block truncate font-medium text-ink-800">{row.project.name}</span>
                  <span className="block truncate text-xs text-ink-400">
                    {row.workPackage && (
                      <span className="font-medium text-ink-500">{row.workPackage.code} · </span>
                    )}
                    {row.activity?.name ?? 'ohne Tätigkeitsart'}
                    {!row.project.is_billable && ' · nicht abrechenbar'}
                  </span>
                  {/* Nur wo ein Budget hinterlegt ist - sonst bliebe die Zeile
                      um eine leere Zeile hoeher. */}
                  {row.workPackage && (
                    <PackageBudget budget={budgets.get(row.workPackage.id)} className="mt-0.5" />
                  )}
                </td>

                {days.map((day) => {
                  const iso = toIsoDate(day)
                  const list = cellsOf(row, iso)
                  const sum = sumOf(list)
                  const key = cellKey(row.key, iso)
                  const locked = isLocked(row, iso)
                  const value = draft[key] ?? (sum > 0 ? minutesToHours(sum) : '')
                  const gewaehlt = selected === key

                  return (
                    <td key={iso}
                        className={cn('border-b border-ink-100 p-0',
                          isWeekend(day) && 'bg-ink-50/50',
                          isToday(day) && 'bg-accent-50/40',
                          // Die gewaehlte Zelle muss sichtbar bleiben, auch wenn
                          // der Fokus unten in der Tafel steht.
                          gewaehlt && 'bg-accent-100 ring-2 ring-accent-500 ring-inset')}>
                      <div className="relative">
                        <input
                          value={value}
                          // Der Projektname allein reicht nicht: dasselbe
                          // Projekt steht mehrfach im Raster, einmal je
                          // Arbeitspaket und Taetigkeitsart.
                          aria-label={`${row.project.name} · ${row.workPackage?.code ?? 'ohne Arbeitspaket'}`
                            + ` · ${row.activity?.name ?? 'ohne Tätigkeitsart'}, ${iso}`}
                          // Auch eine gesperrte Zelle laesst sich waehlen: was
                          // gemeldet wurde, will man lesen koennen.
                          readOnly={locked}
                          aria-readonly={locked || undefined}
                          onFocus={() => { if (!gewaehlt) onSelect(zielVon(row, iso)) }}
                          onChange={(e) => {
                            if (locked) return
                            setDraft((d) => ({ ...d, [key]: e.target.value }))
                          }}
                          onBlur={(e) => { if (!locked) commit(row, iso, e.target.value) }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') {
                              setDraft((d) => {
                                const next = { ...d }
                                delete next[key]
                                return next
                              })
                              ;(e.target as HTMLInputElement).blur()
                            }
                          }}
                          className={cn(
                            'tabular h-9 w-full cursor-pointer border-0 bg-transparent px-2 text-center text-ink-800',
                            'focus:bg-surface focus:ring-2 focus:ring-accent-500 focus:outline-none',
                            locked && 'text-ink-500',
                            list.length > 1 && 'font-medium',
                          )}
                        />
                        {list.length > 1 && (
                          <span title={`${list.length} Einträge`}
                                className="pointer-events-none absolute top-0.5 right-0.5 rounded bg-accent-100 px-1 text-[10px] font-semibold text-accent-700">
                            {list.length}
                          </span>
                        )}
                        {locked && (
                          <Lock className="pointer-events-none absolute top-1 right-1 size-3 text-ink-400" />
                        )}
                      </div>
                    </td>
                  )
                })}

                <td className="tabular border-b border-ink-100 px-2 py-1.5 text-right font-medium text-ink-700">
                  {rowTotal > 0 ? minutesToHours(rowTotal) : '–'}
                </td>
              </tr>
            )
          })}
        </tbody>

        <tfoot>
          <tr>
            <td className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">
              Summe
            </td>
            {dayTotals.map((total, i) => (
              <td key={i} className={cn('tabular px-2 py-2 text-center font-medium',
                                        total > 0 ? 'text-ink-800' : 'text-ink-500',
                                        isToday(days[i]!) && 'bg-accent-50/40')}>
                {total > 0 ? minutesToHours(total) : '–'}
              </td>
            ))}
            <td className="tabular border-t-2 border-ink-800 px-2 py-2 text-right font-semibold text-ink-900">
              {minutesToHours(weekTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
