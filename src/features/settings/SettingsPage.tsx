import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Input, Select,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatDate, today } from '@/lib/format'
import { minutesToHours, parseDuration } from '@/lib/week'
import { BUNDESLAENDER, holidaysFor, type BundeslandCode } from '@/lib/holidays'
import type {
  Absence, AbsenceInsert, AbsenceKind, WorkSchedule, WorkScheduleInsert,
} from '@/types/database'
import {
  useAbsences, useDeleteAbsence, useDeleteHolidayYear, useDeleteWorkSchedule, useHolidays,
  useImportHolidays, useSaveAbsence, useSaveWorkSchedule, useWorkSchedules,
} from './api'

const TAGE = [
  { key: 'minutes_mon', label: 'Mo' }, { key: 'minutes_tue', label: 'Di' },
  { key: 'minutes_wed', label: 'Mi' }, { key: 'minutes_thu', label: 'Do' },
  { key: 'minutes_fri', label: 'Fr' }, { key: 'minutes_sat', label: 'Sa' },
  { key: 'minutes_sun', label: 'So' },
] as const

const ABWESENHEIT: Record<AbsenceKind, string> = {
  vacation: 'Urlaub', sick: 'Krankheit', training: 'Weiterbildung', other: 'Sonstiges',
}

/* ------------------------------------------------------- Arbeitszeitmodell */

function ScheduleDialog({
  schedule, onClose,
}: { schedule: WorkSchedule | null; onClose: () => void }) {
  const save = useSaveWorkSchedule()
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)

    const minuten: Record<string, number> = {}
    for (const tag of TAGE) {
      const eingabe = String(form.get(tag.key) ?? '').trim()
      const wert = eingabe === '' ? 0 : parseDuration(eingabe)
      if (wert === null || wert < 0 || wert > 1440) {
        setError(`${tag.label}: Dauer nicht verstanden. Möglich sind etwa 8 · 7,5 · 7:30.`)
        return
      }
      minuten[tag.key] = wert
    }

    const values: WorkScheduleInsert = {
      valid_from: String(form.get('valid_from') ?? ''),
      valid_to: String(form.get('valid_to') ?? '').trim() || null,
      minutes_mon: minuten.minutes_mon!, minutes_tue: minuten.minutes_tue!,
      minutes_wed: minuten.minutes_wed!, minutes_thu: minuten.minutes_thu!,
      minutes_fri: minuten.minutes_fri!, minutes_sat: minuten.minutes_sat!,
      minutes_sun: minuten.minutes_sun!,
    }

    if (values.valid_to && values.valid_to < values.valid_from) {
      setError('Das Ende liegt vor dem Beginn.')
      return
    }

    try {
      await save.mutateAsync(schedule ? { id: schedule.id, values } : { values })
      onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog open onClose={onClose}
            title={schedule ? 'Arbeitszeitmodell ändern' : 'Neues Arbeitszeitmodell'}
            description="Stunden je Wochentag. Ein Wechsel bekommt einen eigenen Zeitraum, damit ältere Auswertungen richtig bleiben.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gültig ab">
            <Input type="date" name="valid_from" required
                   defaultValue={schedule?.valid_from ?? `${new Date().getFullYear()}-01-01`} />
          </Field>
          <Field label="Gültig bis" hint="leer = offen">
            <Input type="date" name="valid_to" defaultValue={schedule?.valid_to ?? ''} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">
            Stunden je Tag
          </span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {TAGE.map((tag) => (
              <label key={tag.key} className="block">
                <span className="mb-1 block text-center text-xs text-ink-500">{tag.label}</span>
                <Input name={tag.key} inputMode="decimal" className="px-1 text-center"
                       defaultValue={schedule
                         ? minutesToHours(schedule[tag.key]).replace(',00', '')
                         : (tag.key === 'minutes_sat' || tag.key === 'minutes_sun' ? '0' : '8')} />
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-400">8 · 7,5 · 7:30 · 0 für freie Tage</p>
        </div>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------ Abwesenheiten */

function AbsenceDialog({
  absence, onClose,
}: { absence: Absence | null; onClose: () => void }) {
  const save = useSaveAbsence()
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)
    const values: AbsenceInsert = {
      date_from: String(form.get('date_from') ?? ''),
      date_to: String(form.get('date_to') ?? ''),
      kind: String(form.get('kind') ?? 'vacation') as AbsenceKind,
      note: String(form.get('note') ?? '').trim() || null,
    }
    if (values.date_to < values.date_from) return setError('Das Ende liegt vor dem Beginn.')

    try {
      await save.mutateAsync(absence ? { id: absence.id, values } : { values })
      onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog open onClose={onClose}
            title={absence ? 'Abwesenheit ändern' : 'Neue Abwesenheit'}
            description="Zieht die Sollarbeitszeit für diese Tage ab und verbessert damit die Auslastungsquote.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Art">
          <Select name="kind" defaultValue={absence?.kind ?? 'vacation'}>
            {Object.entries(ABWESENHEIT).map(([wert, label]) => (
              <option key={wert} value={wert}>{label}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von">
            <Input type="date" name="date_from" required defaultValue={absence?.date_from ?? today()} />
          </Field>
          <Field label="Bis">
            <Input type="date" name="date_to" required defaultValue={absence?.date_to ?? today()} />
          </Field>
        </div>
        <Field label="Notiz" hint="optional">
          <Input name="note" defaultValue={absence?.note ?? ''} />
        </Field>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ------------------------------------------------------------------- Seite */

export function SettingsPage() {
  const schedules = useWorkSchedules()
  const absences = useAbsences()
  const holidays = useHolidays()
  const removeSchedule = useDeleteWorkSchedule()
  const removeAbsence = useDeleteAbsence()
  const importHolidays = useImportHolidays()
  const removeHolidayYear = useDeleteHolidayYear()

  const [scheduleDialog, setScheduleDialog] = useState<{ open: boolean; schedule: WorkSchedule | null }>(
    { open: false, schedule: null })
  const [absenceDialog, setAbsenceDialog] = useState<{ open: boolean; absence: Absence | null }>(
    { open: false, absence: null })
  const [region, setRegion] = useState<BundeslandCode>('DE-BY')
  const [year, setYear] = useState(new Date().getFullYear())
  const [error, setError] = useState<string | null>(null)

  const vorschau = useMemo(() => holidaysFor(year, region), [year, region])
  const vorhanden = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of holidays.data ?? []) {
      const key = `${h.region}|${h.holiday_date.slice(0, 4)}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [holidays.data])

  const wochenstunden = (s: WorkSchedule) =>
    TAGE.reduce((n, t) => n + s[t.key], 0)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(describeError(err))
    }
  }

  const ladefehler = schedules.error ?? absences.error ?? holidays.error

  return (
    <>
      <PageHeader
        title="Arbeitszeit"
        subtitle="Sollstunden, Abwesenheiten und Feiertage — daraus entsteht die Auslastungsquote in den Auswertungen."
      />

      {ladefehler && <div className="mt-4"><ErrorNote message={describeError(ladefehler)} /></div>}
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}

      {/* --- Arbeitszeitmodell --- */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-700">Arbeitszeitmodell</h2>
            <p className="text-xs text-ink-400">
              Ein Wechsel bekommt einen eigenen Zeitraum, damit ältere Auswertungen richtig bleiben.
            </p>
          </div>
          <Button size="sm" onClick={() => setScheduleDialog({ open: true, schedule: null })}>
            <Plus className="size-4" /> Modell
          </Button>
        </div>

        {schedules.isPending ? (
          <p className="px-5 py-6 text-sm text-ink-400">Wird geladen …</p>
        ) : !schedules.data?.length ? (
          <EmptyState
            title="Kein Arbeitszeitmodell hinterlegt"
            hint="Ohne Sollzeit bleibt die Auslastungsquote in den Auswertungen ausgeblendet — eine erfundene Zahl wäre schlimmer als keine."
            action={
              <Button variant="primary" onClick={() => setScheduleDialog({ open: true, schedule: null })}>
                Modell anlegen
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {schedules.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="tabular text-sm font-medium text-ink-800">
                    {minutesToHours(wochenstunden(s))} h je Woche
                  </p>
                  <p className="tabular text-xs text-ink-500">
                    {s.valid_to
                      ? `${formatDate(s.valid_from)} – ${formatDate(s.valid_to)}`
                      : `ab ${formatDate(s.valid_from)}`}
                  </p>
                  <p className="tabular mt-1 text-xs text-ink-400">
                    {TAGE.map((t) => `${t.label} ${minutesToHours(s[t.key]).replace(',00', '')}`).join(' · ')}
                  </p>
                </div>
                <span className="shrink-0">
                  <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                          onClick={() => setScheduleDialog({ open: true, schedule: s })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Löschen"
                          onClick={() => confirm('Modell wirklich löschen?')
                            && void run(() => removeSchedule.mutateAsync(s.id))}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- Feiertage --- */}
      <Card className="mt-3 overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-700">Feiertage</h2>
          <p className="text-xs text-ink-400">
            Wähle Bundesland und Jahr — die Liste wird berechnet, nicht abgetippt.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <Field label="Bundesland" className="w-56">
            <Select value={region} onChange={(e) => setRegion(e.target.value as BundeslandCode)}>
              {BUNDESLAENDER.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Jahr" className="w-28">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[-1, 0, 1, 2].map((v) => {
                const j = new Date().getFullYear() + v
                return <option key={j} value={j}>{j}</option>
              })}
            </Select>
          </Field>
          <Button variant="primary"
                  disabled={importHolidays.isPending}
                  onClick={() => void run(() =>
                    importHolidays.mutateAsync({ region, holidays: vorschau }))}>
            <CalendarPlus className="size-4" />
            {vorhanden.has(`${region}|${year}`) ? 'Erneut übernehmen' : `${vorschau.length} Tage übernehmen`}
          </Button>
          {vorhanden.has(`${region}|${year}`) && (
            <Button variant="danger"
                    onClick={() => confirm(`Feiertage ${year} für dieses Bundesland löschen?`)
                      && void run(() => removeHolidayYear.mutateAsync({ region, year }))}>
              <Trash2 className="size-4" /> Jahr löschen
            </Button>
          )}
        </div>

        <div className="border-t border-ink-100 px-5 py-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            {year} in {BUNDESLAENDER.find((b) => b.code === region)?.name}
            {vorhanden.has(`${region}|${year}`) && (
              <span className="ml-2"><Badge tone="good">
                {vorhanden.get(`${region}|${year}`)} übernommen
              </Badge></span>
            )}
          </p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {vorschau.map((h) => (
              <li key={h.date} className="flex justify-between gap-2 text-sm">
                <span className="truncate text-ink-600">{h.name}</span>
                <span className="tabular shrink-0 text-ink-400">{formatDate(h.date)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            Landesweit geltende Tage. Regional begrenzte fehlen bewusst, weil sie sich nicht am
            Bundesland festmachen lassen — Mariä Himmelfahrt gilt in Bayern nur in überwiegend
            katholischen Gemeinden, Fronleichnam in Sachsen und Thüringen nur in einzelnen.
            Solche Tage trägst du bei Bedarf als Abwesenheit nach.
          </p>
        </div>
      </Card>

      {/* --- Abwesenheiten --- */}
      <Card className="mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-700">Abwesenheiten</h2>
            <p className="text-xs text-ink-400">Urlaub, Krankheit, Weiterbildung — zieht die Sollzeit ab.</p>
          </div>
          <Button size="sm" onClick={() => setAbsenceDialog({ open: true, absence: null })}>
            <Plus className="size-4" /> Abwesenheit
          </Button>
        </div>

        {absences.isPending ? (
          <p className="px-5 py-6 text-sm text-ink-400">Wird geladen …</p>
        ) : !absences.data?.length ? (
          <EmptyState title="Keine Abwesenheiten erfasst"
                      hint="Ohne sie fällt die Auslastungsquote in Urlaubswochen künstlich niedrig aus." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {absences.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-800">
                    {ABWESENHEIT[a.kind]}
                    {a.note && <span className="text-ink-400"> · {a.note}</span>}
                  </p>
                  <p className="tabular text-xs text-ink-500">
                    {a.date_from === a.date_to
                      ? formatDate(a.date_from)
                      : `${formatDate(a.date_from)} – ${formatDate(a.date_to)}`}
                  </p>
                </div>
                <span className="shrink-0">
                  <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                          onClick={() => setAbsenceDialog({ open: true, absence: a })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Löschen"
                          onClick={() => confirm('Abwesenheit wirklich löschen?')
                            && void run(() => removeAbsence.mutateAsync(a.id))}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Erst beim Oeffnen einhaengen: so startet jeder Aufruf mit leeren Feldern
          und ohne die Fehlermeldung des vorigen Versuchs. */}
      {scheduleDialog.open && (
        <ScheduleDialog schedule={scheduleDialog.schedule}
                        onClose={() => setScheduleDialog({ open: false, schedule: null })} />
      )}
      {absenceDialog.open && (
        <AbsenceDialog absence={absenceDialog.absence}
                       onClose={() => setAbsenceDialog({ open: false, absence: null })} />
      )}
    </>
  )
}
