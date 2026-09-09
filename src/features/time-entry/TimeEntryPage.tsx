import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, CopyPlus, Plus } from 'lucide-react'
import {
  Button, Card, EmptyState, ErrorNote, Select, WarnNote,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatDate, formatEuro, formatPercent, sumOrNull } from '@/lib/format'
import { addDays, isoWeek, minutesToHours, mondayOf, toIsoDate } from '@/lib/week'
import type { TimeEntryFull, WorkPackageBudget } from '@/types/database'
import { useCustomers } from '@/features/customers/api'
import { useAllWorkPackageBudgets, useProjects } from '@/features/projects/api'
import { useActivityTypes } from '@/features/activity-types/api'
import { useIncomeTaxPercent } from '@/features/account/api'
import { EntryDialog, type EntryDialogTarget } from './EntryDialog'
import { WeekGrid, rowKey, type GridRow } from './WeekGrid'
import { DayList } from './DayList'
import { Timer } from './Timer'
import { QuickEntryDialog } from './QuickEntryDialog'
import { useSaveTimeEntry, useWeekEntries, useWeekPeriods } from './api'

export function TimeEntryPage() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [extraRows, setExtraRows] = useState<string[]>([])
  const [dialog, setDialog] = useState<EntryDialogTarget | null>(null)
  // Die aufgeklappte Rasterzelle. Getrennt vom Dialog: breit klappt die Zeile
  // im Raster auf, schmal gibt es das Raster gar nicht.
  const [zelle, setZelle] = useState<EntryDialogTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [quickEntry, setQuickEntry] = useState<{ open: boolean; workDate?: string }>({
    open: false,
  })

  const { data: projects } = useProjects()
  const { data: budgets } = useAllWorkPackageBudgets()
  const { data: activityTypes } = useActivityTypes()
  const { data: customers } = useCustomers()
  const { data: entries, isPending, error: loadError } = useWeekEntries(monday)
  const { data: periods, error: periodError } = useWeekPeriods(monday)
  const previousWeek = useWeekEntries(addDays(monday, -7))
  // Nur fuer den Hinweis unter der Zahl - abgezogen hat die Sicht den Satz
  // schon.
  const steuersatz = useIncomeTaxPercent()
  const save = useSaveTimeEntry()

  /** Ein Wochenwechsel nimmt die Auswahl mit - sonst zeigte die Tafel einen
      Tag, der gar nicht mehr im Raster steht. */
  function zeigeWoche(next: (m: Date) => Date) {
    setMonday((m) => next(m))
    setZelle(null)
  }

  const { year, week } = isoWeek(monday)
  const sunday = addDays(monday, 6)

  // Auswahl fuer "Zeile hinzufuegen". Eine Zeile ist ein Projekt; Arbeitspaket
  // und Taetigkeitsart entscheidet man beim Eintrag selbst, in der
  // aufgeklappten Zeile.
  const [neuesProjekt, setNeuesProjekt] = useState('')

  /** Budgetstand je Arbeitspaket - Raster und Tagesliste zeigen daraus den Rest. */
  const budgetVon = useMemo(() => {
    const map = new Map<string, WorkPackageBudget>()
    for (const b of budgets ?? []) map.set(b.work_package_id, b)
    return map
  }, [budgets])

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => p.status === 'active'),
    [projects],
  )

  /** Zeilen: ein Projekt je Zeile - was diese Woche erfasst wurde, plus manuell
      ergaenzte. Die Aufteilung nach Arbeitspaket steht in der aufgeklappten
      Zeile, nicht im Raster. */
  const rows: GridRow[] = useMemo(() => {
    const map = new Map<string, GridRow>()
    const add = (projectId: string) => {
      if (map.has(projectId)) return
      const project = projects?.find((p) => p.id === projectId)
      if (!project) return
      map.set(projectId, { key: rowKey(projectId), project })
    }
    for (const e of entries ?? []) add(e.project_id)
    for (const projectId of extraRows) add(projectId)
    return [...map.values()]
      .sort((a, b) => a.project.name.localeCompare(b.project.name, 'de'))
  }, [entries, extraRows, projects])

  // Die Eintraege des offenen Dialogs werden bei jedem Rendern neu bestimmt.
  // Als Momentaufnahme im Dialog wuerde die Liste nach dem Hinzufuegen veralten.
  const dialogEntries = useMemo(() => {
    if (!dialog) return []
    return (entries ?? []).filter(
      (e) => e.project_id === dialog.project.id && e.work_date === dialog.workDate)
  }, [dialog, entries])

  const totals = useMemo(() => {
    const list = entries ?? []
    return {
      tracked: list.reduce((n, e) => n + e.duration_minutes, 0),
      billable: list.reduce((n, e) => n + e.billable_minutes, 0),
      fees: list.reduce((n, e) => n + Number(e.amount ?? 0), 0),
      // Der Betrag nach Steuern kommt fertig aus der Sicht: den Steuersatz kennt
      // nur die Datenbank, damit Woche, Auswertung und Export dieselbe Zahl
      // zeigen. Fehlt die Spalte, bleibt die Zahl offen statt bei 0,00 EUR.
      net: sumOrNull(list.map((e) => e.net_amount)),
      // Abrechenbare Zeit ohne Satz zaehlt mit 0,00 EUR ins Honorar. Ohne
      // Hinweis sieht das aus wie "nichts verdient" statt "Satz fehlt".
      ohneSatz: list.filter((e) => e.is_billable && e.rate === null),
    }
  }, [entries])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(describeError(err))
    }
  }

  function copyPreviousWeek() {
    const ids = new Set(extraRows)
    for (const e of previousWeek.data ?? []) ids.add(e.project_id)
    setExtraRows([...ids])
  }

  const needsSetup = (customers?.length ?? 0) === 0 || activeProjects.length === 0

  return (
    <>
      <PageHeader
        title="Zeiten"
        subtitle="Dauer direkt in die Zelle tippen — 1,5 · 1:30 · 90m. Rundung und Periode setzt die Datenbank."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={activeProjects.length === 0}
                    onClick={() => setQuickEntry({ open: true })}>
              <Plus className="size-4" /> Erfassen
            </Button>
            <Button aria-label="Vorherige Woche"
                    onClick={() => zeigeWoche((m) => addDays(m, -7))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button onClick={() => zeigeWoche(() => mondayOf(new Date()))}>
              <CalendarDays className="size-4" /> Heute
            </Button>
            <Button aria-label="Nächste Woche"
                    onClick={() => zeigeWoche((m) => addDays(m, 7))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-ink-800">KW {week} / {year}</p>
          <p className="tabular text-sm text-ink-500">
            {formatDate(toIsoDate(monday))} – {formatDate(toIsoDate(sunday))}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-right">
          <div>
            <dt className="text-xs tracking-wide text-ink-400 uppercase">Erfasst</dt>
            <dd className="tabular text-lg font-semibold text-ink-800">
              {minutesToHours(totals.tracked)} h
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-400 uppercase">Abrechenbar</dt>
            <dd className="tabular text-lg font-semibold text-ink-800">
              {minutesToHours(totals.billable)} h
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-400 uppercase">Honorar</dt>
            <dd className="tabular text-lg font-semibold text-ink-800">{formatEuro(totals.fees)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-400 uppercase">Nach Steuern</dt>
            <dd className="tabular text-lg font-semibold text-ink-800">{formatEuro(totals.net)}</dd>
            {/* Der Hinweis erst, wenn beides steht: der Satz geladen und die
                Zahl bekannt. Sonst erklaerte er einen Gedankenstrich. */}
            {steuersatz.data !== undefined && totals.net !== null && (
              <dd className="text-xs text-ink-400">
                nach {formatPercent(steuersatz.data)} Einkommensteuer
              </dd>
            )}
          </div>
        </dl>
      </div>

      {totals.ohneSatz.length > 0 && (
        <div className="mt-3">
          <WarnNote>
            {totals.ohneSatz.length === 1
              ? 'Ein abrechenbarer Eintrag dieser Woche hat keinen Stundensatz'
              : `${totals.ohneSatz.length} abrechenbare Einträge dieser Woche haben keinen Stundensatz`}
            {' '}und zählt mit 0,00 € ins Honorar:{' '}
            {[...new Set(totals.ohneSatz.map(
              (e) => `${e.project_code} ${e.activity_name ? `· ${e.activity_name}` : 'ohne Tätigkeitsart'}`,
            ))].join(', ')}. Der Satz hängt an Projekt <em>und</em> Tätigkeitsart — unter{' '}
            <Link to="/projekte" className="underline">Projekte</Link> lässt er sich ergänzen.
          </WarnNote>
        </div>
      )}

      {/* Eine fehlgeschlagene Abfrage sah bisher aus wie eine leere Woche.
          Genau so blieben gespeicherte Zeiten unbemerkt unsichtbar. */}
      {(loadError ?? periodError) && (
        <div className="mt-4">
          <ErrorNote message={`Die Woche konnte nicht geladen werden: ${describeError(loadError ?? periodError)}`} />
        </div>
      )}
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}

      {needsSetup ? (
        <Card className="mt-4">
          <EmptyState
            title="Zuerst Stammdaten anlegen"
            hint="Zeiterfassung braucht mindestens einen Kunden mit einem aktiven Projekt. Ein Stundensatz am Projekt sorgt dafür, dass die erfasste Zeit auch bewertet wird."
          />
        </Card>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Timer
              projects={activeProjects}
              activityTypes={activityTypes ?? []}
              onStop={({ projectId, activityTypeId, minutes, workDate }) => {
                const project = activeProjects.find((p) => p.id === projectId)
                if (!project) return
                setDialog({ project, workDate, presetMinutes: minutes,
                            presetActivity: activityTypeId })
              }}
            />
            {/* Beide fuegen dem Wochenraster leere Zeilen hinzu - unter 640 px
                gibt es das Raster nicht, dort waere die Wirkung unsichtbar. */}
            <Button className="hidden sm:inline-flex" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> Zeile
            </Button>
            {(previousWeek.data?.length ?? 0) > 0 && (
              <Button className="hidden sm:inline-flex" onClick={copyPreviousWeek}
                      title="Projektzeilen der Vorwoche übernehmen, ohne Stunden">
                <CopyPlus className="size-4" /> Vorwoche
              </Button>
            )}
          </div>

          {adding && (
            <Card className="mt-3 p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Zeile hinzufügen
              </p>
              <div className="flex flex-wrap gap-2">
                <Select className="w-56" aria-label="Projekt" value={neuesProjekt}
                        onChange={(e) => setNeuesProjekt(e.target.value)}>
                  <option value="" disabled>Projekt …</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  disabled={!neuesProjekt}
                  onClick={() => {
                    if (!neuesProjekt) return
                    setExtraRows((ids) => [...new Set([...ids, neuesProjekt])])
                    setNeuesProjekt('')
                    setAdding(false)
                  }}
                >
                  Hinzufügen
                </Button>
              </div>
            </Card>
          )}

          <Card className="mt-3">
            {isPending ? (
              <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
            ) : rows.length === 0 ? (
              <EmptyState
                title="Diese Woche ist noch leer"
                hint="Erfasse eine Zeit oder starte den Timer — am Laptop kannst du auch die Projekte der Vorwoche übernehmen."
                action={
                  <Button variant="primary" onClick={() => setQuickEntry({ open: true })}>
                    <Plus className="size-4" /> Zeit erfassen
                  </Button>
                }
              />
            ) : (
              <>
                {/* Raster braucht Breite und bleibt dem Laptop vorbehalten */}
                <div className="hidden sm:block">
                  <WeekGrid
                    monday={monday}
                    rows={rows}
                    entries={entries ?? []}
                    periods={periods ?? []}
                    budgets={budgetVon}
                    selected={zelle}
                    onSelect={setZelle}
                    onClose={() => setZelle(null)}
                    onQuickUpdate={(entry, minutes) =>
                      void run(() =>
                        save.mutateAsync({
                          id: entry.id,
                          values: {
                            project_id: entry.project_id,
                            activity_type_id: entry.activity_type_id,
                            work_package_id: entry.work_package_id,
                            work_date: entry.work_date,
                            duration_minutes: minutes,
                            description: entry.description,
                            is_billable: entry.is_billable,
                          },
                        }))
                    }
                  />
                </div>
                <div className="px-4 sm:hidden">
                  <DayList
                    monday={monday}
                    entries={entries ?? []}
                    budgets={budgetVon}
                    onAdd={(workDate) => setQuickEntry({ open: true, workDate })}
                    onEdit={(entry: TimeEntryFull) => {
                      const project = projects?.find((p) => p.id === entry.project_id)
                      if (!project) return
                      setDialog({ project, workDate: entry.work_date })
                    }}
                  />
                </div>
              </>
            )}
          </Card>

          {/* Nur breit: schmal gibt es kein Raster, dort fuehrt die Tagesliste
              in denselben Dialog. */}
          {rows.length > 0 && (
            <p className="mt-3 hidden px-1 text-sm text-ink-500 sm:block">
              In eine Zelle klicken — die Zeile klappt auf und zeigt die Einträge
              dieses Tages, nach Arbeitspaket gruppiert.
            </p>
          )}
        </>
      )}

      <EntryDialog target={dialog} entries={dialogEntries}
                   onClose={() => setDialog(null)} />

      <QuickEntryDialog
        open={quickEntry.open}
        workDate={quickEntry.workDate}
        projects={activeProjects}
        activityTypes={activityTypes ?? []}
        onClose={() => setQuickEntry({ open: false })}
      />
    </>
  )
}
