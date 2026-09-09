import { useId, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Button, Dialog, ErrorNote, Input, Select, WarnNote,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import { formatDate } from '@/lib/format'
import { minutesToHours, parseDuration } from '@/lib/week'
import type { ActivityType, Project, TimeEntryFull, WorkPackage } from '@/types/database'
import { useActivityTypes } from '@/features/activity-types/api'
import { nachKuerzel, useAllWorkPackageBudgets, useWorkPackages } from '@/features/projects/api'
import { PackageBudget } from './PackageBudget'
import {
  useDeleteTimeEntry, useRateFor, useRecentDescriptions, useSaveTimeEntry,
} from './api'

/** Identitaet der Zelle. Die Eintraege kommen getrennt und immer frisch dazu. */
export type EntryDialogTarget = {
  project: Project
  activity: ActivityType | null
  workPackage: WorkPackage | null
  workDate: string
  /** Vorbelegte Dauer, wenn die Zelle direkt im Raster getippt wurde. */
  presetMinutes?: number
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
  return `${t.project.id}|${t.activity?.id ?? ''}|${t.workPackage?.id ?? ''}`
    + `|${t.workDate}|${t.presetMinutes ?? ''}|${t.locked ? 'gesperrt' : ''}`
}

/**
 * Ein Tag einer Rasterzeile: Eintraege stehen als Zeilen da und werden dort
 * auch bearbeitet.
 *
 * Auf dem Telefon steht das im Dialog, am Laptop unter dem Wochenraster - der
 * Inhalt ist derselbe, sonst haetten wir zwei Oberflaechen zu pflegen und eine
 * davon waere bald die schlechtere.
 */
export function EntryDialog(props: {
  target: EntryDialogTarget | null
  entries: TimeEntryFull[]
  onClose: () => void
  onRetarget?: (target: EntryDialogTarget) => void
}) {
  if (!props.target) return null
  const { target, entries, onClose, onRetarget } = props
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${target.project.name} · ${formatDate(target.workDate)}`}
      description="Dauer und Beschreibung stehen direkt in der Zeile — gespeichert wird beim Verlassen des Feldes."
    >
      <EntryEditor key={entryEditorKey(target)} target={target} entries={entries}
                   onRetarget={onRetarget} />
      <div className="mt-3 flex justify-end border-t border-ink-100 pt-3">
        <Button type="button" onClick={onClose}>Schließen</Button>
      </div>
    </Dialog>
  )
}

/** Eine Zeile, die es noch nicht in der Datenbank gibt. */
type NeueZeile = { id: string; dauer: string; text: string; abrechenbar: boolean }

/** Was an einem vorhandenen Eintrag gerade abweichend im Feld steht. */
type Entwurf = { dauer?: string; text?: string }

const LABEL = 'mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase'
const SPALTE = 'text-xs font-semibold tracking-wide text-ink-500 uppercase'

export function EntryEditor({
  target, entries, onRetarget,
}: {
  target: EntryDialogTarget
  entries: TimeEntryFull[]
  /**
   * Taetigkeitsart oder Arbeitspaket der Zelle haben sich geaendert: die
   * Eintraege gehoeren jetzt in eine andere Rasterzeile, und die Auswahl muss
   * mit. Ohne das zeigte die Tafel gleich darauf eine leere Zelle.
   */
  onRetarget?: (target: EntryDialogTarget) => void
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
  const [neue, setNeue] = useState<NeueZeile[]>(() =>
    target.presetMinutes
      ? [{ id: 'neu-1', dauer: minutesToHours(target.presetMinutes), text: '',
           abrechenbar: project.is_billable }]
      : [])
  const [kopf, setKopf] = useState({ offen: false, art: '', paket: '' })
  const [fehler, setFehler] = useState<string | null>(null)

  const locked = target.locked === true || entries.some((e) => e.status !== 'draft')

  // Inaktive bleiben waehlbar, solange die Zelle sie traegt - sonst faende sich
  // die eigene Zuordnung beim Umhaengen nicht wieder.
  const waehlbareArten = (activityTypes ?? [])
    .filter((a) => a.is_active || a.id === target.activity?.id)
  const waehlbarePakete = (workPackages ?? [])
    .filter((w) => w.is_active || w.id === target.workPackage?.id)
    .sort(nachKuerzel)

  const { data: satz, isPending: satzLaeuft } =
    useRateFor(project.id, target.activity?.id ?? null, workDate)
  const ohneSatz = !satzLaeuft && satz === null && project.is_billable

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

  /** Gemeinsame Werte jedes Schreibvorgangs - die Zelle bestimmt sie, nicht die Zeile. */
  const zellwerte = {
    project_id: project.id,
    activity_type_id: target.activity?.id ?? null,
    work_package_id: target.workPackage?.id ?? null,
    work_date: workDate,
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
      values: { ...zellwerte, duration_minutes: minutes, description: text,
                is_billable: e.is_billable },
    }))
    if (ok) verwirf(e.id)
  }

  async function setzeAbrechenbar(e: TimeEntryFull, wert: boolean) {
    await fuehreAus(() => save.mutateAsync({
      id: e.id,
      values: { ...zellwerte, duration_minutes: e.duration_minutes,
                description: e.description, is_billable: wert },
    }))
  }

  async function loesche(e: TimeEntryFull) {
    if (!await confirm(loeschFrage('Zeiteintrag', e.description))) return
    await fuehreAus(() => remove.mutateAsync(e.id))
  }

  /* ------------------------------------------------------------- neue Zeile */

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
      values: { ...zellwerte, duration_minutes: minutes, description: text,
                is_billable: aktuell.abrechenbar },
    }))
    if (ok) setNeue((n) => n.filter((z) => z.id !== zeile.id))
  }

  /* --------------------------------------------------------- Zelle umhaengen */

  async function haengeUm() {
    const neueArt = waehlbareArten.find((a) => a.id === kopf.art) ?? null
    const neuesPaket = waehlbarePakete.find((w) => w.id === kopf.paket) ?? null

    for (const e of entries) {
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
    onRetarget?.({ ...target, activity: neueArt, workPackage: neuesPaket,
                   presetMinutes: undefined })
  }

  return (
    <div className="space-y-3">
      {/* Kopfebene: was fuer die ganze Zelle gilt, nicht je Zeile. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-ink-600">
          {target.workPackage
            ? <>
                <span className="font-medium">{target.workPackage.code}</span>
                {/* Bei Ticketnummern und Kuerzeln wie PMO sind Kuerzel und Name
                    identisch - "PMO · PMO" sagt nichts zweimal. */}
                {target.workPackage.name !== target.workPackage.code && ` · ${target.workPackage.name}`}
              </>
            : <span className="text-ink-500">ohne Arbeitspaket</span>}
        </span>
        <span aria-hidden className="text-ink-400">·</span>
        <span className="text-ink-600">
          {target.activity?.name ?? <span className="text-ink-500">ohne Tätigkeitsart</span>}
        </span>
        {!locked && (
          <Button size="sm" variant="ghost" aria-label="Tätigkeitsart und Arbeitspaket ändern"
                  aria-expanded={kopf.offen}
                  onClick={() => setKopf((k) => k.offen
                    ? { offen: false, art: '', paket: '' }
                    : { offen: true, art: target.activity?.id ?? '',
                        paket: target.workPackage?.id ?? '' })}>
            <Pencil className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Was vom Budget des Pakets noch offen ist - hier, wo gebucht wird, und
          nicht erst in den Stammdaten. */}
      {target.workPackage && (
        <PackageBudget budget={(budgets ?? []).find(
          (b) => b.work_package_id === target.workPackage?.id)} />
      )}

      {kopf.offen && (
        <div className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
          <p className="mb-2 text-xs text-ink-500">
            Gilt für die ganze Zelle.{' '}
            {entries.length === 1 && 'Der Eintrag wandert damit in eine andere Rasterzeile.'}
            {entries.length > 1 && `Alle ${entries.length} Einträge wandern damit in eine andere Rasterzeile.`}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[10rem] flex-1">
              <span className={LABEL}>Tätigkeitsart</span>
              <Select value={kopf.art} onChange={(e) => setKopf((k) => ({ ...k, art: e.target.value }))}>
                <option value="">ohne Tätigkeitsart</option>
                {waehlbareArten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </label>
            {waehlbarePakete.length > 0 && (
              <label className="min-w-[10rem] flex-1">
                <span className={LABEL}>Arbeitspaket</span>
                <Select value={kopf.paket}
                        onChange={(e) => setKopf((k) => ({ ...k, paket: e.target.value }))}>
                  <option value="">ohne Arbeitspaket</option>
                  {waehlbarePakete.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
                  ))}
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

      {locked ? (
        <>
          <ul className="divide-y divide-ink-100 border-y border-ink-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
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
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-ink-200">
            <div className="hidden gap-2 border-b border-ink-200 bg-ink-50/60 px-3 py-1.5 sm:flex">
              <span className={`${SPALTE} w-20 shrink-0`}>Dauer</span>
              <span className={`${SPALTE} min-w-0 flex-1`}>Beschreibung</span>
              <span className={`${SPALTE} w-24 shrink-0 text-center`}>abrechenbar</span>
              <span className="w-9 shrink-0" />
            </div>

            <ul className="divide-y divide-ink-100">
              {entries.map((e) => (
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
                    {/* Schmal faellt die Spaltenueberschrift weg - dann stuende
                        das Haekchen ohne ein Wort dazu da. */}
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

            {entries.length === 0 && neue.length === 0 && (
              <p className="px-3 py-4 text-sm text-ink-500">
                Noch nichts erfasst — „Zeile" legt den ersten Eintrag an.
              </p>
            )}
          </div>

          {/* Die Vorschlaege haengen an der Beschreibung selbst: fuer einen
              eigenen Streifen mit Schaltflaechen ist in einer Zeile kein Platz. */}
          <datalist id={vorschlaegeId}>
            {(suggestions ?? []).map((text) => <option key={text} value={text} />)}
          </datalist>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Nicht nur "Zeile": darueber steht im Raster schon eine
                Schaltflaeche dieses Namens fuer eine neue Rasterzeile. */}
            <Button size="sm" onClick={ergaenzeZeile}>
              <Plus className="size-4" /> Zeile hinzufügen
            </Button>
            <span className="text-xs text-ink-500">
              Gespeichert wird beim Verlassen des Feldes.
            </span>
          </div>
        </>
      )}

      {ohneSatz && (
        <WarnNote>
          Für dieses Projekt gibt es {target.activity ? `mit „${target.activity.name}" ` : 'ohne Tätigkeitsart '}
          keinen Stundensatz zum {formatDate(workDate)}. Die Zeit wird gespeichert, aber mit
          0,00 € bewertet.
        </WarnNote>
      )}

      <ErrorNote message={fehler} />
    </div>
  )
}
