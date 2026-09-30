import { useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
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
import { gliedereMonat, verschiebeMonat, type KundeImMonat } from './monat'

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
        gliederung, monat,
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_16rem]">
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
          {gliederung.kunden.map((k) => <KundenKarte key={k.summe.customer_id} kunde={k} />)}

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

function KundenKarte({ kunde }: { kunde: KundeImMonat }) {
  const { summe, projekte } = kunde
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
            <th className="px-5 py-2.5 font-semibold">Projekt</th>
            <th className="px-5 py-2.5 text-right font-semibold lg:w-36">Stunden</th>
            <th className="px-5 py-2.5 text-right font-semibold lg:w-40">Ø Satz</th>
            <th className="px-5 py-2.5 text-right font-semibold lg:w-40">Umsatz</th>
          </tr>
        </thead>
        <tbody>
          {projekte.map((p) => (
            <tr key={p.project_id} className="border-b border-ink-100">
              <td className="px-5 py-2.5">
                <span className="block break-words text-ink-800">{p.project_name}</span>
                <span className="block font-mono text-xs text-ink-500">{p.project_code}</span>
              </td>
              <td className="tabular px-5 py-2.5 text-right whitespace-nowrap text-ink-800">
                {minutesToHours(p.minutes_billable)} h
              </td>
              <td className="tabular px-5 py-2.5 text-right whitespace-nowrap text-ink-600"><Satz zeile={p} /></td>
              <td className="tabular px-5 py-2.5 text-right whitespace-nowrap text-ink-800">{formatEuro(p.fees)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink-200 bg-ink-50 font-semibold text-ink-800">
            <td className="px-5 py-2.5 break-words">Summe {summe.customer_name}</td>
            <td className="tabular px-5 py-2.5 text-right whitespace-nowrap">{minutesToHours(summe.minutes_billable)} h</td>
            <td className="tabular px-5 py-2.5 text-right whitespace-nowrap font-normal text-ink-600"><Satz zeile={summe} /></td>
            <td className="tabular px-5 py-2.5 text-right whitespace-nowrap">{formatEuro(summe.fees)}</td>
          </tr>
        </tfoot>
      </table>

      <MobileList>
        {projekte.map((p) => (
          <MobileListItem
            key={p.project_id}
            code={p.project_code ?? ''}
            name={p.project_name ?? ''}
            zeilen={[
              <span className="tabular">
                {minutesToHours(p.minutes_billable)} h · Ø <Satz zeile={p} />
              </span>,
              <span className="tabular font-medium text-ink-800">{formatEuro(p.fees)}</span>,
            ]}
          />
        ))}
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
