import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorNote } from '@/components/ui/primitives'
import { CYCLE_LABEL, ROUNDING_LABEL, WEEK_START_SHORT } from '@/lib/format'
import { describeError } from '@/lib/supabase'
import type { Customer } from '@/types/database'
import { PageHeader } from '@/components/PageHeader'
import { CustomerDialog } from './CustomerDialog'
import { useCustomers, useDeleteCustomer } from './api'

export function CustomersPage() {
  const { data: customers, isPending, error } = useCustomers()
  const remove = useDeleteCustomer()
  const [dialog, setDialog] = useState<{ open: boolean; customer: Customer | null }>({
    open: false, customer: null,
  })
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function onDelete(customer: Customer) {
    if (!confirm(`Kunde „${customer.name}" wirklich löschen?`)) return
    setRemoveError(null)
    try {
      await remove.mutateAsync(customer.id)
    } catch (err) {
      setRemoveError(describeError(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Kunden"
        subtitle="Meldungsrhythmus und Rundung werden hier gepflegt und von Projekten geerbt."
        action={
          <Button variant="primary" onClick={() => setDialog({ open: true, customer: null })}>
            <Plus className="size-4" /> Neuer Kunde
          </Button>
        }
      />

      {error && <ErrorNote message={describeError(error)} />}
      {removeError && <ErrorNote message={removeError} />}

      <Card className="mt-4 overflow-hidden">
        {isPending ? (
          <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
        ) : !customers?.length ? (
          <EmptyState
            title="Noch keine Kunden"
            hint="Ein Kunde ist der Ausgangspunkt: Projekte, Sätze und Meldeperioden hängen daran."
            action={
              <Button variant="primary" onClick={() => setDialog({ open: true, customer: null })}>
                Ersten Kunden anlegen
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
                  <th className="px-5 py-2.5 font-semibold">Kürzel</th>
                  <th className="px-5 py-2.5 font-semibold">Name</th>
                  <th className="px-5 py-2.5 font-semibold">Meldung</th>
                  <th className="px-5 py-2.5 font-semibold">Rundung</th>
                  <th className="px-5 py-2.5 font-semibold">Rechnung an</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                    <td className="px-5 py-2.5 font-mono text-xs font-semibold text-ink-700">{c.code}</td>
                    <td className="px-5 py-2.5">
                      <span className="text-ink-800">{c.name}</span>
                      {!c.is_active && <span className="ml-2"><Badge tone="muted">inaktiv</Badge></span>}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge>{CYCLE_LABEL[c.reporting_cycle]}</Badge>
                      {/* Ohne den Wochenbeginn steht in der Zeile nicht, welcher
                          Zeitraum gemeldet wird - und er ist je Kunde verschieden. */}
                      {c.reporting_cycle === 'weekly' && (
                        <span className="ml-1.5 text-xs text-ink-400">
                          ab {WEEK_START_SHORT[c.week_start_day]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 tabular text-ink-600">
                      {c.rounding_mode === 'none'
                        ? 'minutengenau'
                        : `${c.rounding_minutes} Min., ${ROUNDING_LABEL[c.rounding_mode]}`}
                    </td>
                    <td className="px-5 py-2.5 text-ink-500">{c.invoice_email ?? '–'}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                              onClick={() => setDialog({ open: true, customer: c })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Löschen" onClick={() => onDelete(c)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Erst beim Oeffnen einhaengen: sonst behaelt der Dialog den Meldungs-
          rhythmus des zuletzt geoeffneten Kunden. */}
      {dialog.open && <CustomerDialog
        open
        customer={dialog.customer}
        onClose={() => setDialog({ open: false, customer: null })}
      />}
    </>
  )
}
