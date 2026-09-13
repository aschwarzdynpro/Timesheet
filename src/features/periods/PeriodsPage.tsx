import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, ChevronDown, ChevronRight, FileDown, History, Lock, LockOpen,
} from 'lucide-react'
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Select, Textarea,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/confirm'
import { CYCLE_LABEL, formatDate, formatEuro } from '@/lib/format'
import { minutesToHours, toIsoDate } from '@/lib/week'
import { useCustomers } from '@/features/customers/api'
import { profileDesKunden, useExportProfiles, type ExportProfile } from '@/features/export/api'
import { cellText, columnDefs, type ColumnDef, type ColumnKey } from '@/features/export/columns'
import type { TimeEntryFull } from '@/types/database'
import { OHNE_PROFIL, profilDerPeriode, spaltenDerPeriode } from './spalten'
import {
  periodEntriesQuery, periodExpensesQuery, usePeriodEntries, usePeriodEvents, usePeriods,
  useReopenPeriod, useSubmitPeriod, type PeriodWithTotals,
} from './api'

const STATUS = {
  open:      { label: 'offen',      tone: 'neutral' as const },
  submitted: { label: 'gemeldet',   tone: 'good' as const },
  approved:  { label: 'freigegeben', tone: 'good' as const },
  invoiced:  { label: 'abgerechnet', tone: 'muted' as const },
}

/**
 * Was mit dieser Periode schon passiert ist. Steht nur da, wenn es mehr als die
 * eine Meldung zu erzaehlen gibt - sonst waere es eine Zeile Rauschen.
 */
function PeriodHistory({ periodId }: { periodId: string }) {
  const { data: events } = usePeriodEvents(periodId)
  if (!events || events.length < 2) return null

  return (
    <div className="border-t border-ink-100 bg-surface px-5 py-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
        <History className="size-3.5" /> Verlauf
      </p>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-x-2 text-sm">
            <span className="tabular shrink-0 text-ink-400">
              {formatDate(e.created_at.slice(0, 10))}
            </span>
            <span className={e.event === 'reopened' ? 'text-amber-700' : 'text-ink-700'}>
              {e.event === 'reopened' ? 'wieder geöffnet' : 'gemeldet'}
            </span>
            {e.total_minutes !== null && (
              <span className="tabular text-ink-400">
                {minutesToHours(e.total_minutes)} h
                {e.total_fees !== null && ` · ${formatEuro(Number(e.total_fees))}`}
              </span>
            )}
            {e.note && <span className="text-ink-500">— {e.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Eine Meldung zuruecknehmen ist kein Loeschen und kein Melden - dafuer reicht
 * die schlichte Rueckfrage nicht: hier gehoert der Grund dazu, weil man in drei
 * Monaten wissen will, warum die Zahlen einer Woche zweimal anders waren.
 */
function ReopenDialog({
  period, label, onClose,
}: { period: PeriodWithTotals; label: string; onClose: () => void }) {
  const reopen = useReopenPeriod()
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const note = String(new FormData(event.currentTarget).get('note') ?? '')
    try {
      await reopen.mutateAsync({ periodId: period.id, note })
      onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog open onClose={onClose}
            title="Meldung zurücknehmen?"
            description={label}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-600">
          Die Zeiten dieser Periode werden wieder änderbar, und die eingefrorenen
          Stundensätze fallen weg. Beim erneuten Melden wird nach der dann gültigen
          Satzhistorie neu bewertet — die Summe kann sich dadurch ändern.
        </p>
        <p className="tabular rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-600">
          Gemeldet waren {minutesToHours(period.live_minutes)} h ·{' '}
          {formatEuro(period.live_fees)}. Der Verlauf hält das fest.
        </p>

        <Field label="Grund" hint="Wofür du es in drei Monaten noch wissen willst">
          <Textarea name="note" rows={2} autoFocus
                    placeholder="Kunde hat die Reisezeit zurückgewiesen, Umbuchung auf Projekt X" />
        </Field>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={reopen.isPending}>
            {reopen.isPending ? 'Wird geöffnet …' : 'Periode öffnen'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Eine Zelle des Unterrasters.
 *
 * Den Wert liefert der Spaltenkatalog des Exports; zwei Dinge kommen hier
 * dazu, die in einer Datei nichts verloren haetten. Ein fehlender Satz steht
 * als Gedankenstrich und nicht als 0,00 EUR - eine erfundene Zahl waere
 * schlimmer als keine. Und ein eingefrorener Satz traegt sein Schloss: daran
 * sieht man, dass diese Zeile gemeldet ist und sich nicht mehr neu bewertet.
 */
function Zelle({ def, entry }: { def: ColumnDef; entry: TimeEntryFull }) {
  if (def.key === 'rate') {
    return (
      <>
        {entry.rate === null ? '–' : cellText(def.cell(entry))}
        {entry.rate_is_frozen && <Lock className="ml-1 inline size-3 text-ink-300" />}
      </>
    )
  }
  return <>{cellText(def.cell(entry))}</>
}

/**
 * Welches Spaltenbild diese Periode traegt.
 *
 * Steht nur da, wo es etwas zu waehlen gibt: ohne Profil fuer diesen Kunden
 * bliebe ein Feld mit einem einzigen Eintrag, das nichts entscheidet.
 *
 * Die Wahl gilt fuer den Kunden und nicht fuer die einzelne Periode: Zwei
 * Wochen desselben Kunden werden gleich nachgewiesen, und wer sie an der Woche
 * festmachte, muesste sie in jeder neuen Woche erneut treffen.
 */
function ProfilWahl({ profile, wert, onWahl }: {
  profile: ExportProfile[]
  wert: string
  onWahl: (id: string) => void
}) {
  if (profile.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 px-5 py-2">
      <label className="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
        Spalten
        <Select value={wert} onChange={(e) => onWahl(e.target.value)} className="w-40 sm:w-56">
          <option value={OHNE_PROFIL}>Standard</option>
          {profile.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </label>
      <span className="text-xs text-ink-400">
        Dieselben Spalten stehen im Nachweis.
      </span>
    </div>
  )
}

/**
 * Die Positionen einer Periode - in den Spalten, die auch der Nachweis traegt.
 *
 * Das Raster ist die Vorschau der Datei, die der Kunde bekommt: dieselben
 * Spalten, dieselbe Reihenfolge, dieselbe Quelle. Vorher standen hier sechs
 * fest verdrahtete Spalten, und wer ein Profil mit Arbeitspaket gesichert
 * hatte, sah es erst in der heruntergeladenen Datei.
 */
function PeriodDetail({ periodId, spalten, auswahl }: {
  periodId: string
  spalten: ColumnKey[]
  /** Die Profilauswahl. Sie steht ueber der Tabelle, weil sie sie bestimmt. */
  auswahl: ReactNode
}) {
  const { data: entries, isPending } = usePeriodEntries(periodId)
  const defs = useMemo(() => columnDefs(spalten), [spalten])

  if (isPending) return <p className="px-5 py-4 text-sm text-ink-400">Wird geladen …</p>
  if (!entries?.length) {
    return <p className="px-5 py-4 text-sm text-ink-400">Keine Einträge in dieser Periode.</p>
  }

  return (
    <div className="border-t border-ink-100 bg-ink-50/50">
      {auswahl}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
              {defs.map((def) => (
                <th key={def.key}
                    className={`px-5 py-2 font-semibold whitespace-nowrap ${
                      def.align === 'right' ? 'text-right' : ''}`}>
                  {def.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-ink-100 last:border-0">
                {defs.map((def) => (
                  <td key={def.key}
                      className={`px-5 py-2 ${
                        def.align === 'right' ? 'tabular text-right text-ink-800' : 'text-ink-600'} ${
                        def.key === 'amount' ? 'font-medium' : ''} ${
                        def.key === 'description' ? 'min-w-[14rem]' : 'whitespace-nowrap'}`}>
                    <Zelle def={def} entry={e} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Was mit dieser Periode zuletzt geschehen ist - eine Zeile fuer den Nachweis. */
function standText(period: PeriodWithTotals): string {
  if (period.status === 'open') return 'offen — noch nicht gemeldet'
  const am = period.submitted_at ? ` am ${formatDate(period.submitted_at.slice(0, 10))}` : ''
  return `${STATUS[period.status].label}${am}`
}

export function PeriodsPage() {
  const { data: periods, isPending, error } = usePeriods()
  const { data: customers } = useCustomers()
  const { data: profiles } = useExportProfiles()
  const submit = useSubmitPeriod()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [reopening, setReopening] = useState<PeriodWithTotals | null>(null)
  const [erzeugt, setErzeugt] = useState<string | null>(null)

  const [customerId, setCustomerId] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  /** Je Kunde das gewaehlte Spaltenbild; fehlt er, gilt sein erstes Profil. */
  const [profilwahl, setProfilwahl] = useState<Record<string, string>>({})

  const today = toIsoDate(new Date())

  const visible = useMemo(() => {
    return (periods ?? []).filter((p) => {
      if (customerId && p.customer_id !== customerId) return false
      if (onlyOpen && p.status !== 'open') return false
      return true
    })
  }, [periods, customerId, onlyOpen])

  /** Vorbei und noch nicht gemeldet – genau das vergisst man im Alltag. */
  const overdue = useMemo(
    () => (periods ?? []).filter((p) => p.status === 'open' && p.period_end < today && p.entry_count > 0),
    [periods, today],
  )

  const nameOf = (id: string) => customers?.find((c) => c.id === id)?.name ?? '—'

  const bezeichne = (p: PeriodWithTotals) =>
    `${nameOf(p.customer_id)}, ${formatDate(p.period_start)} – ${formatDate(p.period_end)}`

  async function onSubmitPeriod(period: PeriodWithTotals) {
    const ja = await confirm({
      title: 'Periode melden?',
      subject: bezeichne(period),
      body: 'Danach sind die Zeiten dieser Periode gesperrt und die Stundensätze eingefroren. '
          + 'Das lässt sich in der App nicht rückgängig machen.',
      confirmLabel: 'Periode melden',
      tone: 'primary',
    })
    if (!ja) return

    setActionError(null)
    try {
      await submit.mutateAsync(period.id)
    } catch (err) {
      setActionError(describeError(err))
    }
  }

  /**
   * Der Leistungsnachweis: dieselbe Datei wie auf der Exportseite, aber Kunde,
   * Zeitraum und Spaltenbild stehen schon fest - sie stehen an der Periode.
   *
   * Welches Profil das ist, steht im aufgeklappten Raster - und was dort steht,
   * steht auch in der Datei.
   *
   * Vorher hiess die Meldung eines Monats: auf die Exportseite wechseln, den
   * Zeitraum von Hand nachbauen, den Kunden waehlen, das Profil waehlen. Vier
   * Schritte, bei denen sich drei vertippen lassen, und jeder davon macht die
   * Datei still falsch.
   */
  async function onNachweis(period: PeriodWithTotals) {
    setActionError(null)
    setErzeugt(period.id)
    try {
      const [entries, expenses] = await Promise.all([
        qc.fetchQuery(periodEntriesQuery(period.id)),
        qc.fetchQuery(periodExpensesQuery(period.id)),
      ])
      if (entries.length === 0 && expenses.length === 0) {
        setActionError('Diese Periode enthält keine Positionen — es gibt nichts nachzuweisen.')
        return
      }

      const kunde = customers?.find((c) => c.id === period.customer_id)
      const profil = profilDerPeriode(profiles, period.customer_id, profilwahl[period.customer_id])
      // Die Tabellenbibliothek wiegt rund 330 kB und wird erst hier gebraucht.
      const { exportToExcel } = await import('@/features/export/writeExcel')
      await exportToExcel({
        rows: entries,
        expenses,
        columns: spaltenDerPeriode(profil),
        fileName: `Leistungsnachweis_${kunde?.code ?? 'Kunde'}`
          + `_${period.period_start}_bis_${period.period_end}.xlsx`,
        title: kunde?.name ?? 'Leistungsnachweis',
        kopf: {
          titel: 'Leistungsnachweis',
          zeilen: [
            { label: 'Kunde', wert: kunde?.name ?? '—' },
            { label: 'Zeitraum',
              wert: `${formatDate(period.period_start)} – ${formatDate(period.period_end)}` },
            { label: 'Stand', wert: standText(period) },
          ],
        },
      })
    } catch (err) {
      setActionError(describeError(err))
    } finally {
      setErzeugt(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Perioden"
        subtitle="Melden friert die Stundensätze ein und sperrt die Zeiten. Weist der Kunde etwas zurück, lässt sich die Meldung mit Grund zurücknehmen."
      />

      {error && <div className="mt-4"><ErrorNote message={describeError(error)} /></div>}
      {actionError && <div className="mt-4"><ErrorNote message={actionError} /></div>}

      {overdue.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            {overdue.length === 1
              ? 'Eine abgelaufene Periode ist noch nicht gemeldet'
              : `${overdue.length} abgelaufene Perioden sind noch nicht gemeldet`}
          </p>
          <p className="mt-0.5 text-sm text-amber-800">
            {overdue.slice(0, 3).map((p) =>
              `${nameOf(p.customer_id)} (${formatDate(p.period_start)} – ${formatDate(p.period_end)})`,
            ).join(' · ')}
            {overdue.length > 3 && ` und ${overdue.length - 3} weitere`}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          Kunde
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-56">
            <option value="">alle Kunden</option>
            {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)}
                 className="size-4 rounded border-ink-300" />
          nur offene
        </label>
      </div>

      <Card className="mt-4 overflow-hidden">
        {isPending ? (
          <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title={onlyOpen ? 'Keine offenen Perioden' : 'Noch keine Perioden'}
            hint="Perioden entstehen von selbst, sobald Zeiten erfasst werden — je nach Kunde wochen- oder monatsweise."
          />
        ) : (
          <ul>
            {visible.map((p) => {
              const isOpen = expanded === p.id
              const status = STATUS[p.status]
              // Einmal aufgeloest: Titel der Schaltflaeche, Spalten des Rasters
              // und Spalten der Datei muessen dasselbe Profil meinen.
              const kundenProfile = profileDesKunden(profiles, p.customer_id)
              const profil = profilDerPeriode(profiles, p.customer_id, profilwahl[p.customer_id])
              return (
                <li key={p.id} className="border-b border-ink-100 last:border-0">
                  {/* Auf schmalen Schirmen bekommen Name und Zeitraum die volle
                      Breite; Summen und Handlung ruecken darunter. Nebeneinander
                      blieb fuer den Kundennamen ein Wort je Zeile. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-ink-50/50">
                    <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:flex-1 sm:items-center">
                      <button onClick={() => setExpanded(isOpen ? null : p.id)}
                              aria-expanded={isOpen}
                              aria-label={isOpen ? 'Positionen einklappen' : 'Positionen anzeigen'}
                              className="mt-0.5 shrink-0 rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600 sm:mt-0">
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-800">{nameOf(p.customer_id)}</span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span className="text-xs text-ink-400">{CYCLE_LABEL[p.cycle]}</span>
                          {p.status === 'open' && p.period_end < today && p.entry_count > 0 && (
                            <Badge tone="warn">abgelaufen</Badge>
                          )}
                          {p.reopen_count > 0 && (
                            <Badge tone="warn">
                              {p.reopen_count === 1 ? 'wieder geöffnet' : `${p.reopen_count}× wieder geöffnet`}
                            </Badge>
                          )}
                        </div>
                        <p className="tabular text-sm text-ink-500">
                          {formatDate(p.period_start)} – {formatDate(p.period_end)}
                          {p.submitted_at && ` · gemeldet am ${formatDate(p.submitted_at.slice(0, 10))}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-7 sm:w-auto sm:justify-end sm:pl-0">
                    <dl className="flex gap-5 text-right">
                      <div>
                        <dt className="text-xs text-ink-400">Stunden</dt>
                        <dd className="tabular text-sm font-medium text-ink-800">
                          {minutesToHours(p.live_minutes)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-400">Honorar</dt>
                        <dd className="tabular text-sm font-medium text-ink-800">
                          {formatEuro(p.live_fees)}
                        </dd>
                      </div>
                    </dl>

                    {/* Der Nachweis steht neben der Handlung, nicht auf einer
                        anderen Seite: Kunde, Zeitraum und Spaltenbild stehen
                        hier bereits fest. */}
                    <Button size="sm" className="whitespace-nowrap"
                            disabled={p.entry_count === 0 || erzeugt === p.id}
                            title={profil
                              ? `Spalten aus dem Profil „${profil.name}“`
                              : kundenProfile.length > 0
                                ? 'Standardspalten — im aufgeklappten Raster steht die Auswahl'
                                : 'Spalten wie im Export voreingestellt — ein Profil mit diesem '
                                  + 'Kunden legt sie fest'}
                            onClick={() => void onNachweis(p)}>
                      <FileDown className="size-4" />
                      {erzeugt === p.id ? 'Wird erzeugt …' : 'Nachweis'}
                    </Button>

                    {p.status === 'open' ? (
                      <Button size="sm" variant="primary"
                              disabled={p.entry_count === 0 || submit.isPending}
                              onClick={() => void onSubmitPeriod(p)}>
                        <CheckCircle2 className="size-4" /> Periode melden
                      </Button>
                    ) : p.status === 'invoiced' ? (
                      // Dahinter haengt eine Rechnung. Wer hier noch umbuchen muss,
                      // storniert zuerst - das kann die App nicht fuer ihn tun.
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-400"
                            title="Abgerechnete Perioden lassen sich nicht wieder öffnen.">
                        <Lock className="size-3.5" /> abgerechnet
                      </span>
                    ) : (
                      <Button size="sm" className="whitespace-nowrap" onClick={() => setReopening(p)}>
                        <LockOpen className="size-4" /> Wieder öffnen
                      </Button>
                    )}
                    </div>
                  </div>

                  {isOpen && (
                    <>
                      <PeriodHistory periodId={p.id} />
                      <PeriodDetail
                        periodId={p.id}
                        spalten={spaltenDerPeriode(profil)}
                        auswahl={
                          <ProfilWahl
                            profile={kundenProfile}
                            wert={profil?.id ?? OHNE_PROFIL}
                            onWahl={(id) =>
                              setProfilwahl((w) => ({ ...w, [p.customer_id]: id }))}
                          />
                        }
                      />
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {reopening && (
        <ReopenDialog period={reopening} label={bezeichne(reopening)}
                      onClose={() => setReopening(null)} />
      )}
    </>
  )
}
