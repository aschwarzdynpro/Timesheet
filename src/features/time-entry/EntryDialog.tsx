import { useId, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Button, Dialog, ErrorNote, Input, Select, WarnNote,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import { formatDate } from '@/lib/format'
import { minutesToHours, parseDuration } from '@/lib/week'
import type {
  ActivityType, Project, TimeEntryFull, WorkPackage, WorkPackageBudget,
} from '@/types/database'
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
  /**
   * Vorgewaehlte Taetigkeitsart eines gestoppten Timers. Nur dann gesetzt - und
   * dann entsteht immer ein neuer Eintrag, auch wenn der Tag schon eine Gruppe
   * hat: die Art am Timer war eine Entscheidung und darf nicht stillschweigend
   * durch die einer vorhandenen Gruppe ersetzt werden.
   */
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
 * Auf dem Telefon steht das im Dialog, am Laptop unter dem Wochenraster - der
 * Inhalt ist derselbe, sonst haetten wir zwei Oberflaechen zu pflegen und eine
 * davon waere bald die schlechtere.
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

/* ------------------------------------------------------------------ Gruppen */

/**
 * Eine Gruppe ist alles, was an diesem Tag auf dasselbe Arbeitspaket und
 * dieselbe Taetigkeitsart gebucht ist.
 *
 * Das Raster fuehrt je Projekt nur noch eine Zeile - die Aufteilung steht hier,
 * wo Platz dafuer ist. Vorher stand jede Kombination als eigene Rasterzeile da,
 * und ein Projekt mit vier Paketen belegte vier Zeilen mit je einer Zahl darin.
 */
type Gruppe = {
  key: string
  packageId: string | null
  activityId: string | null
  entries: TimeEntryFull[]
}

const gruppenKey = (packageId: string | null, activityId: string | null) =>
  `${packageId ?? ''}|${activityId ?? ''}`

function gruppiere(entries: TimeEntryFull[]): Gruppe[] {
  const map = new Map<string, Gruppe>()
  for (const e of entries) {
    const key = gruppenKey(e.work_package_id, e.activity_type_id)
    const vorhanden = map.get(key)
    if (vorhanden) vorhanden.entries.push(e)
    else map.set(key, { key, packageId: e.work_package_id,
                        activityId: e.activity_type_id, entries: [e] })
  }
  // Nach Arbeitspaket, dann Taetigkeitsart - dieselbe Ordnung, in der die
  // Auswahllisten die Pakete zeigen.
  const sortierbar = (g: Gruppe) => {
    const erster = g.entries[0]!
    return `${erster.work_package_code ?? ''}|${erster.activity_name ?? ''}`
  }
  return [...map.values()].sort((a, b) => sortierbar(a).localeCompare(sortierbar(b), 'de',
                                                                      { numeric: true }))
}

/** Eine Zeile, die es noch nicht in der Datenbank gibt. */
type NeueZeile = { id: string; dauer: string; text: string; abrechenbar: boolean }

/** Ein Eintrag auf einem Paket, das an diesem Tag noch nicht gebucht ist. */
type NeuerEintrag = NeueZeile & { paket: string; art: string }

/** Was an einem vorhandenen Eintrag gerade abweichend im Feld steht. */
type Entwurf = { dauer?: string; text?: string }

const LABEL = 'mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase'
const SPALTE = 'text-xs font-semibold tracking-wide text-ink-500 uppercase'

/* ------------------------------------------------------------------ Editor */

export function EntryEditor({
  target, entries,
}: { target: EntryDialogTarget; entries: TimeEntryFull[] }) {
  const { project, workDate } = target
  const vorschlaegeId = useId()
  const { data: suggestions } = useRecentDescriptions(project.id)
  const { data: activityTypes } = useActivityTypes()
  const { data: workPackages } = useWorkPackages(project.id)
  // Derselbe Abfrageschluessel wie im Wochenraster: eine Abfrage, zwei Orte.
  const { data: budgets } = useAllWorkPackageBudgets()

  const gruppen = useMemo(() => gruppiere(entries), [entries])
  const locked = target.locked === true || entries.some((e) => e.status !== 'draft')

  /**
   * Eine getippte Dauer landet in der einzigen Gruppe des Tages - so wie
   * bisher, als die Zelle selbst die Gruppe war. Gibt es mehrere oder keine,
   * waere jede Wahl geraten: dann oeffnet sich ein neuer Eintrag, in dem
   * Arbeitspaket und Art dabeistehen.
   */
  const eigenerEintrag = target.presetActivity !== undefined || gruppen.length !== 1
  const [neueEintraege, setNeueEintraege] = useState<NeuerEintrag[]>(() =>
    target.presetMinutes && eigenerEintrag
      ? [{ id: 'neu-1', dauer: minutesToHours(target.presetMinutes), text: '',
           abrechenbar: project.is_billable, paket: '',
           art: target.presetActivity ?? standardArt(activityTypes) }]
      : [])
  const [fehler, setFehler] = useState<string | null>(null)

  const waehlbarePakete = (workPackages ?? []).filter((w) => w.is_active).sort(nachKuerzel)
  const waehlbareArten = (activityTypes ?? []).filter((a) => a.is_active)

  const budgetVon = (packageId: string | null) =>
    packageId ? (budgets ?? []).find((b) => b.work_package_id === packageId) : undefined

  function ergaenzeEintrag() {
    setNeueEintraege((n) => [...n, {
      id: `neu-${Date.now()}`, dauer: '', text: '', abrechenbar: project.is_billable,
      // Das Paket der letzten Gruppe ist der wahrscheinlichere Nachbar als gar
      // keines; die Art faellt auf den Standard zurueck.
      paket: gruppen.at(-1)?.packageId ?? '',
      art: gruppen.at(-1)?.activityId ?? standardArt(activityTypes),
    }])
  }

  if (locked) {
    return (
      <div className="space-y-3">
        {gruppen.map((g) => (
          <div key={g.key}>
            <GruppenKopf gruppe={g} />
            <ul className="divide-y divide-ink-100 border-y border-ink-100">
              {g.entries.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className="tabular w-16 shrink-0 font-medium text-ink-800">
                    {minutesToHours(e.duration_minutes)} h
                  </span>
                  <span className="min-w-0 flex-1 text-ink-600">{e.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">
          Dieser Tag gehört zu einer bereits gemeldeten Periode und ist gesperrt.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {gruppen.map((g) => (
        <GruppenBlock
          key={g.key}
          gruppe={g}
          project={project}
          workDate={workDate}
          pakete={waehlbarePakete}
          arten={waehlbareArten}
          budget={budgetVon(g.packageId)}
          vorschlaegeId={vorschlaegeId}
          presetMinutes={eigenerEintrag ? undefined : target.presetMinutes}
        />
      ))}

      {neueEintraege.map((z) => (
        <NeuerEintragBlock
          key={z.id}
          zeile={z}
          project={project}
          workDate={workDate}
          pakete={waehlbarePakete}
          arten={waehlbareArten}
          budget={budgetVon(z.paket || null)}
          vorschlaegeId={vorschlaegeId}
          onAendern={(teil) =>
            setNeueEintraege((n) => n.map((x) => (x.id === z.id ? { ...x, ...teil } : x)))}
          onVerwerfen={() => setNeueEintraege((n) => n.filter((x) => x.id !== z.id))}
          onFehler={setFehler}
        />
      ))}

      {gruppen.length === 0 && neueEintraege.length === 0 && (
        <p className="rounded-md border border-ink-200 px-3 py-4 text-sm text-ink-500">
          Noch nichts erfasst — „Eintrag hinzufügen" legt den ersten an.
        </p>
      )}

      {/* Die Vorschlaege haengen an der Beschreibung selbst: fuer einen eigenen
          Streifen mit Schaltflaechen ist in einer Zeile kein Platz. */}
      <datalist id={vorschlaegeId}>
        {(suggestions ?? []).map((text) => <option key={text} value={text} />)}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* "Zeile" steht in jedem Block und meint dessen Paket; hier geht es um
            einen Eintrag auf einem anderen. */}
        <Button size="sm" onClick={ergaenzeEintrag}>
          <Plus className="size-4" /> Eintrag hinzufügen
        </Button>
        <span className="text-xs text-ink-500">
          Gespeichert wird beim Verlassen des Feldes.
        </span>
      </div>

      <ErrorNote message={fehler} />
    </div>
  )
}

/* ------------------------------------------------------------ Gruppenkopf */

function GruppenKopf({ gruppe, aktion }: { gruppe: Gruppe; aktion?: React.ReactNode }) {
  const erster = gruppe.entries[0]!
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-ink-600">
        {erster.work_package_code
          ? <>
              <span className="font-medium">{erster.work_package_code}</span>
              {/* Bei Ticketnummern und Kuerzeln wie PMO sind Kuerzel und Name
                  identisch - "PMO · PMO" sagt nichts zweimal. */}
              {erster.work_package_name !== erster.work_package_code
                && ` · ${erster.work_package_name}`}
            </>
          : <span className="text-ink-500">ohne Arbeitspaket</span>}
      </span>
      <span aria-hidden className="text-ink-400">·</span>
      <span className="text-ink-600">
        {erster.activity_name ?? <span className="text-ink-500">ohne Tätigkeitsart</span>}
      </span>
      {aktion}
    </div>
  )
}

/* ----------------------------------------------------------- Gruppenblock */

/**
 * Eine Gruppe mit ihren Zeilen.
 *
 * Eigene Komponente, nicht nur ein Abschnitt: Der Stundensatz haengt an der
 * Taetigkeitsart der Gruppe, und `useRateFor` laesst sich nicht in einer
 * Schleife aufrufen. Ausserdem bleiben Entwuerfe und Fehler dort, wo sie
 * entstanden sind.
 */
function GruppenBlock({
  gruppe, project, workDate, pakete, arten, budget, vorschlaegeId, presetMinutes,
}: {
  gruppe: Gruppe
  project: Project
  workDate: string
  pakete: WorkPackage[]
  arten: ActivityType[]
  budget: WorkPackageBudget | undefined
  vorschlaegeId: string
  presetMinutes?: number
}) {
  const save = useSaveTimeEntry()
  const remove = useDeleteTimeEntry()
  const confirm = useConfirm()

  const [entwuerfe, setEntwuerfe] = useState<Record<string, Entwurf>>({})
  const [neue, setNeue] = useState<NeueZeile[]>(() =>
    presetMinutes
      ? [{ id: 'neu-1', dauer: minutesToHours(presetMinutes), text: '',
           abrechenbar: project.is_billable }]
      : [])
  const [kopf, setKopf] = useState({ offen: false, art: '', paket: '' })
  const [fehler, setFehler] = useState<string | null>(null)

  const { data: satz, isPending: satzLaeuft } =
    useRateFor(project.id, gruppe.activityId, workDate)
  const ohneSatz = !satzLaeuft && satz === null && project.is_billable

  const artName = gruppe.entries[0]!.activity_name

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

  /** Gemeinsame Werte jedes Schreibvorgangs - die Gruppe bestimmt sie, nicht die Zeile. */
  const gruppenwerte = {
    project_id: project.id,
    activity_type_id: gruppe.activityId,
    work_package_id: gruppe.packageId,
    work_date: workDate,
  }

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

  /** Speichert beim Verlassen des Feldes, wie im Wochenraster auch. */
  async function sichere(e: TimeEntryFull) {
    if (!entwuerfe[e.id]) return

    const dauer = feld(e, 'dauer')
    const text = feld(e, 'text').trim()
    const minutes = parseDuration(dauer)

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
      id: e.id,
      values: { ...gruppenwerte, duration_minutes: minutes, description: text,
                is_billable: e.is_billable },
    }))
    if (ok) verwirf(e.id)
  }

  async function setzeAbrechenbar(e: TimeEntryFull, wert: boolean) {
    await fuehreAus(() => save.mutateAsync({
      id: e.id,
      values: { ...gruppenwerte, duration_minutes: e.duration_minutes,
                description: e.description, is_billable: wert },
    }))
  }

  async function loesche(e: TimeEntryFull) {
    if (!await confirm(loeschFrage('Zeiteintrag', e.description))) return
    await fuehreAus(() => remove.mutateAsync(e.id))
  }

  function ergaenzeZeile() {
    setNeue((n) => [...n, { id: `neu-${Date.now()}`, dauer: '', text: '',
                            abrechenbar: project.is_billable }])
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
      values: { ...gruppenwerte, duration_minutes: minutes, description: text,
                is_billable: aktuell.abrechenbar },
    }))
    if (ok) setNeue((n) => n.filter((z) => z.id !== zeile.id))
  }

  /** Alle Eintraege der Gruppe auf ein anderes Paket oder eine andere Art. */
  async function haengeUm() {
    for (const e of gruppe.entries) {
      const ok = await fuehreAus(() => save.mutateAsync({
        id: e.id,
        values: { project_id: project.id, activity_type_id: kopf.art || null,
                  work_package_id: kopf.paket || null, work_date: workDate,
                  duration_minutes: e.duration_minutes, description: e.description,
                  is_billable: e.is_billable },
      }))
      if (!ok) return
    }
    setKopf({ offen: false, art: '', paket: '' })
  }

  return (
    <div className="space-y-2 rounded-md border border-ink-200 p-3">
      <GruppenKopf
        gruppe={gruppe}
        aktion={
          <Button size="sm" variant="ghost" aria-label="Tätigkeitsart und Arbeitspaket ändern"
                  aria-expanded={kopf.offen}
                  onClick={() => setKopf((k) => k.offen
                    ? { offen: false, art: '', paket: '' }
                    : { offen: true, art: gruppe.activityId ?? '',
                        paket: gruppe.packageId ?? '' })}>
            <Pencil className="size-3.5" />
          </Button>
        }
      />

      {/* Was vom Budget des Pakets noch offen ist - hier, wo gebucht wird, und
          nicht erst in den Stammdaten. */}
      <PackageBudget budget={budget} />

      {kopf.offen && (
        <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
          <p className="mb-2 text-xs text-ink-500">
            Gilt für {gruppe.entries.length === 1
              ? 'diesen Eintrag'
              : `alle ${gruppe.entries.length} Einträge dieses Arbeitspakets`}.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[10rem] flex-1">
              <span className={LABEL}>Tätigkeitsart</span>
              <Select value={kopf.art} onChange={(e) => setKopf((k) => ({ ...k, art: e.target.value }))}>
                <option value="">ohne Tätigkeitsart</option>
                {arten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                {/* Die eigene Art bleibt waehlbar, auch wenn sie inaktiv wurde -
                    sonst faende sich die Zuordnung beim Umhaengen nicht wieder. */}
                {gruppe.activityId && !arten.some((a) => a.id === gruppe.activityId) && (
                  <option value={gruppe.activityId}>{artName}</option>
                )}
              </Select>
            </label>
            {pakete.length > 0 && (
              <label className="min-w-[10rem] flex-1">
                <span className={LABEL}>Arbeitspaket</span>
                <Select value={kopf.paket}
                        onChange={(e) => setKopf((k) => ({ ...k, paket: e.target.value }))}>
                  <option value="">ohne Arbeitspaket</option>
                  {pakete.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                  {gruppe.packageId && !pakete.some((w) => w.id === gruppe.packageId) && (
                    <option value={gruppe.packageId}>{gruppe.entries[0]!.work_package_code}</option>
                  )}
                </Select>
              </label>
            )}
            <span className="flex gap-2">
              <Button onClick={() => setKopf({ offen: false, art: '', paket: '' })}>Abbrechen</Button>
              <Button variant="primary" disabled={save.isPending} onClick={() => void haengeUm()}>
                Übernehmen
              </Button>
            </span>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-ink-200">
        <div className="hidden gap-2 border-b border-ink-200 bg-ink-50/60 px-3 py-1.5 sm:flex">
          <span className={`${SPALTE} w-20 shrink-0`}>Dauer</span>
          <span className={`${SPALTE} min-w-0 flex-1`}>Beschreibung</span>
          <span className={`${SPALTE} w-24 shrink-0 text-center`}>abrechenbar</span>
          <span className="w-9 shrink-0" />
        </div>

        <ul className="divide-y divide-ink-100">
          {gruppe.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
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
              <label className="flex shrink-0 items-center gap-1.5 sm:w-24 sm:justify-center">
                <input type="checkbox" checked={e.is_billable} disabled={!project.is_billable}
                       aria-label={`abrechenbar, ${e.description}`}
                       onChange={(ev) => void setzeAbrechenbar(e, ev.target.checked)}
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
            <li key={z.id} className="flex flex-wrap items-center gap-2 bg-accent-50/40 px-3 py-2">
              <span className="w-20 shrink-0">
                <Input aria-label="Dauer, neue Zeile" inputMode="decimal" placeholder="1,5"
                       className="tabular text-right" value={z.dauer}
                       autoFocus={i === neue.length - 1 && !presetMinutes}
                       onChange={(ev) => setzeNeu(z.id, { dauer: ev.target.value })}
                       onBlur={() => void sichereNeu(z)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }} />
              </span>
              <span className="min-w-[10rem] flex-1">
                <Input aria-label="Beschreibung, neue Zeile" list={vorschlaegeId}
                       placeholder="Was wurde gemacht?" value={z.text}
                       autoFocus={Boolean(presetMinutes) && i === 0}
                       onChange={(ev) => setzeNeu(z.id, { text: ev.target.value })}
                       onBlur={() => void sichereNeu(z)}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }} />
              </span>
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
      </div>

      <Button size="sm" onClick={ergaenzeZeile}>
        <Plus className="size-4" /> Zeile hinzufügen
      </Button>

      {ohneSatz && (
        <WarnNote>
          Für dieses Projekt gibt es {artName ? `mit „${artName}" ` : 'ohne Tätigkeitsart '}
          keinen Stundensatz zum {formatDate(workDate)}. Die Zeit wird gespeichert, aber mit
          0,00 € bewertet.
        </WarnNote>
      )}

      <ErrorNote message={fehler} />
    </div>
  )
}

/* ------------------------------------------------------- Neuer Eintrag */

/**
 * Ein Eintrag auf einem Paket, das an diesem Tag noch nichts hat.
 *
 * Arbeitspaket und Taetigkeitsart stehen hier in der Zeile, weil es sie noch
 * nicht als Gruppe gibt - sobald gespeichert ist, uebernimmt der Gruppenblock.
 */
function NeuerEintragBlock({
  zeile, project, workDate, pakete, arten, budget, vorschlaegeId,
  onAendern, onVerwerfen, onFehler,
}: {
  zeile: NeuerEintrag
  project: Project
  workDate: string
  pakete: WorkPackage[]
  arten: ActivityType[]
  budget: WorkPackageBudget | undefined
  vorschlaegeId: string
  onAendern: (teil: Partial<NeuerEintrag>) => void
  onVerwerfen: () => void
  onFehler: (text: string | null) => void
}) {
  const save = useSaveTimeEntry()

  async function sichere() {
    const minutes = parseDuration(zeile.dauer)
    const text = zeile.text.trim()
    if (minutes === null || minutes <= 0 || !text) return

    if (minutes > 1440) {
      onFehler('Mehr als 24 Stunden an einem Tag sind nicht möglich.')
      return
    }
    onFehler(null)
    try {
      await save.mutateAsync({
        values: {
          project_id: project.id,
          activity_type_id: zeile.art || null,
          work_package_id: zeile.paket || null,
          work_date: workDate,
          duration_minutes: minutes,
          description: text,
          is_billable: zeile.abrechenbar,
        },
      })
      onVerwerfen()
    } catch (err) {
      onFehler(describeError(err))
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-accent-500 bg-accent-50/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        {pakete.length > 0 && (
          <label className="min-w-[10rem] flex-1">
            <span className={LABEL}>Arbeitspaket</span>
            <Select value={zeile.paket} onChange={(e) => onAendern({ paket: e.target.value })}>
              <option value="">ohne Arbeitspaket</option>
              {pakete.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </Select>
          </label>
        )}
        <label className="min-w-[10rem] flex-1">
          <span className={LABEL}>Tätigkeitsart</span>
          <Select value={zeile.art} onChange={(e) => onAendern({ art: e.target.value })}>
            <option value="">ohne Tätigkeitsart</option>
            {arten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </label>
      </div>

      <PackageBudget budget={budget} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0">
          <Input aria-label="Dauer, neuer Eintrag" inputMode="decimal" placeholder="1,5"
                 className="tabular text-right" value={zeile.dauer}
                 onChange={(e) => onAendern({ dauer: e.target.value })}
                 onBlur={() => void sichere()}
                 onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        </span>
        <span className="min-w-[10rem] flex-1">
          <Input aria-label="Beschreibung, neuer Eintrag" list={vorschlaegeId}
                 placeholder="Was wurde gemacht?" value={zeile.text} autoFocus
                 onChange={(e) => onAendern({ text: e.target.value })}
                 onBlur={() => void sichere()}
                 onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        </span>
        <label className="flex shrink-0 items-center gap-1.5 sm:w-24 sm:justify-center">
          <input type="checkbox" checked={zeile.abrechenbar} disabled={!project.is_billable}
                 aria-label="abrechenbar, neuer Eintrag"
                 onChange={(e) => onAendern({ abrechenbar: e.target.checked })}
                 className="size-4 rounded border-ink-300" />
          <span className="text-xs text-ink-500 sm:hidden">abrechenbar</span>
        </label>
        <Button size="sm" variant="ghost" aria-label="Neuen Eintrag verwerfen"
                className="w-9 shrink-0 px-0" onClick={onVerwerfen}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}
