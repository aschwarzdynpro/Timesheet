import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorNote, Select } from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { useConfirm } from '@/components/ui/confirm'
import { CYCLE_LABEL, formatDate, formatEuro } from '@/lib/format'
import { minutesToHours, toIsoDate } from '@/lib/week'
import { useCustomers } from '@/features/customers/api'
import { usePeriodEntries, usePeriods, useSubmitPeriod, type PeriodWithTotals } from './api'

const STATUS = {
  open:      { label: 'offen',      tone: 'neutral' as const },
  submitted: { label: 'gemeldet',   tone: 'good' as const },
  approved:  { label: 'freigegeben', tone: 'good' as const },
  invoiced:  { label: 'abgerechnet', tone: 'muted' as const },
}

function PeriodDetail({ periodId }: { periodId: string }) {
  const { data: entries, isPending } = usePeriodEntries(periodId)

  if (isPending) return <p className="px-5 py-4 text-sm text-ink-400">Wird geladen …</p>
  if (!entries?.length) {
    return <p className="px-5 py-4 text-sm text-ink-400">Keine Einträge in dieser Periode.</p>
  }

  return (
    <div className="overflow-x-auto border-t border-ink-100 bg-ink-50/50">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
            <th className="px-5 py-2 font-semibold">Datum</th>
            <th className="px-5 py-2 font-semibold">Projekt</th>
            <th className="px-5 py-2 font-semibold">Beschreibung</th>
            <th className="px-5 py-2 text-right font-semibold">Std.</th>
            <th className="px-5 py-2 text-right font-semibold">Satz</th>
            <th className="px-5 py-2 text-right font-semibold">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-ink-100 last:border-0">
              <td className="tabular px-5 py-2 whitespace-nowrap text-ink-600">
                {formatDate(e.work_date)}
              </td>
              <td className="px-5 py-2 text-ink-700">
                {e.project_name}
                {e.activity_name && <span className="text-ink-400"> · {e.activity_name}</span>}
              </td>
              <td className="px-5 py-2 text-ink-600">{e.description}</td>
              <td className="tabular px-5 py-2 text-right text-ink-800">
                {minutesToHours(e.billable_minutes)}
              </td>
              <td className="tabular px-5 py-2 text-right text-ink-600">
                {e.rate !== null ? formatEuro(Number(e.rate)) : '–'}
                {e.rate_is_frozen && <Lock className="ml-1 inline size-3 text-ink-300" />}
              </td>
              <td className="tabular px-5 py-2 text-right font-medium text-ink-800">
                {formatEuro(Number(e.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PeriodsPage() {
  const { data: periods, isPending, error } = usePeriods()
  const { data: customers } = useCustomers()
  const submit = useSubmitPeriod()
  const confirm = useConfirm()

  const [customerId, setCustomerId] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  async function onSubmitPeriod(period: PeriodWithTotals) {
    const ja = await confirm({
      title: 'Periode melden?',
      subject: `${nameOf(period.customer_id)}, ${formatDate(period.period_start)} – ${formatDate(period.period_end)}`,
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

  return (
    <>
      <PageHeader
        title="Perioden"
        subtitle="Melden friert die Stundensätze ein und sperrt die Zeiten. Ab dann steht fest, was der Kunde bekommen hat."
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
              return (
                <li key={p.id} className="border-b border-ink-100 last:border-0">
                  <div className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-ink-50/50">
                    <button onClick={() => setExpanded(isOpen ? null : p.id)}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Positionen einklappen' : 'Positionen anzeigen'}
                            className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600">
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
                      </div>
                      <p className="tabular text-sm text-ink-500">
                        {formatDate(p.period_start)} – {formatDate(p.period_end)}
                        {p.submitted_at && ` · gemeldet am ${formatDate(p.submitted_at.slice(0, 10))}`}
                      </p>
                    </div>

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

                    {p.status === 'open' ? (
                      <Button size="sm" variant="primary"
                              disabled={p.entry_count === 0 || submit.isPending}
                              onClick={() => void onSubmitPeriod(p)}>
                        <CheckCircle2 className="size-4" /> Periode melden
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
                        <Lock className="size-3.5" /> gesperrt
                      </span>
                    )}
                  </div>

                  {isOpen && <PeriodDetail periodId={p.id} />}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
