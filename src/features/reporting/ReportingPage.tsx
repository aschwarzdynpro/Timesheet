import { useMemo, useState } from 'react'
import { Card, EmptyState, ErrorNote, Select } from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { BudgetBadge } from '@/components/ui/BudgetBadge'
import { describeError } from '@/lib/supabase'
import { formatEuro, formatPercent, sumOrNull } from '@/lib/format'
import { minutesToHours } from '@/lib/week'
import { useCustomers } from '@/features/customers/api'
import { useProjects } from '@/features/projects/api'
import { useIncomeTaxPercent } from '@/features/account/api'
import { RankChart, TrendChart, type RankPoint, type TrendPoint } from './charts'
import { useTargetMinutes, useTrend, useYears, type Resolution } from './api'

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
                     'September', 'Oktober', 'November', 'Dezember']

/** Kennzahl mit grosser Zahl – nur dort, wo die Zahl selbst die Aussage ist. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold text-ink-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

export function ReportingPage() {
  const years = useYears()
  const { data: customers } = useCustomers()
  const { data: projects } = useProjects()

  const availableYears = useMemo(() => {
    const set = new Set((years.data ?? []).map((r) => r.year))
    set.add(new Date().getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [years.data])

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [resolution, setResolution] = useState<Resolution>('month')
  const [customerId, setCustomerId] = useState('')

  const trend = useTrend(year, resolution)
  const target = useTargetMinutes(`${year}-01-01`, `${year}-12-31`)
  // Nur fuer den Hinweis unter der Zahl - abgezogen hat die Sicht den Satz schon.
  const steuersatz = useIncomeTaxPercent()

  const rows = useMemo(
    () => (trend.data ?? []).filter((r) => !customerId || r.customer_id === customerId),
    [trend.data, customerId],
  )

  const totals = useMemo(() => {
    const tracked = rows.reduce((n, r) => n + Number(r.minutes_tracked ?? 0), 0)
    const billable = rows.reduce((n, r) => n + Number(r.minutes_billable ?? 0), 0)
    const fees = rows.reduce((n, r) => n + Number(r.fees ?? 0), 0)
    // Der Betrag nach Steuern steht fertig in der Sicht: den Steuersatz zieht
    // die Datenbank ab, damit hier dieselbe Zahl steht wie in der
    // Wochenuebersicht. Fehlt die Spalte, bleibt sie offen statt bei 0,00 EUR.
    const feesNet = sumOrNull(rows.map((r) => r.fees_net))
    return {
      tracked, billable, fees, feesNet,
      // Der Satz, den du tatsaechlich erloest: Honorar geteilt durch die
      // Stunden, die du wirklich gearbeitet hast - nicht durch die berechneten.
      realised: tracked > 0 ? fees / (tracked / 60) : null,
      utilisation: (target.data ?? 0) > 0 ? billable / (target.data as number) : null,
    }
  }, [rows, target.data])

  /** Verlauf: je Zeitschritt eine Saeule, aufgeteilt in abrechenbar und intern. */
  const trendPoints: TrendPoint[] = useMemo(() => {
    const buckets = new Map<string, TrendPoint>()
    if (resolution === 'month') {
      for (let m = 0; m < 12; m++) {
        buckets.set(`${year}-${String(m + 1).padStart(2, '0')}-01`,
                    { label: MONTHS[m]!, full: `${MONTHS_LONG[m]} ${year}`,
                      billable: 0, internal: 0, fees: 0 })
      }
    }
    for (const row of rows) {
      const key = 'week_start' in row ? row.week_start : row.month_start
      const point = buckets.get(key) ?? {
        label: 'week_start' in row ? `${row.iso_week}` : MONTHS[new Date(key).getMonth()]!,
        full: 'week_start' in row ? `KW ${row.iso_week} / ${row.iso_year}` : key,
        billable: 0, internal: 0, fees: 0,
      }
      point.billable += Number(row.minutes_billable ?? 0) / 60
      point.internal += Number(row.minutes_internal ?? 0) / 60
      point.fees += Number(row.fees ?? 0)
      buckets.set(key, point)
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }, [rows, resolution, year])

  /** Honorar je Kunde, absteigend. */
  const byCustomer: RankPoint[] = useMemo(() => {
    const map = new Map<string, { name: string; fees: number }>()
    for (const r of rows) {
      const entry = map.get(r.customer_id) ?? { name: r.customer_name, fees: 0 }
      entry.fees += Number(r.fees ?? 0)
      map.set(r.customer_id, entry)
    }
    return [...map.values()]
      .filter((c) => c.fees > 0)
      .sort((a, b) => b.fees - a.fees)
      .map((c) => ({ label: c.name, value: c.fees, formatted: formatEuro(c.fees) }))
  }, [rows])

  /** Je Projekt: Stunden, Honorar und Budgetstand. */
  const byProject = useMemo(() => {
    const map = new Map<string, {
      name: string; customer: string; tracked: number; billable: number; fees: number
    }>()
    for (const r of rows) {
      const entry = map.get(r.project_id) ??
        { name: r.project_name, customer: r.customer_name, tracked: 0, billable: 0, fees: 0 }
      entry.tracked += Number(r.minutes_tracked ?? 0)
      entry.billable += Number(r.minutes_billable ?? 0)
      entry.fees += Number(r.fees ?? 0)
      map.set(r.project_id, entry)
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v, project: projects?.find((p) => p.id === id) }))
      .sort((a, b) => b.fees - a.fees)
  }, [rows, projects])

  const error = years.error ?? trend.error
  const hasData = rows.length > 0

  return (
    <>
      <PageHeader
        title="Auswertungen"
        subtitle="Alle Zahlen stammen aus den Sichten der Datenbank — dieselbe Bewertung, die auch im Export und in der Kundenmeldung steht."
      />

      {error && <div className="mt-4"><ErrorNote message={describeError(error)} /></div>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          Jahr
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24">
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          Auflösung
          <Select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}
                  className="w-32">
            <option value="month">Monat</option>
            <option value="week">Woche</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          Kunde
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-56">
            <option value="">alle Kunden</option>
            {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
      </div>

      {trend.isPending ? (
        <Card className="mt-4"><p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p></Card>
      ) : !hasData ? (
        <Card className="mt-4">
          <EmptyState
            title={`Für ${year} ist nichts erfasst`}
            hint="Sobald Zeiten erfasst sind, erscheinen hier Verlauf, Honorar je Kunde und der Budgetstand."
          />
        </Card>
      ) : (
        <>
          <Card className="mt-4 grid divide-y divide-ink-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
            <Stat label="Erfasst" value={`${minutesToHours(totals.tracked)} h`} />
            <Stat label="Abrechenbar" value={`${minutesToHours(totals.billable)} h`}
                  hint={totals.tracked > 0
                    ? `${Math.round((totals.billable / totals.tracked) * 100)} % der erfassten Zeit`
                    : undefined} />
            <Stat label="Honorar" value={formatEuro(totals.fees)} />
            <Stat
              label="Nach Steuern"
              value={formatEuro(totals.feesNet)}
              hint={steuersatz.data !== undefined && totals.feesNet !== null
                ? `Honorar abzüglich ${formatPercent(steuersatz.data)} Einkommensteuer`
                : undefined}
            />
            <Stat
              label="Ø realisierter Satz"
              value={totals.realised !== null ? `${formatEuro(totals.realised)} / h` : '–'}
              hint="Honorar ÷ erfasste Stunden"
            />
          </Card>

          {totals.utilisation !== null && (
            <Card className="mt-3 px-5 py-4">
              <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">Auslastung</p>
              <p className="tabular mt-1 text-2xl font-semibold text-ink-800">
                {Math.round(totals.utilisation * 100)} %
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                abrechenbare Stunden ÷ Sollarbeitszeit ({minutesToHours(target.data ?? 0)} h)
              </p>
            </Card>
          )}

          <Card className="mt-3 p-5">
            <h2 className="mb-1 text-sm font-semibold text-ink-700">
              Stunden und Honorar je {resolution === 'month' ? 'Monat' : 'Kalenderwoche'}
            </h2>
            <p className="mb-3 text-xs text-ink-400">
              Erfasste Zeit, aufgeteilt in abrechenbar und intern — darunter das daraus
              bewertete Honorar. Zwei Felder statt zweier Achsen in einem: Stunden und Euro
              haben keinen gemeinsamen Maßstab, und wo beide auseinandergehen, steckt der
              Stundensatz dahinter, nicht die Skalierung.
            </p>
            <TrendChart points={trendPoints} unit="h" />
          </Card>

          <Card className="mt-3 p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-700">Honorar je Kunde</h2>
            <RankChart points={byCustomer} />
          </Card>

          <Card className="mt-3 overflow-hidden">
            <h2 className="border-b border-ink-100 px-5 py-3 text-sm font-semibold text-ink-700">
              Je Projekt
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
                    <th className="px-5 py-2.5 font-semibold">Projekt</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Erfasst</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Abrechenbar</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Honorar</th>
                    <th className="px-5 py-2.5 font-semibold">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.id} className="border-b border-ink-100 last:border-0">
                      <td className="px-5 py-2.5">
                        <span className="block text-ink-800">{p.name}</span>
                        <span className="block text-xs text-ink-400">{p.customer}</span>
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-600">
                        {minutesToHours(p.tracked)} h
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-ink-800">
                        {minutesToHours(p.billable)} h
                      </td>
                      <td className="tabular px-5 py-2.5 text-right font-medium text-ink-800">
                        {formatEuro(p.fees)}
                      </td>
                      <td className="px-5 py-2.5">
                        {p.project?.budget_hours
                          ? <BudgetBadge used={p.tracked / 60} budget={Number(p.project.budget_hours)} />
                          : p.project?.budget_amount
                            ? <BudgetBadge used={p.fees} budget={Number(p.project.budget_amount)} />
                            : <span className="text-xs text-ink-300">kein Budget</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-ink-100 px-5 py-2 text-xs text-ink-400">
              Der Budgetstand bezieht sich auf das gewählte Jahr.
            </p>
          </Card>
        </>
      )}
    </>
  )
}
