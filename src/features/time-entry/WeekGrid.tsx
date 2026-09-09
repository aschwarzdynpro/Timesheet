import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Lock, X } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import {
  WEEKDAY_SHORT, isToday, isWeekend, minutesToHours, parseDuration, toIsoDate, weekDays,
} from '@/lib/week'
import type {
  Project, ReportingPeriod, TimeEntryFull, WorkPackageBudget,
} from '@/types/database'
import { EntryEditor, entryEditorKey, type EntryDialogTarget } from './EntryDialog'
import { hatBudget, PaketChip } from './PackageBudget'
import { gesperrteTage } from './lock'

/**
 * Eine Rasterzeile ist ein Projekt.
 *
 * Vorher war sie eine Kombination aus Projekt, Arbeitspaket und Taetigkeitsart:
 * Ein Projekt mit vier Paketen belegte vier Zeilen mit je einer Zahl darin, und
 * die Woche geriet zur Liste. Die Aufteilung steht jetzt in der aufgeklappten
 * Zeile, wo Platz dafuer ist.
 */
export type GridRow = { key: string; project: Project }

/** Ein Arbeitspaket, wie es in der Zeilenbeschriftung erscheint. */
type Paket = { id: string; code: string; budget?: WorkPackageBudget }

export const rowKey = (projectId: string): string => projectId

/** Zelle im Raster: Projekt und Tag. */
export function cellKey(projectId: string, iso: string) {
  return `${projectId}@${iso}`
}

/**
 * Matrix aus Projekten und den sieben Wochentagen.
 *
 * Eine Zelle laesst sich direkt beschreiben. Bei genau einem vorhandenen
 * Eintrag wird dessen Dauer sofort geaendert; sonst klappt die Zeile auf,
 * weil dann eine Beschreibung dazugehoert oder die Zuordnung unklar waere.
 *
 * Ein Klick in eine Zelle klappt die Zeile auf - direkt darunter stehen die
 * Eintraege dieses Tages, nach Arbeitspaket gruppiert. Vorher stand dafuer eine
 * Tafel unter dem Raster; sie war weit weg von der Zahl, aus der sie stammte.
 */
export function WeekGrid({
  monday, rows, entries, periods, budgets, selected, onSelect, onClose, onQuickUpdate,
}: {
  monday: Date
  rows: GridRow[]
  entries: TimeEntryFull[]
  periods: ReportingPeriod[]
  /** Budgetstand je Arbeitspaket, fuer die Pakete mit Budget. */
  budgets: Map<string, WorkPackageBudget>
  /** Die aufgeklappte Zelle. */
  selected: EntryDialogTarget | null
  onSelect: (target: EntryDialogTarget) => void
  onClose: () => void
  onQuickUpdate: (entry: TimeEntryFull, minutes: number) => void
}) {
  const days = useMemo(() => weekDays(monday), [monday])
  const [draft, setDraft] = useState<Record<string, string>>({})

  // Eintraege nach Projekt und Tag buendeln
  const cells = useMemo(() => {
    const map = new Map<string, TimeEntryFull[]>()
    for (const e of entries) {
      const key = cellKey(e.project_id, e.work_date)
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return map
  }, [entries])

  const lockedDays = useMemo(() => gesperrteTage(periods, days), [periods, days])

  const cellsOf = (row: GridRow, iso: string) => cells.get(cellKey(row.project.id, iso)) ?? []
  const sumOf = (list: TimeEntryFull[]) => list.reduce((n, e) => n + e.duration_minutes, 0)

  function isLocked(row: GridRow, iso: string): boolean {
    const list = cellsOf(row, iso)
    if (list.some((e) => e.status !== 'draft')) return true
    return lockedDays.get(row.project.customer_id)?.has(iso) ?? false
  }

  const zielVon = (row: GridRow, iso: string, presetMinutes?: number): EntryDialogTarget => ({
    project: row.project, workDate: iso, presetMinutes, locked: isLocked(row, iso),
  })

  function commit(row: GridRow, iso: string, raw: string) {
    const key = cellKey(row.project.id, iso)
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

  /** Die Arbeitspakete, auf die diese Woche in diesem Projekt gebucht wurde. */
  const paketeDerWoche = (row: GridRow) => {
    const map = new Map<string, string>()
    for (const e of entries) {
      if (e.project_id !== row.project.id || !e.work_package_id) continue
      map.set(e.work_package_id, e.work_package_code ?? '')
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de', { numeric: true }))
  }

  /**
   * Woran diese Woche gearbeitet wurde: ein Plaettchen je Arbeitspaket, die mit
   * Budget zuerst - danach sucht man beim Buchen.
   *
   * Sie stehen in einem umbrechenden Streifen, nicht fest untereinander: ein
   * Plaettchen mit Zahlen fuellt die Spalte ohnehin allein, zwei kurze Kuerzel
   * passen nebeneinander. Die Anordnung ergibt sich damit aus der Breite und
   * muss nicht entschieden werden.
   */
  const beschriftung = (row: GridRow): Paket[] => {
    const mitBudget: Paket[] = []
    const ohneBudget: Paket[] = []

    for (const [id, code] of paketeDerWoche(row)) {
      // Der Datensatz geht in beiden Faellen mit: ohne Budget traegt er die
      // gebuchte Zeit, und die steht auch dort im Plaettchen.
      const budget = budgets.get(id)
      if (hatBudget(budget)) mitBudget.push({ id, code, budget })
      else ohneBudget.push({ id, code, budget })
    }
    if (entries.some((e) => e.project_id === row.project.id && !e.work_package_id)) {
      ohneBudget.push({ id: 'ohne', code: 'ohne Paket' })
    }

    return [...mitBudget, ...ohneBudget]
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
            const offen = selected?.project.id === row.project.id ? selected : null
            const pakete = beschriftung(row)

            return [
              <tr key={row.key} className={cn(!offen && 'hover:bg-ink-50/40')}>
                <td className={cn('border-b border-ink-100 px-3 py-1.5',
                                  offen && 'bg-accent-50/40')}>
                  {/* Feste Breite: ein Plaettchen mit zwei Budgets zog die
                      Spalte sonst breiter und nahm den Tagesspalten den Platz.
                      Jetzt bricht das Plaettchen um, nicht die Tabelle. */}
                  <span className="flex w-56 items-start gap-1">
                    {/* Die Marke zeigt, dass hier etwas aufgeht - und wo es
                        gerade offen steht. */}
                    {offen
                      ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-accent-600" />
                      : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-ink-300" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-800">
                        {row.project.name}
                      </span>
                      {/* Eine leere Zeile bekommt hier gar nichts: "ohne
                          Arbeitspaket" waere eine Aussage ueber Buchungen, die
                          es nicht gibt. */}
                      {pakete.length > 0 && (
                        <span className="mt-1 flex flex-wrap items-start gap-1">
                          {pakete.map((p) => (
                            <PaketChip key={p.id} code={p.code} budget={p.budget} />
                          ))}
                        </span>
                      )}
                      {!row.project.is_billable && (
                        <span className="mt-0.5 block text-xs text-ink-400">
                          nicht abrechenbar
                        </span>
                      )}
                    </span>
                  </span>
                </td>

                {days.map((day) => {
                  const iso = toIsoDate(day)
                  const list = cellsOf(row, iso)
                  const sum = sumOf(list)
                  const key = cellKey(row.project.id, iso)
                  const locked = isLocked(row, iso)
                  const value = draft[key] ?? (sum > 0 ? minutesToHours(sum) : '')
                  const gewaehlt = offen?.workDate === iso

                  return (
                    <td key={iso}
                        className={cn('relative border-b border-ink-100 p-0',
                          isWeekend(day) && 'bg-ink-50/50',
                          isToday(day) && 'bg-accent-50/40',
                          gewaehlt && 'bg-accent-100')}>
                      {/* Setzt die Mindesthoehe der Zelle. Das Feld darueber
                          liegt deckend darin: `h-full` greift in einer
                          Tabellenzelle nicht - die Prozentangabe findet keine
                          aufgeloeste Hoehe und faellt auf die Zeilenhoehe des
                          Inhalts zurueck. Der Rahmen der Auswahl stand dadurch
                          um die ganze Zeile und das Feld mittig darin: zwei
                          Rechtecke fuer eine Zelle. */}
                      <div className="h-9" aria-hidden />
                      <input
                        value={value}
                        aria-label={`${row.project.name}, ${iso}`}
                        // Auch eine gesperrte Zelle laesst sich waehlen: was
                        // gemeldet wurde, will man lesen koennen.
                        readOnly={locked}
                        aria-readonly={locked || undefined}
                        aria-expanded={gewaehlt}
                        // Der Klick schaltet um: das zweite Mal auf dieselbe
                        // Zelle klappt wieder zu. Bewusst onMouseDown - es
                        // feuert vor dem Fokus und sieht damit noch den Zustand
                        // vor dem Klick. Nach onFocus haette React schon neu
                        // gerendert, und die Zelle waere im selben Klick
                        // aufgegangen und wieder zugefallen.
                        onMouseDown={() => (gewaehlt ? onClose() : onSelect(zielVon(row, iso)))}
                        // Fuer die Tastatur: wer mit Tab hereinkommt, loest
                        // keinen Mausklick aus.
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
                          'tabular absolute inset-0 w-full cursor-pointer border-0 bg-transparent px-2 text-center text-ink-800',
                          'focus:ring-2 focus:ring-accent-500 focus:outline-none focus:ring-inset',
                          // Die gewaehlte Zelle bleibt markiert, auch wenn der
                          // Fokus unten im Editor steht.
                          gewaehlt && 'ring-2 ring-accent-500 ring-inset',
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
                    </td>
                  )
                })}

                <td className={cn('tabular border-b border-ink-100 px-2 py-1.5 text-right font-medium text-ink-700',
                                  offen && 'bg-accent-50/40')}>
                  {rowTotal > 0 ? minutesToHours(rowTotal) : '–'}
                </td>
              </tr>,

              // Die aufgeklappte Zeile steht direkt unter ihrem Projekt - dort,
              // wo die Zahl steht, aus der sie stammt.
              offen && (
                <tr key={`${row.key}-offen`}>
                  <td colSpan={days.length + 2}
                      className="border-b border-ink-200 bg-accent-50/20 px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-800">
                        {row.project.name}
                        <span className="tabular ml-2 font-normal text-ink-500">
                          {formatDate(offen.workDate)}
                        </span>
                        {(() => {
                          const list = cellsOf(row, offen.workDate)
                          if (list.length === 0) return null
                          return (
                            <span className="tabular ml-2 text-xs font-normal text-ink-500">
                              {list.length === 1 ? '1 Eintrag' : `${list.length} Einträge`},{' '}
                              {minutesToHours(sumOf(list))} h
                            </span>
                          )
                        })()}
                      </p>
                      <Button size="sm" variant="ghost" aria-label="Zeile zuklappen" onClick={onClose}>
                        <X className="size-4" />
                      </Button>
                    </div>
                    <EntryEditor key={entryEditorKey(offen)} target={offen}
                                 entries={cellsOf(row, offen.workDate)} />
                  </td>
                </tr>
              ),
            ]
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
