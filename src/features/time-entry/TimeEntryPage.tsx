import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, CopyPlus, Plus } from 'lucide-react'
import {
  Button, Card, EmptyState, ErrorNote, Select, WarnNote,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatDate, formatEuro } from '@/lib/format'
import { addDays, isoWeek, minutesToHours, mondayOf, toIsoDate } from '@/lib/week'
import type { TimeEntryFull, WorkPackage } from '@/types/database'
import { useCustomers } from '@/features/customers/api'
import { useAllWorkPackages, useProjects } from '@/features/projects/api'
import { useActivityTypes } from '@/features/activity-types/api'
import { EntryDialog, type EntryDialogTarget } from './EntryDialog'
import { CellPanel } from './CellPanel'
import { WeekGrid, cellKey, rowKey, type GridRow } from './WeekGrid'
import { DayList } from './DayList'
import { Timer } from './Timer'
import { QuickEntryDialog } from './QuickEntryDialog'
import { useSaveTimeEntry, useWeekEntries, useWeekPeriods } from './api'

export function TimeEntryPage() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [extraRows, setExtraRows] = useState<string[]>([])
  const [dialog, setDialog] = useState<EntryDialogTarget | null>(null)
  // Die gewaehlte Rasterzelle. Getrennt vom Dialog: breit steht ihr Inhalt als
  // Tafel unter dem Raster, schmal gibt es das Raster gar nicht.
  const [zelle, setZelle] = useState<EntryDialogTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [quickEntry, setQuickEntry] = useState<{ open: boolean; workDate?: string }>({
    open: false,
  })

  const { data: projects } = useProjects()
  const { data: workPackages } = useAllWorkPackages()
  const { data: activityTypes } = useActivityTypes()
  const { data: customers } = useCustomers()
  const { data: entries, isPending, error: loadError } = useWeekEntries(monday)
  const { data: periods, error: periodError } = useWeekPeriods(monday)
  const previousWeek = useWeekEntries(addDays(monday, -7))
  const save = useSaveTimeEntry()

  /** Ein Wochenwechsel nimmt die Auswahl mit - sonst zeigte die Tafel einen
      Tag, der gar nicht mehr im Raster steht. */
  function zeigeWoche(next: (m: Date) => Date) {
    setMonday((m) => next(m))
    setZelle(null)
  }

  const { year, week } = isoWeek(monday)
  const sunday = addDays(monday, 6)

  // Auswahl fuer "Zeile hinzufuegen". Als Zustand statt per querySelector: das
  // Arbeitspaket haengt am gewaehlten Projekt und muss darauf reagieren.
  const [neueZeile, setNeueZeile] = useState({ projekt: '', art: '', paket: '' })

  const paketeDesProjekts = useMemo(
    () => (workPackages ?? []).filter((w) => w.project_id === neueZeile.projekt && w.is_active),
    [workPackages, neueZeile.projekt],
  )

  const paketVon = useMemo(() => {
    const map = new Map<string, WorkPackage>()
    for (const w of workPackages ?? []) map.set(w.id, w)
    return map
  }, [workPackages])

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => p.status === 'active'),
    [projects],
  )

  /** Zeilen: alles was diese Woche erfasst wurde, plus manuell ergaenzte. */
  const rows: GridRow[] = useMemo(() => {
    const map = new Map<string, GridRow>()
    const add = (projectId: string, activityId: string | null, packageId: string | null) => {
      const project = projects?.find((p) => p.id === projectId)
      if (!project) return
      const key = rowKey(projectId, activityId, packageId)
      if (map.has(key)) return
      map.set(key, {
        key,
        project,
        activity: activityTypes?.find((a) => a.id === activityId) ?? null,
        workPackage: packageId ? (paketVon.get(packageId) ?? null) : null,
      })
    }
    for (const e of entries ?? []) add(e.project_id, e.activity_type_id, e.work_package_id)
    for (const key of extraRows) {
      const [projectId, activityId, packageId] = key.split('|')
      add(projectId!, activityId || null, packageId || null)
    }
    // Nach Projekt, dann Arbeitspaket, dann Taetigkeitsart - so stehen die
    // Zeilen eines Projekts beieinander.
    const sortierbar = (r: GridRow) =>
      `${r.project.name}|${r.workPackage?.code ?? ''}|${r.activity?.name ?? ''}`
    return [...map.values()].sort((a, b) => sortierbar(a).localeCompare(sortierbar(b), 'de'))
  }, [entries, extraRows, projects, activityTypes, paketVon])

  // Die Eintraege des offenen Dialogs werden bei jedem Rendern neu bestimmt.
  // Als Momentaufnahme im Dialog wuerde die Liste nach dem Hinzufuegen veralten.
  const dialogEntries = useMemo(() => {
    if (!dialog) return []
    return (entries ?? []).filter(
      (e) => e.project_id === dialog.project.id &&
             e.activity_type_id === (dialog.activity?.id ?? null) &&
             e.work_package_id === (dialog.workPackage?.id ?? null) &&
             e.work_date === dialog.workDate)
  }, [dialog, entries])

  const zellEntries = useMemo(() => {
    if (!zelle) return []
    return (entries ?? []).filter(
      (e) => e.project_id === zelle.project.id &&
             e.activity_type_id === (zelle.activity?.id ?? null) &&
             e.work_package_id === (zelle.workPackage?.id ?? null) &&
             e.work_date === zelle.workDate)
  }, [zelle, entries])

  const totals = useMemo(() => {
    const list = entries ?? []
    return {
      tracked: list.reduce((n, e) => n + e.duration_minutes, 0),
      billable: list.reduce((n, e) => n + e.billable_minutes, 0),
      fees: list.reduce((n, e) => n + Number(e.amount ?? 0), 0),
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
    const keys = new Set(extraRows)
    for (const e of previousWeek.data ?? [])
      keys.add(rowKey(e.project_id, e.activity_type_id, e.work_package_id))
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
                setDialog({
                  project,
                  activity: activityTypes?.find((a) => a.id === activityTypeId) ?? null,
                  workPackage: null,
                  workDate,
                  presetMinutes: minutes,
                })
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
                <Select className="w-56" aria-label="Projekt" value={neueZeile.projekt}
                        onChange={(e) => setNeueZeile({ projekt: e.target.value, art: neueZeile.art, paket: '' })}>
                  <option value="" disabled>Projekt …</option>
                  {activeProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                {/* Nur die Pakete des gewaehlten Projekts stehen zur Wahl. */}
                {paketeDesProjekts.length > 0 && (
                  <Select className="w-44" aria-label="Arbeitspaket" value={neueZeile.paket}
                          onChange={(e) => setNeueZeile({ ...neueZeile, paket: e.target.value })}>
                    <option value="">ohne Arbeitspaket</option>
                    {paketeDesProjekts.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
                    ))}
                  </Select>
                )}
                <Select className="w-44" aria-label="Tätigkeitsart" value={neueZeile.art}
                        onChange={(e) => setNeueZeile({ ...neueZeile, art: e.target.value })}>
                  <option value="">ohne Tätigkeitsart</option>
                  {(activityTypes ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  disabled={!neueZeile.projekt}
                  onClick={() => {
                    const { projekt, art, paket } = neueZeile
                    if (!projekt) return
                    setExtraRows((rows) =>
                      [...new Set([...rows, rowKey(projekt, art || null, paket || null)])])
                    setNeueZeile({ projekt: '', art: '', paket: '' })
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
                    selected={zelle
                      ? cellKey(rowKey(zelle.project.id, zelle.activity?.id ?? null,
                                       zelle.workPackage?.id ?? null), zelle.workDate)
                      : null}
                    onSelect={setZelle}
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
                    onAdd={(workDate) => setQuickEntry({ open: true, workDate })}
                    onEdit={(entry: TimeEntryFull) => {
                      const project = projects?.find((p) => p.id === entry.project_id)
                      if (!project) return
                      setDialog({
                        project,
                        activity: activityTypes?.find((a) => a.id === entry.activity_type_id) ?? null,
                        workPackage: entry.work_package_id
                          ? (paketVon.get(entry.work_package_id) ?? null) : null,
                        workDate: entry.work_date,
                      })
                    }}
                  />
                </div>
              </>
            )}
          </Card>

          {/* Nur breit: schmal gibt es kein Raster, dort fuehrt die Tagesliste
              in denselben Dialog. */}
          <div className="hidden sm:block">
            {zelle ? (
              <CellPanel target={zelle} entries={zellEntries}
                         onClose={() => setZelle(null)} onRetarget={setZelle} />
            ) : rows.length > 0 && (
              <p className="mt-3 px-1 text-sm text-ink-500">
                In eine Zelle klicken, um die Einträge dieses Tages zu sehen und zu bearbeiten.
              </p>
            )}
          </div>
        </>
      )}

      <EntryDialog target={dialog} entries={dialogEntries}
                   onClose={() => setDialog(null)} onRetarget={setDialog} />

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
