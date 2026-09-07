import { useMemo, useState } from 'react'
import { ExternalLink, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorNote, Input } from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import { formatDate, formatEuro } from '@/lib/format'
import { toIsoDate } from '@/lib/week'
import { useProjects } from '@/features/projects/api'
import { ExpenseDialog } from './ExpenseDialog'
import { useDeleteExpense, useExpenseCategories, useExpenses, useReceiptUrl } from './api'
import type { ExpenseFull } from '@/types/database'

/** Beleg in neuem Fenster oeffnen – die Adresse gilt nur fuenf Minuten. */
function ReceiptLink({ path }: { path: string }) {
  const { data: url, isFetching } = useReceiptUrl(path)
  if (isFetching) return <span className="text-xs text-ink-400">…</span>
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer"
       className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline">
      <Paperclip className="size-3.5" /> Beleg <ExternalLink className="size-3" />
    </a>
  )
}

function monthStart(offset = 0): string {
  const n = new Date()
  return toIsoDate(new Date(n.getFullYear(), n.getMonth() + offset, 1))
}
function monthEnd(offset = 0): string {
  const n = new Date()
  return toIsoDate(new Date(n.getFullYear(), n.getMonth() + offset + 1, 0))
}

export function ExpensesPage() {
  const [from, setFrom] = useState(monthStart(-1))
  const [to, setTo] = useState(monthEnd(0))
  const [dialog, setDialog] = useState<{ open: boolean; expense: ExpenseFull | null }>({
    open: false, expense: null,
  })
  const [error, setError] = useState<string | null>(null)

  const { data: expenses, isPending, error: loadError } = useExpenses(from, to)
  const { data: categories } = useExpenseCategories()
  const { data: projects } = useProjects()
  const remove = useDeleteExpense()
  const confirm = useConfirm()

  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => p.status === 'active'),
    [projects],
  )

  const totals = useMemo(() => {
    const list = expenses ?? []
    return {
      net: list.reduce((n, e) => n + Number(e.amount_net), 0),
      recharged: list.filter((e) => e.is_rechargeable)
                     .reduce((n, e) => n + Number(e.amount_recharged), 0),
      own: list.filter((e) => !e.is_rechargeable).reduce((n, e) => n + Number(e.amount_net), 0),
    }
  }, [expenses])

  async function onDelete(expense: ExpenseFull) {
    if (!await confirm(loeschFrage('Spese', expense.description))) return
    setError(null)
    try {
      await remove.mutateAsync({ id: expense.id, receiptPath: expense.receipt_path })
    } catch (err) {
      setError(describeError(err))
    }
  }

  const noCategories = (categories?.length ?? 0) === 0

  return (
    <>
      <PageHeader
        title="Spesen"
        subtitle="Belege und Pauschalen. Sie laufen durch dieselbe Periode und Sperre wie die Zeiten."
        action={
          <Button variant="primary" disabled={noCategories || activeProjects.length === 0}
                  onClick={() => setDialog({ open: true, expense: null })}>
            <Plus className="size-4" /> Neue Spese
          </Button>
        }
      />

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {loadError && <div className="mt-4"><ErrorNote message={describeError(loadError)} /></div>}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
          <span className="mb-1 block">Von</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </label>
        <label className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
          <span className="mb-1 block">Bis</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </label>
        <dl className="ml-auto flex flex-wrap gap-5 text-right">
          <div>
            <dt className="text-xs text-ink-400">Ausgelegt</dt>
            <dd className="tabular text-sm font-semibold text-ink-800">{formatEuro(totals.net)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Weiterberechnet</dt>
            <dd className="tabular text-sm font-semibold text-ink-800">
              {formatEuro(totals.recharged)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Bleibt bei mir</dt>
            <dd className="tabular text-sm font-semibold text-ink-800">{formatEuro(totals.own)}</dd>
          </div>
        </dl>
      </div>

      <Card className="mt-4 overflow-hidden">
        {noCategories ? (
          <EmptyState
            title="Zuerst Spesenarten anlegen"
            hint="Eine Spesenart legt fest, ob ein Beleg erfasst wird oder eine Pauschale aus Menge mal Satz — etwa Kilometergeld."
          />
        ) : isPending ? (
          <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
        ) : !expenses?.length ? (
          <EmptyState title="Keine Spesen im Zeitraum"
                      hint="Unterwegs geht das am schnellsten über das Belegfoto." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
                  <th className="px-5 py-2.5 font-semibold">Datum</th>
                  <th className="px-5 py-2.5 font-semibold">Art</th>
                  <th className="px-5 py-2.5 font-semibold">Projekt</th>
                  <th className="px-5 py-2.5 font-semibold">Beschreibung</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Betrag</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Weiterberechnet</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/50">
                    <td className="tabular px-5 py-2.5 whitespace-nowrap text-ink-600">
                      {formatDate(e.expense_date)}
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className="text-ink-700">{e.category_name}</span>
                      {e.quantity !== null && e.unit_rate !== null && (
                        <span className="tabular block text-xs text-ink-400">
                          {e.quantity} × {formatEuro(Number(e.unit_rate))}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="block text-ink-700">{e.project_name}</span>
                      <span className="block text-xs text-ink-400">{e.customer_name}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="block text-ink-700">{e.description}</span>
                      {e.receipt_path && <ReceiptLink path={e.receipt_path} />}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right text-ink-800">
                      {formatEuro(Number(e.amount_net))}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right">
                      {e.is_rechargeable ? (
                        <span className="font-medium text-ink-800">
                          {formatEuro(Number(e.amount_recharged))}
                          {Number(e.markup_percent) > 0 && (
                            <span className="block text-xs font-normal text-ink-400">
                              +{e.markup_percent} %
                            </span>
                          )}
                        </span>
                      ) : (
                        <Badge tone="muted">eigene Kosten</Badge>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {e.status === 'draft' ? (
                        <>
                          <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                                  onClick={() => setDialog({ open: true, expense: e })}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Löschen"
                                  onClick={() => void onDelete(e)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-ink-400">gemeldet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ExpenseDialog
        open={dialog.open}
        expense={dialog.expense}
        projects={activeProjects}
        categories={categories ?? []}
        onClose={() => setDialog({ open: false, expense: null })}
      />
    </>
  )
}
