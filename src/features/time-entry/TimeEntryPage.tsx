import { useMemo, useState } from 'react'
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
  const [extraRows, setExtraRows] = useState<string[]>([])
  const [dialog, setDialog] = useState<EntryDialogTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [quickEntry, setQuickEntry] = useState<{ open: boolean; workDate?: string }>({
    open: false,
  })

  const { data: projects } = useProjects()
  const { data: activityTypes } = useActivityTypes()
  const { data: customers } = useCustomers()
  const { data: entries, isPending } = useWeekEntries(monday)
  const { data: periods } = useWeekPeriods(monday)
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
        </dl>
      </div>

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
                setDialog({
                  project,
                  activity: activityTypes?.find((a) => a.id === activityTypeId) ?? null,
                  workDate,
                  presetMinutes: minutes,
                })
              }}
            />
            <Button onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> Zeile
            </Button>
            {(previousWeek.data?.length ?? 0) > 0 && (
              <Button onClick={copyPreviousWeek} title="Projektzeilen der Vorwoche übernehmen, ohne Stunden">
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
                <div className="hidden sm:block">
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
                <div className="px-4 sm:hidden">
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
