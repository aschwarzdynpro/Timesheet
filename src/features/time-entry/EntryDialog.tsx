import { useId, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Button, Dialog, ErrorNote, Input, Select, WarnNote,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import { formatDate } from '@/lib/format'
import { minutesToHours, parseDuration } from '@/lib/week'
import type { ActivityType, Project, TimeEntryFull } from '@/types/database'
import { standardArt, useActivityTypes } from '@/features/activity-types/api'
import { nachKuerzel, useAllWorkPackageBudgets, useWorkPackages } from '@/features/projects/api'
import { PackageBudget } from './PackageBudget'
import {
  useDeleteTimeEntry, useRateFor, useRecentDescriptions, useSaveTimeEntry,
} from './api'

/** Identitaet der Zelle: ein Projekt an einem Tag. */
export type EntryDialogTarget = {
  project: Project
  workDate: string
  /** Vorbelegte Dauer, wenn die Zelle direkt im Raster getippt wurde. */
  presetMinutes?: number
  /** Vorgewaehlte Taetigkeitsart eines gestoppten Timers. */
  presetActivity?: string | null
  /**
   * Die Periode dieses Tages ist gemeldet. Kommt aus dem Raster, weil nur dort
   * die Perioden vorliegen: eine leere Zelle in einer gemeldeten Woche hat
   * keine Eintraege, an deren Status man es ablesen koennte - ein Eingabefeld
   * haette dort etwas angeboten, das die Datenbank ablehnt.
   */
  locked?: boolean
}

/**
 * Der Schluessel setzt den Zustand zurueck, sobald eine andere Zelle an die
 * Reihe kommt - ohne Effekt, der beim Rendern nachtraeglich State setzt.
 * Die vorbelegte Dauer gehoert dazu: wer in eine schon gewaehlte Zelle eine
 * Zahl tippt, erwartet sie als neue Zeile wiederzufinden.
 */
export function entryEditorKey(t: EntryDialogTarget): string {
  return `${t.project.id}|${t.workDate}|${t.presetMinutes ?? ''}`
    + `|${t.presetActivity ?? ''}|${t.locked ? 'gesperrt' : ''}`
}

/**
 * Ein Tag eines Projekts: Eintraege stehen als Zeilen da und werden dort auch
 * bearbeitet.
 *
 * Auf dem Telefon steht das im Dialog, am Laptop in der aufgeklappten
 * Rasterzeile - der Inhalt ist derselbe, sonst haetten wir zwei Oberflaechen zu
 * pflegen und eine davon waere bald die schlechtere.
 */
export function EntryDialog(props: {
  target: EntryDialogTarget | null
  entries: TimeEntryFull[]
  onClose: () => void
}) {
  if (!props.target) return null
  const { target, entries, onClose } = props
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${target.project.name} · ${formatDate(target.workDate)}`}
      description="Dauer und Beschreibung stehen direkt in der Zeile — gespeichert wird beim Verlassen des Feldes."
    >
      <EntryEditor key={entryEditorKey(target)} target={target} entries={entries} />
      <div className="mt-3 flex justify-end border-t border-ink-100 pt-3">
        <Button type="button" onClick={onClose}>Schließen</Button>
      </div>
    </Dialog>
  )
}

/** Eine Zeile, die es noch nicht in der Datenbank gibt. */
type NeueZeile = {
  id: string; paket: string; art: string; dauer: string; text: string; abrechenbar: boolean
}

/** Was an einem vorhandenen Eintrag gerade abweichend im Feld steht. */
type Entwurf = { dauer?: string; text?: string }

const SPALTE = 'text-xs font-semibold tracking-wide text-ink-500 uppercase'

/**
 * Die Eintraege eines Projekttages als eine Tabelle.
 *
 * Vorher stand je Arbeitspaket ein eigener Block mit Kopf, Tabellenkopf und
 * eigener Schaltflaeche - gut 200 px fuer eine Zeile mit 2,00 h. Die Zahlen
 * dieses Repos sagen, dass das der falsche Zuschnitt war: 4,1 Eintraege am Tag
 * verteilen sich auf 3,4 Projekte, macht 1,2 je Projekt und Tag. Das
 * Arbeitspaket ist damit eine Eigenschaft der Zeile und keine Ueberschrift
 * ueber mehreren.
 */
export function EntryEditor({
  target, entries, speicherhinweis = true,
}: {
  target: EntryDialogTarget
  entries: TimeEntryFull[]
  /**
   * Der Satz "gespeichert wird beim Verlassen des Feldes" gehoert einmal auf
   * die Seite, nicht einmal je Projekt: in der Tagesansicht stehen mehrere
   * Editoren untereinander.
   */
  speicherhinweis?: boolean
}) {
  const { project, workDate } = target
  const save = useSaveTimeEntry()
  const remove = useDeleteTimeEntry()
  const confirm = useConfirm()
  const vorschlaegeId = useId()
  const { data: suggestions } = useRecentDescriptions(project.id)
  const { data: activityTypes } = useActivityTypes()
  const { data: workPackages } = useWorkPackages(project.id)
  // Derselbe Abfrageschluessel wie im Wochenraster: eine Abfrage, zwei Orte.
  const { data: budgets } = useAllWorkPackageBudgets()

  const [entwuerfe, setEntwuerfe] = useState<Record<string, Entwurf>>({})
  const [fehler, setFehler] = useState<string | null>(null)

  const pakete = useMemo(
    () => (workPackages ?? []).filter((w) => w.is_active).sort(nachKuerzel),
    [workPackages],
  )
  const arten = useMemo(
    () => (activityTypes ?? []).filter((a) => a.is_active),
    [activityTypes],
  )
  /**
   * Solange es nur eine aktive Taetigkeitsart gibt, ist die Spalte eine Spalte
   * mit immer demselben Wort. Sie erscheint wieder, sobald eine zweite Art
   * aktiv ist - dann ist sie eine Entscheidung.
   */
  const zeigeArt = arten.length > 1

  const [neue, setNeue] = useState<NeueZeile[]>(() =>
    target.presetMinutes
      ? [{ id: 'neu-1', paket: '', art: target.presetActivity ?? '',
           dauer: minutesToHours(target.presetMinutes), text: '',
           abrechenbar: project.is_billable }]
      : [])

  const locked = target.locked === true || entries.some((e) => e.status !== 'draft')

  // Nach Arbeitspaket sortiert: was zusammengehoert, steht beieinander - das
  // leistete vorher die Gruppierung. Innerhalb eines Pakets bleibt die
  // Reihenfolge des Anlegens, weil sort stabil ist und die Abfrage bereits
  // nach created_at sortiert.
  const zeilen = useMemo(
    () => [...entries].sort((a, b) =>
      (a.work_package_code ?? '').localeCompare(b.work_package_code ?? '', 'de', { numeric: true })),
    [entries],
  )

  /** Die Budgets der Pakete, auf die dieser Tag bucht. */
  const budgetZeilen = useMemo(() => {
    const ids = new Set<string>()
    for (const e of entries) if (e.work_package_id) ids.add(e.work_package_id)
    for (const z of neue) if (z.paket) ids.add(z.paket)
    return [...ids]
      .map((id) => ({
        id,
        code: entries.find((e) => e.work_package_id === id)?.work_package_code
          ?? pakete.find((w) => w.id === id)?.code ?? '',
        budget: (budgets ?? []).find((b) => b.work_package_id === id),
      }))
      .filter((z) => z.budget && (z.budget.budget_hours || z.budget.budget_amount))
      .sort((a, b) => a.code.localeCompare(b.code, 'de', { numeric: true }))
  }, [entries, neue, budgets, pakete])

  /** Die Taetigkeitsarten des Tages - je eine Pruefung auf einen Stundensatz. */
  const artenDesTages = useMemo(() => {
    const ids = new Set<string | null>()
    for (const e of entries) ids.add(e.activity_type_id)
    if (entries.length === 0) ids.add(target.presetActivity ?? standardArt(activityTypes) ?? null)
    return [...ids]
  }, [entries, target.presetActivity, activityTypes])

  async function fuehreAus(action: () => Promise<unknown>): Promise<boolean> {
    setFehler(null)
    try {
      await action()
      return true
    } catch (err) {
      setFehler(describeError(err))
      return false
    }
  }

  /* ------------------------------------------------ vorhandene Zeile aendern */

  function feld(e: TimeEntryFull, was: keyof Entwurf): string {
    const entwurf = entwuerfe[e.id]?.[was]
    if (entwurf !== undefined) return entwurf
    return was === 'dauer' ? minutesToHours(e.duration_minutes) : e.description
  }

  function setzeFeld(id: string, was: keyof Entwurf, wert: string) {
    setEntwuerfe((d) => ({ ...d, [id]: { ...d[id], [was]: wert } }))
  }

  function verwirf(id: string) {
    setEntwuerfe((d) => {
      const next = { ...d }
      delete next[id]
      return next
    })
  }

  const werteVon = (e: TimeEntryFull) => ({
    project_id: project.id,
    activity_type_id: e.activity_type_id,
    work_package_id: e.work_package_id,
    work_date: workDate,
    duration_minutes: e.duration_minutes,
    description: e.description,
    is_billable: e.is_billable,
  })

  /** Speichert beim Verlassen des Feldes, wie im Wochenraster auch. */
  async function sichere(e: TimeEntryFull) {
    if (!entwuerfe[e.id]) return

    const text = feld(e, 'text').trim()
    const minutes = parseDuration(feld(e, 'dauer'))

    if (minutes === null || minutes <= 0) {
      setFehler('Dauer nicht verstanden. Möglich sind etwa 1,5 · 1:30 · 90m.')
      return
    }
    if (minutes > 1440) {
      setFehler('Mehr als 24 Stunden an einem Tag sind nicht möglich.')
      return
    }
    if (!text) {
      setFehler('Ohne Beschreibung geht es nicht — sie ist die Position im Kundenreport.')
      return
    }
    if (minutes === e.duration_minutes && text === e.description) {
      verwirf(e.id)
      setFehler(null)
      return
    }

    const ok = await fuehreAus(() => save.mutateAsync({
      id: e.id, values: { ...werteVon(e), duration_minutes: minutes, description: text },
    }))
    if (ok) verwirf(e.id)
  }

  /** Auswahl und Haekchen speichern sofort - dort gibt es nichts zu tippen. */
  async function aendere(e: TimeEntryFull, teil: Partial<ReturnType<typeof werteVon>>) {
    await fuehreAus(() => save.mutateAsync({ id: e.id, values: { ...werteVon(e), ...teil } }))
  }

  async function loesche(e: TimeEntryFull) {
    if (!await confirm(loeschFrage('Zeiteintrag', e.description))) return
    await fuehreAus(() => remove.mutateAsync(e.id))
  }

  /* ------------------------------------------------------------- neue Zeile */

  function ergaenzeZeile() {
    const letzte = zeilen.at(-1)
    setNeue((n) => [...n, {
      id: `neu-${Date.now()}`,
      // Das Paket der letzten Zeile ist der wahrscheinlichere Nachbar als
      // keines; die Art faellt auf den Standard zurueck.
      paket: letzte?.work_package_id ?? '',
      art: letzte?.activity_type_id ?? standardArt(activityTypes),
      dauer: '', text: '', abrechenbar: project.is_billable,
    }])
  }

  function setzeNeu(id: string, teil: Partial<NeueZeile>) {
    setNeue((n) => n.map((z) => (z.id === id ? { ...z, ...teil } : z)))
  }

  /**
   * Eine neue Zeile wird gespeichert, sobald Dauer und Beschreibung stehen.
   * Unvollstaendig bleibt sie stehen, statt beim Wegklicken zu verschwinden -
   * getippter Text soll nicht verlorengehen.
   */
  async function sichereNeu(zeile: NeueZeile) {
    const aktuell = neue.find((z) => z.id === zeile.id) ?? zeile
    const minutes = parseDuration(aktuell.dauer)
    const text = aktuell.text.trim()
    if (minutes === null || minutes <= 0 || !text) return

    if (minutes > 1440) {
      setFehler('Mehr als 24 Stunden an einem Tag sind nicht möglich.')
      return
    }
    const ok = await fuehreAus(() => save.mutateAsync({
      values: {
        project_id: project.id,
        activity_type_id: aktuell.art || null,
        work_package_id: aktuell.paket || null,
        work_date: workDate,
        duration_minutes: minutes,
        description: text,
        is_billable: aktuell.abrechenbar,
      },
    }))
    if (ok) setNeue((n) => n.filter((z) => z.id !== zeile.id))
  }

  /* ---------------------------------------------------------------- Anzeige */

  if (locked) {
    return (
      <div className="space-y-2">
        <ul className="divide-y divide-ink-100 border-y border-ink-100">
          {zeilen.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-ink-500">
                {e.work_package_code ?? 'ohne Paket'}
              </span>
              <span className="tabular w-16 shrink-0 font-medium text-ink-800">
                {minutesToHours(e.duration_minutes)} h
              </span>
              <span className="min-w-0 flex-1 text-ink-600">{e.description}</span>
            </li>
          ))}
        </ul>
        <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">
          Dieser Tag gehört zu einer bereits gemeldeten Periode und ist gesperrt.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Was vom Budget der gebuchten Pakete offen ist - hier, wo gebucht wird,
          und nicht erst in den Stammdaten. */}
      {budgetZeilen.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {budgetZeilen.map((z) => (
            <span key={z.id} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-xs font-medium text-ink-500">{z.code}</span>
              <PackageBudget budget={z.budget} />
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-ink-200">
        <div className="hidden gap-2 border-b border-ink-200 bg-ink-50/60 px-3 py-1.5 sm:flex">
          {pakete.length > 0 && <span className={`${SPALTE} w-44 shrink-0`}>Arbeitspaket</span>}
          <span className={`${SPALTE} w-20 shrink-0`}>Dauer</span>
          <span className={`${SPALTE} min-w-0 flex-1`}>Beschreibung</span>
          {zeigeArt && <span className={`${SPALTE} w-36 shrink-0`}>Tätigkeitsart</span>}
          <span className={`${SPALTE} w-24 shrink-0 text-center`}>abrechenbar</span>
          <span className="w-9 shrink-0" />
        </div>

        <ul className="divide-y divide-ink-100">
          {zeilen.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              {pakete.length > 0 && (
                <span className="w-44 shrink-0">
                  <Select aria-label={`Arbeitspaket, ${e.description}`}
                          value={e.work_package_id ?? ''}
                          onChange={(ev) => void aendere(e, { work_package_id: ev.target.value || null })}>
                    <option value="">ohne Arbeitspaket</option>
                    {pakete.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
                    {/* Das eigene Paket bleibt waehlbar, auch wenn es inaktiv
                        wurde - sonst spraenge die Zeile beim ersten Speichern
                        auf ein anderes. */}
                    {e.work_package_id && !pakete.some((w) => w.id === e.work_package_id) && (
                      <option value={e.work_package_id}>{e.work_package_code}</option>
                    )}
                  </Select>
                </span>
              )}
              <span className="w-20 shrink-0">
                <Input aria-label={`Dauer, ${e.description}`} inputMode="decimal"
                       className="tabular text-right" value={feld(e, 'dauer')}
                       onChange={(ev) => setzeFeld(e.id, 'dauer', ev.target.value)}
                       onBlur={() => void sichere(e)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }} />
              </span>
              <span className="min-w-[10rem] flex-1">
                <Input aria-label={`Beschreibung, ${minutesToHours(e.duration_minutes)} h`}
                       list={vorschlaegeId} value={feld(e, 'text')}
                       onChange={(ev) => setzeFeld(e.id, 'text', ev.target.value)}
                       onBlur={() => void sichere(e)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }} />
              </span>
              {zeigeArt && (
                <span className="w-36 shrink-0">
                  <Select aria-label={`Tätigkeitsart, ${e.description}`}
                          value={e.activity_type_id ?? ''}
                          onChange={(ev) => void aendere(e, { activity_type_id: ev.target.value || null })}>
                    <option value="">ohne Tätigkeitsart</option>
                    {arten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    {e.activity_type_id && !arten.some((a) => a.id === e.activity_type_id) && (
                      <option value={e.activity_type_id}>{e.activity_name}</option>
                    )}
                  </Select>
                </span>
              )}
              <label className="flex shrink-0 items-center gap-1.5 sm:w-24 sm:justify-center">
                <input type="checkbox" checked={e.is_billable} disabled={!project.is_billable}
                       aria-label={`abrechenbar, ${e.description}`}
                       onChange={(ev) => void aendere(e, { is_billable: ev.target.checked })}
                       className="size-4 rounded border-ink-300" />
                {/* Schmal faellt die Spaltenueberschrift weg - dann stuende das
                    Haekchen ohne ein Wort dazu da. */}
                <span className="text-xs text-ink-500 sm:hidden">abrechenbar</span>
              </label>
              <Button size="sm" variant="ghost" aria-label={`Löschen, ${e.description}`}
                      className="w-9 shrink-0 px-0" onClick={() => void loesche(e)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}

          {neue.map((z, i) => (
            <li key={z.id} className="flex flex-wrap items-center gap-2 bg-accent-50/40 px-3 py-1.5">
              {pakete.length > 0 && (
                <span className="w-44 shrink-0">
                  <Select aria-label="Arbeitspaket, neue Zeile" value={z.paket}
                          onChange={(ev) => setzeNeu(z.id, { paket: ev.target.value })}>
                    <option value="">ohne Arbeitspaket</option>
                    {pakete.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
                  </Select>
                </span>
              )}
              <span className="w-20 shrink-0">
                <Input aria-label="Dauer, neue Zeile" inputMode="decimal" placeholder="1,5"
                       className="tabular text-right" value={z.dauer}
                       autoFocus={i === neue.length - 1 && !target.presetMinutes}
                       onChange={(ev) => setzeNeu(z.id, { dauer: ev.target.value })}
                       onBlur={() => void sichereNeu(z)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }} />
              </span>
              <span className="min-w-[10rem] flex-1">
                <Input aria-label="Beschreibung, neue Zeile" list={vorschlaegeId}
                       placeholder="Was wurde gemacht?" value={z.text}
                       autoFocus={Boolean(target.presetMinutes) && i === 0}
                       onChange={(ev) => setzeNeu(z.id, { text: ev.target.value })}
                       onBlur={() => void sichereNeu(z)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }} />
              </span>
              {zeigeArt && (
                <span className="w-36 shrink-0">
                  <Select aria-label="Tätigkeitsart, neue Zeile" value={z.art}
                          onChange={(ev) => setzeNeu(z.id, { art: ev.target.value })}>
                    <option value="">ohne Tätigkeitsart</option>
                    {arten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </span>
              )}
              <label className="flex shrink-0 items-center gap-1.5 sm:w-24 sm:justify-center">
                <input type="checkbox" checked={z.abrechenbar} disabled={!project.is_billable}
                       aria-label="abrechenbar, neue Zeile"
                       onChange={(ev) => setzeNeu(z.id, { abrechenbar: ev.target.checked })}
                       className="size-4 rounded border-ink-300" />
                <span className="text-xs text-ink-500 sm:hidden">abrechenbar</span>
              </label>
              <Button size="sm" variant="ghost" aria-label="Neue Zeile verwerfen"
                      className="w-9 shrink-0 px-0"
                      onClick={() => setNeue((n) => n.filter((x) => x.id !== z.id))}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>

        {zeilen.length === 0 && neue.length === 0 && (
          <p className="px-3 py-3 text-sm text-ink-500">
            Noch nichts erfasst — „Zeile hinzufügen" legt den ersten Eintrag an.
          </p>
        )}
      </div>

      {/* Die Vorschlaege haengen an der Beschreibung selbst: fuer einen eigenen
          Streifen mit Schaltflaechen ist in einer Zeile kein Platz. */}
      <datalist id={vorschlaegeId}>
        {(suggestions ?? []).map((text) => <option key={text} value={text} />)}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" onClick={ergaenzeZeile}>
          <Plus className="size-4" /> Zeile hinzufügen
        </Button>
        {speicherhinweis && (
          <span className="text-xs text-ink-500">
            Gespeichert wird beim Verlassen des Feldes.
          </span>
        )}
      </div>

      {artenDesTages.map((artId) => (
        <SatzHinweis key={artId ?? 'ohne'} project={project} workDate={workDate}
                     activityId={artId} arten={arten} />
      ))}

      <ErrorNote message={fehler} />
    </div>
  )
}

/**
 * Hinweis auf den fehlenden Stundensatz - je Taetigkeitsart des Tages einmal.
 *
 * Eigene Komponente, weil `useRateFor` an der Taetigkeitsart haengt und sich
 * nicht in einer Schleife aufrufen laesst.
 */
function SatzHinweis({
  project, workDate, activityId, arten,
}: {
  project: Project
  workDate: string
  activityId: string | null
  arten: ActivityType[]
}) {
  const { data: satz, isPending } = useRateFor(project.id, activityId, workDate)
  if (isPending || satz !== null || !project.is_billable) return null

  const name = arten.find((a) => a.id === activityId)?.name
  return (
    <WarnNote>
      Für dieses Projekt gibt es {name ? `mit „${name}" ` : 'ohne Tätigkeitsart '}
      keinen Stundensatz zum {formatDate(workDate)}. Die Zeit wird gespeichert, aber mit
      0,00 € bewertet.
    </WarnNote>
  )
}
