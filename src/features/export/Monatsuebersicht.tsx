import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, ErrorNote, Field, Select, WarnNote,
} from '@/components/ui/primitives'
import { MobileList, MobileListItem } from '@/components/ui/MobileList'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatEuro, formatMonth, formatRate, today } from '@/lib/format'
import { minutesToHours, monthStartOf } from '@/lib/week'
import { useCustomers } from '@/features/customers/api'
import { useBillingMonth, type BillingRow } from './api'
import {
  gliedereMonat, hatPakete, verschiebeMonat, type KundeImMonat, type ProjektImMonat,
} from './monat'

/**
 * Stunden und Umsatz eines Leistungsmonats je Projekt und je Kunde - die
 * Grundlage fuer die Rechnung.
 *
 * Gezaehlt wird nur abrechenbare Zeit, nach dem Tag der Leistung. Der
 * Durchschnittssatz ist ein Quercheck: Steht dort ein anderer Wert als im
 * Vertrag, ist irgendwo ein Satz falsch gepflegt, bevor die Rechnung rausgeht.
 */
export function Monatsuebersicht({ umschalter }: { umschalter: ReactNode }) {
  const { data: customers } = useCustomers()
  // Abgerechnet wird der abgeschlossene Monat - deshalb steht der Vormonat vorn.
  const [monat, setMonat] = useState(() => verschiebeMonat(monthStartOf(today()), -1))
  const [customerId, setCustomerId] = useState('')
  // Die Arbeitspakete sind eine Dimension zum Nachsehen, nicht Teil der
  // Rechnung - deshalb aus, bis man sie braucht.
  const [mitPaketen, setMitPaketen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = useBillingMonth(monat)
  const gliederung = useMemo(() => gliedereMonat(rows.data ?? [], customerId), [rows.data, customerId])
  const kunde = customers?.find((c) => c.id === customerId)

  async function onExport() {
    if (gliederung.kunden.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const { exportBillingToExcel } = await import('./writeBillingExcel')
      await exportBillingToExcel({
        gliederung, monat, mitPaketen,
        fileName: `Monatsuebersicht_${kunde?.code ?? 'Alle'}_${monat.slice(0, 7)}.xlsx`,
      })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Export"
        subtitle="Stunden und Umsatz je Projekt und Kunde für einen Leistungsmonat — die Grundlage für die Rechnung."
        action={
          <Button variant="primary" disabled={busy || gliederung.kunden.length === 0}
                  onClick={() => void onExport()}>
            <Download className="size-4" />
            {busy ? 'Wird erzeugt …' : 'Excel erzeugen'}
          </Button>
        }
      />

      <div className="mt-4">{umschalter}</div>

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {rows.error && <div className="mt-4"><ErrorNote message={describeError(rows.error)} /></div>}

      <Card className="mt-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_16rem_auto]">
          <Field label="Leistungsmonat">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" aria-label="Vormonat"
                      onClick={() => setMonat((m) => verschiebeMonat(m, -1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium text-ink-800" aria-live="polite">
                {formatMonth(monat)}
              </span>
              <Button size="sm" variant="ghost" aria-label="Folgemonat"
                      onClick={() => setMonat((m) => verschiebeMonat(m, 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </Field>
          <Field label="Kunde">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">alle Kunden</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <label className="flex h-9 items-center gap-2 self-end text-sm text-ink-700 sm:col-span-2 lg:col-span-1">
            <input type="checkbox" checked={mitPaketen}
                   onChange={(e) => setMitPaketen(e.target.checked)}
                   className="size-4 rounded border-ink-300" />
            Arbeitspakete aufschlüsseln
          </label>
        </div>
      </Card>

      {rows.isPending ? (
        <Card className="mt-3"><p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p></Card>
      ) : gliederung.kunden.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            title={`Im ${formatMonth(monat)} ist ${kunde ? `für ${kunde.name} ` : ''}nichts Abrechenbares erfasst`}
            hint="Eine Rechnung über 0,00 € wäre keine. Interne Zeit zählt hier nicht mit."
          />
        </Card>
      ) : (
        <>
          {gliederung.kunden.map((k) => <KundenKarte key={k.summe.customer_id} kunde={k} mitPaketen={mitPaketen} />)}

          {/* Die Gesamtsumme nur, wenn sie etwas anderes sagt als die eine Karte darueber. */}
          {gliederung.gesamt && gliederung.kunden.length > 1 && (
            <Card className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4">
              <h2 className="text-sm font-semibold text-ink-700">Gesamt {formatMonth(monat)}</h2>
              <p className="tabular flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-ink-800">{minutesToHours(gliederung.gesamt.minutes_billable)} h</span>
                <span className="font-semibold text-ink-800">{formatEuro(gliederung.gesamt.fees)}</span>
              </p>
            </Card>
          )}
        </>
      )}

      <p className="mt-3 text-xs text-ink-400">
        Gezählt wird abrechenbare Zeit nach dem Tag der Leistung. Ø Satz ist Umsatz ÷ Stunden
        mit gültigem Satz — ein Quercheck gegen den Vertrag, kein Rechnungsposten.
      </p>
    </>
  )
}

function KundenKarte({ kunde, mitPaketen }: { kunde: KundeImMonat; mitPaketen: boolean }) {
  const { summe, projekte } = kunde
  // Aufgeklappt wird je Projekt; ohne Schalter bleibt alles zu, damit die
  // Karte die Rechnung zeigt und nicht die Buchungsdetails.
  const [offen, setOffen] = useState<Set<string>>(() => new Set())
  const umschalten = (id: string) => setOffen((alt) => {
    const neu = new Set(alt)
    if (neu.has(id)) neu.delete(id)
    else neu.add(id)
    return neu
  })
  const istOffen = (p: ProjektImMonat) => mitPaketen && offen.has(p.summe.project_id ?? '')
  const aufklappbar = (p: ProjektImMonat) => mitPaketen && hatPakete(p)

  return (
    <Card className="mt-3 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 px-5 py-3">
        <h2 className="min-w-0 text-sm font-semibold break-words text-ink-700">{summe.customer_name}</h2>
        <span className="font-mono text-xs font-semibold text-ink-500">{summe.customer_code}</span>
      </div>

      <Hinweise summe={summe} />

      {/* Feste Spaltenbreiten, sobald Platz ist: sonst stuenden die Zahlen
          jeder Kundenkarte an einer anderen Stelle, und der Blick von Karte zu
          Karte springt. Schmaler bliebe dem Projektnamen zu wenig. */}
      <table className="hidden w-full text-sm sm:table lg:table-fixed">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
            <th className="px-5 py-2.5 font-semibold">{mitPaketen ? 'Projekt / Arbeitspaket' : 'Projekt'}</th>
            <th className="px-3 py-2.5 text-right font-semibold lg:px-5 lg:w-36">Stunden</th>
            <th className="px-3 py-2.5 text-right font-semibold lg:px-5 lg:w-40">Ø Satz</th>
            <th className="px-3 py-2.5 text-right font-semibold lg:px-5 lg:w-40">Umsatz</th>
          </tr>
        </thead>
        <tbody>
          {projekte.map((projekt) => {
            const p = projekt.summe
            return (
              <Fragment key={p.project_id}>
                <tr className="border-b border-ink-100">
                  <td className="px-5 py-2.5">
                    <ProjektName projekt={projekt} aufklappbar={aufklappbar(projekt)} einzug={mitPaketen}
                                 offen={istOffen(projekt)} onToggle={umschalten} />
                  </td>
                  <td className="tabular px-3 py-2.5 text-right lg:px-5 whitespace-nowrap text-ink-800">
                    {minutesToHours(p.minutes_billable)} h
                  </td>
                  <td className="tabular px-3 py-2.5 text-right lg:px-5 whitespace-nowrap text-ink-600"><Satz zeile={p} /></td>
                  <td className="tabular px-3 py-2.5 text-right lg:px-5 whitespace-nowrap text-ink-800">{formatEuro(p.fees)}</td>
                </tr>
                {istOffen(projekt) && projekt.pakete.map((ap) => (
                  <tr key={ap.work_package_id ?? 'ohne'} className="border-b border-ink-100 bg-ink-50/60">
                    <td className="py-2 pr-3 pl-14 lg:pr-5 lg:pl-16">
                      <PaketName paket={ap} />
                    </td>
                    <td className="tabular px-3 py-2 text-right lg:px-5 whitespace-nowrap text-ink-700">
                      {minutesToHours(ap.minutes_billable)} h
                    </td>
                    <td className="tabular px-3 py-2 text-right lg:px-5 whitespace-nowrap text-ink-600"><Satz zeile={ap} /></td>
                    <td className="tabular px-3 py-2 text-right lg:px-5 whitespace-nowrap text-ink-700">{formatEuro(ap.fees)}</td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink-200 bg-ink-50 font-semibold text-ink-800">
            <td className="px-5 py-2.5 break-words">Summe {summe.customer_name}</td>
            <td className="tabular px-3 py-2.5 text-right lg:px-5 whitespace-nowrap">{minutesToHours(summe.minutes_billable)} h</td>
            <td className="tabular px-3 py-2.5 text-right lg:px-5 whitespace-nowrap font-normal text-ink-600"><Satz zeile={summe} /></td>
            <td className="tabular px-3 py-2.5 text-right lg:px-5 whitespace-nowrap">{formatEuro(summe.fees)}</td>
          </tr>
        </tfoot>
      </table>

      <MobileList>
        {projekte.map((projekt) => {
          const p = projekt.summe
          return (
            <Fragment key={p.project_id}>
              <MobileListItem
                code={p.project_code ?? ''}
                name={p.project_name ?? ''}
                zeilen={[
                  <span className="tabular">
                    {minutesToHours(p.minutes_billable)} h · Ø <Satz zeile={p} />
                  </span>,
                  <span className="tabular font-medium text-ink-800">{formatEuro(p.fees)}</span>,
                ]}
                aktionen={aufklappbar(projekt) && (
                  <AufklappKnopf offen={istOffen(projekt)} name={p.project_name ?? ''}
                                 onClick={() => umschalten(p.project_id ?? '')} />
                )}
              />
              {istOffen(projekt) && projekt.pakete.map((ap) => (
                <li key={ap.work_package_id ?? 'ohne'} className="bg-ink-50/60 py-2.5 pr-4 pl-8 text-sm">
                  <PaketName paket={ap} />
                  <p className="tabular mt-1 flex flex-wrap gap-x-4 text-xs text-ink-600">
                    <span>{minutesToHours(ap.minutes_billable)} h</span>
                    <span>Ø <Satz zeile={ap} /></span>
                    <span className="font-medium text-ink-800">{formatEuro(ap.fees)}</span>
                  </p>
                </li>
              ))}
            </Fragment>
          )
        })}
        <li className="bg-ink-50 px-4 py-3 text-sm">
          <p className="font-semibold break-words text-ink-800">Summe {summe.customer_name}</p>
          <p className="tabular mt-1 flex flex-wrap gap-x-4 text-ink-800">
            <span>{minutesToHours(summe.minutes_billable)} h</span>
            <span className="text-ink-600">Ø <Satz zeile={summe} /></span>
            <span className="font-semibold">{formatEuro(summe.fees)}</span>
          </p>
        </li>
      </MobileList>
    </Card>
  )
}

function ProjektName({ projekt, aufklappbar, einzug, offen, onToggle }: {
  projekt: ProjektImMonat
  aufklappbar: boolean
  /** Platz fuer den Pfeil, auch wo keiner steht - sobald irgendwo einer steht. */
  einzug: boolean
  offen: boolean
  onToggle: (id: string) => void
}) {
  const p = projekt.summe
  const name = (
    <span className="min-w-0">
      <span className="block break-words text-ink-800">{p.project_name}</span>
      <span className="block font-mono text-xs text-ink-500">{p.project_code}</span>
    </span>
  )
  if (!aufklappbar) {
    // Gleicher Einzug wie mit Pfeil, damit die Namen untereinander fluchten,
    // sobald der Schalter an ist.
    return (
      <div className="flex items-start gap-1.5">
        {einzug && <span className="size-4 shrink-0" aria-hidden />}
        {name}
      </div>
    )
  }
  return (
    <button type="button" onClick={() => onToggle(p.project_id ?? '')} aria-expanded={offen}
            className="-ml-1 flex items-start gap-1.5 rounded px-1 text-left hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-accent-500">
      {offen
        ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
        : <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />}
      {name}
      <span className="sr-only">{offen ? 'Arbeitspakete zuklappen' : 'Arbeitspakete aufklappen'}</span>
    </button>
  )
}

function PaketName({ paket }: { paket: BillingRow }) {
  if (paket.work_package_id === null) {
    return <span className="block text-ink-600 italic">ohne Arbeitspaket</span>
  }
  return (
    <span className="block min-w-0">
      <span className="block break-words text-ink-700">{paket.work_package_name}</span>
      <span className="block font-mono text-xs text-ink-500">{paket.work_package_code}</span>
    </span>
  )
}

function AufklappKnopf({ offen, name, onClick }: { offen: boolean; name: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} aria-expanded={offen}
            aria-label={`${offen ? 'Arbeitspakete zuklappen' : 'Arbeitspakete aufklappen'}: ${name}`}>
      {offen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
    </Button>
  )
}

/** Der Durchschnittssatz - oder der Hinweis, dass fuer die Zeit keiner gilt. */
function Satz({ zeile }: { zeile: BillingRow }) {
  if (zeile.avg_rate === null) return <Badge tone="warn">kein Satz</Badge>
  return <>{formatRate(Number(zeile.avg_rate))}</>
}

/**
 * Was vor dem Rechnungsversand zu klaeren ist: noch nicht gemeldete Perioden
 * und Zeit ohne Satz. Beides aendert die Rechnung, wenn es spaeter auffaellt.
 */
function Hinweise({ summe }: { summe: BillingRow }) {
  if (summe.open_periods === 0 && summe.minutes_without_rate === 0) return null
  return (
    <div className="space-y-2 border-b border-ink-100 px-5 py-3">
      {summe.open_periods > 0 && (
        <WarnNote>
          {summe.open_periods === 1
            ? '1 Meldeperiode mit Zeiten aus diesem Monat ist noch nicht gemeldet'
            : `${summe.open_periods} Meldeperioden mit Zeiten aus diesem Monat sind noch nicht gemeldet`}
          {' '}— solange sie offen sind, können sich Stunden und Umsatz noch ändern.{' '}
          <Link to="/perioden" className="font-medium underline">Zu den Perioden</Link>
        </WarnNote>
      )}
      {summe.minutes_without_rate > 0 && (
        <WarnNote>
          {minutesToHours(summe.minutes_without_rate)} h ohne gültigen Stundensatz — sie stehen mit
          0,00 € im Umsatz. Satz im Projekt nachtragen, sonst fehlt der Betrag auf der Rechnung.
        </WarnNote>
      )}
    </div>
  )
}
