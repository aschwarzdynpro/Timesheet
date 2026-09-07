import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, CopyPlus, Plus } from 'lucide-react'
import {
  Button, Card, EmptyState, ErrorNote, Select,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatDate, formatEuro } from '@/lib/format'
import { addDays, isoWeek, minutesToHours, mondayOf, toIsoDate } from '@/lib/week'
import type { TimeEntryFull } from '@/types/database'
import { useCustomers } from '@/features/customers/api'
import { useProjects } from '@/features/projects/api'
import { useActivityTypes } from '@/features/activity-types/api'
import { EntryDialog, type EntryDialogTarget } from './EntryDialog'
import { WeekGrid, rowKey, type GridRow } from './WeekGrid'
import { DayList } from './DayList'
import { Timer } from './Timer'
import { QuickEntryDialog } from './QuickEntryDialog'
import { useSaveTimeEntry, useWeekEntries, useWeekPeriods } from './api'

export function TimeEntryPage() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [view, setView] = useState<'week' | 'list'>('week')
  const [extraRows, setExtraRows] = useState<string[]>([])
  const [dialog, setDialog] = useState<EntryDialogTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [quickEntry, setQuickEntry] = useState<{ open: boolean; workDate?: string }>({
    open: false,
  })

  const { data: projects, isPending: projectsPending, error: projectsError } = useProjects()
  const { data: activityTypes } = useActivityTypes()
  const { data: customers, isPending: customersPending, error: customersError } = useCustomers()
  const { data: entries, isPending, error: loadError } = useWeekEntries(monday)
  const { data: periods, error: periodError } = useWeekPeriods(monday)
  const previousWeek = useWeekEntries(addDays(monday, -7))
  const save = useSaveTimeEntry()

  const { year, week } = isoWeek(monday)
  const sunday = addDays(monday, 6)

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => p.status === 'active'),
    [projects],
  )

  /** Zeilen: alles was diese Woche erfasst wurde, plus manuell ergaenzte. */
  const rows: GridRow[] = useMemo(() => {
    const map = new Map<string, GridRow>()
    const add = (projectId: string, activityId: string | null) => {
      const project = projects?.find((p) => p.id === projectId)
      if (!project) return
      const key = rowKey(projectId, activityId)
      if (map.has(key)) return
      map.set(key, {
        key,
        project,
        activity: activityTypes?.find((a) => a.id === activityId) ?? null,
      })
    }
    for (const e of entries ?? []) add(e.project_id, e.activity_type_id)
    for (const key of extraRows) {
      const [projectId, activityId] = key.split('|')
      add(projectId!, activityId || null)
    }
    return [...map.values()].sort((a, b) =>
      `${a.project.name}${a.activity?.name ?? ''}`.localeCompare(
        `${b.project.name}${b.activity?.name ?? ''}`, 'de'))
  }, [entries, extraRows, projects, activityTypes])

  // Die Eintraege des offenen Dialogs werden bei jedem Rendern neu bestimmt.
  // Als Momentaufnahme im Dialog wuerde die Liste nach dem Hinzufuegen veralten.
  const dialogEntries = useMemo(() => {
    if (!dialog) return []
    return (entries ?? []).filter(
      (e) => e.project_id === dialog.project.id &&
             e.activity_type_id === (dialog.activity?.id ?? null) &&
             e.work_date === dialog.workDate)
  }, [dialog, entries])

  const totals = useMemo(() => {
    const list = entries ?? []
    return {
      tracked: list.reduce((n, e) => n + e.duration_minutes, 0),
      billable: list.reduce((n, e) => n + e.billable_minutes, 0),
      fees: list.reduce((n, e) => n + Number(e.amount ?? 0), 0),
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
    const keys = new Set(extraRows)
    for (const e of previousWeek.data ?? []) keys.add(rowKey(e.project_id, e.activity_type_id))
    setExtraRows([...keys])
    setNotice('Projektzeilen übernommen. Die Stunden bleiben leer.')
  }

  const needsSetup = (customers?.length ?? 0) === 0 || activeProjects.length === 0

  return (
    <>
      <PageHeader
        title="Deine Zeit. Im Überblick."
        subtitle="Zeiten erfassen, Projekte im Blick behalten und die Woche abschließen."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={activeProjects.length === 0}
                    onClick={() => setQuickEntry({ open: true })}>
              <Plus className="size-4" /> Erfassen
            </Button>
            <Button aria-label="Vorherige Woche"
                    onClick={() => setMonday((m) => addDays(m, -7))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button onClick={() => setMonday(mondayOf(new Date()))}>
              <CalendarDays className="size-4" /> Heute
            </Button>
            <Button aria-label="Nächste Woche"
                    onClick={() => setMonday((m) => addDays(m, 7))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      <dl className="week-summary" aria-label="Summen der ausgewählten Woche">
        <div className="week-stat"><dt>Erfasste Zeit</dt><dd className="tabular">{isPending || loadError ? '–' : `${minutesToHours(totals.tracked)} h`}</dd></div>
        <div className="week-stat"><dt>Abrechenbar</dt><dd className="tabular">{isPending || loadError ? '–' : `${minutesToHours(totals.billable)} h`}</dd></div>
        <div className="week-stat"><dt>Honorar</dt><dd className="tabular">{isPending || loadError ? '–' : formatEuro(totals.fees)}</dd></div>
      </dl>
      <div className="week-toolbar">
        <div><p className="text-lg font-semibold">Kalenderwoche {week} <span className="font-normal text-ink-500">/ {year}</span></p>
          <p className="tabular mt-1 text-sm text-ink-500">{formatDate(toIsoDate(monday))} – {formatDate(toIsoDate(sunday))}</p></div>
        <div className="view-switch hidden sm:flex" role="group" aria-label="Ansicht wählen">
          <button aria-pressed={view === 'week'} onClick={() => setView('week')}>Wochenraster</button>
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>Tagesliste</button>
        </div>
      </div>

      {/* Eine fehlgeschlagene Abfrage sah bisher aus wie eine leere Woche.
          Genau so blieben gespeicherte Zeiten unbemerkt unsichtbar. */}
      {(loadError ?? periodError) && (
        <div className="mt-4">
          <ErrorNote message={`Die Woche konnte nicht geladen werden: ${describeError(loadError ?? periodError)}`} />
        </div>
      )}
      {notice && <p role="status" className="mt-4 rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-700">{notice}</p>}
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}

      {projectsPending || customersPending ? (
        <Card className="mt-4 p-6"><p role="status" className="text-sm text-ink-500">Dein Arbeitsplatz wird geladen …</p></Card>
      ) : projectsError || customersError ? (
        <div className="mt-4"><ErrorNote message={describeError(projectsError ?? customersError)} /></div>
      ) : needsSetup ? (
        <Card className="mt-4">
          <EmptyState
            title="Bereit für dein erstes Projekt?"
            hint="Lege einen Kunden und ein aktives Projekt an. Danach kannst du direkt deine erste Zeit erfassen."
            action={<Link to={(customers?.length ?? 0) === 0 ? '/kunden' : '/projekte'} className="inline-flex rounded-xl bg-accent-500 px-5 py-3 text-sm font-medium text-white">{(customers?.length ?? 0) === 0 ? 'Kunden anlegen' : 'Projekt anlegen'}</Link>}
          />
        </Card>
      ) : (
        <>
          <div className="timer-workspace flex flex-wrap items-center gap-3">
            <Timer
              projects={activeProjects}
              activityTypes={activityTypes ?? []}
              onStop={({ projectId, activityTypeId, minutes, workDate }) => {
                const project = activeProjects.find((p) => p.id === projectId)
                if (!project) return
                setDialog({
                  project,
                  activity: activityTypes?.find((a) => a.id === activityTypeId) ?? null,
                  workDate,
                  presetMinutes: minutes,
                })
              }}
            />
            <Button onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> Projektzeile
            </Button>
            {(previousWeek.data?.length ?? 0) > 0 && (
              <Button onClick={copyPreviousWeek} title="Projektzeilen der Vorwoche übernehmen, ohne Stunden">
                <CopyPlus className="size-4" /> Projekte aus Vorwoche
              </Button>
            )}
          </div>

          {adding && (
            <Card className="mt-3 p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                Zeile hinzufügen
              </p>
              <div className="flex flex-wrap gap-2">
                <Select id="neue-zeile-projekt" className="w-56" defaultValue="" aria-label="Projekt">
                  <option value="" disabled>Projekt …</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <Select id="neue-zeile-art" className="w-44" defaultValue="" aria-label="Tätigkeitsart">
                  <option value="">ohne Tätigkeitsart</option>
                  {(activityTypes ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  onClick={() => {
                    const p = document.querySelector<HTMLSelectElement>('#neue-zeile-projekt')?.value
                    const a = document.querySelector<HTMLSelectElement>('#neue-zeile-art')?.value ?? ''
                    if (!p) return
                    setExtraRows((rows) => [...new Set([...rows, rowKey(p, a || null)])])
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
                hint="Erfasse eine Zeit, füge eine Rasterzeile hinzu oder übernimm die Projekte der Vorwoche."
                action={
                  <Button variant="primary" onClick={() => setQuickEntry({ open: true })}>
                    <Plus className="size-4" /> Zeit erfassen
                  </Button>
                }
              />
            ) : (
              <>
                {/* Raster braucht Breite und bleibt dem Laptop vorbehalten */}
                <div className={view === 'week' ? 'hidden sm:block' : 'hidden'}>
                  <WeekGrid
                    monday={monday}
                    rows={rows}
                    entries={entries ?? []}
                    periods={periods ?? []}
                    onOpen={setDialog}
                    onQuickUpdate={(entry, minutes) =>
                      void run(() =>
                        save.mutateAsync({
                          id: entry.id,
                          values: {
                            project_id: entry.project_id,
                            activity_type_id: entry.activity_type_id,
                            work_date: entry.work_date,
                            duration_minutes: minutes,
                            description: entry.description,
                            is_billable: entry.is_billable,
                          },
                        }))
                    }
                  />
                </div>
                <div className={view === 'list' ? 'px-4' : 'px-4 sm:hidden'}>
                  <DayList
                    monday={monday}
                    entries={entries ?? []}
                    onAdd={(workDate) => setQuickEntry({ open: true, workDate })}
                    onEdit={(entry: TimeEntryFull) => {
                      const project = projects?.find((p) => p.id === entry.project_id)
                      if (!project) return
                      setDialog({
                        project,
                        activity: activityTypes?.find((a) => a.id === entry.activity_type_id) ?? null,
                        workDate: entry.work_date,
                      })
                    }}
                  />
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <EntryDialog target={dialog} entries={dialogEntries} onClose={() => setDialog(null)} />

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
