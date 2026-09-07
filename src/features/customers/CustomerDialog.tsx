import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button, Dialog, ErrorNote, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import type { Customer, CustomerInsert, ReportingCycle } from '@/types/database'
import { useSaveCustomer } from './api'

const schema = z.object({
  code: z.string().trim().min(1, 'Kürzel fehlt').max(20, 'Höchstens 20 Zeichen'),
  name: z.string().trim().min(1, 'Name fehlt'),
  reporting_cycle: z.enum(['weekly', 'monthly']),
  week_start_day: z.enum(['monday', 'sunday']),
  rounding_minutes: z.coerce.number().int().min(1, 'Mindestens 1 Minute').max(120, 'Höchstens 120 Minuten'),
  rounding_mode: z.enum(['up', 'nearest', 'none']),
  invoice_email: z.string().trim().email('Keine gültige E-Mail').or(z.literal('')),
  notes: z.string(),
  is_active: z.boolean(),
})

export function CustomerDialog({
  open, customer, onClose,
}: { open: boolean; customer: Customer | null; onClose: () => void }) {
  const save = useSaveCustomer()
  const [cycle, setCycle] = useState<ReportingCycle>(customer?.reporting_cycle ?? 'monthly')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)

    const raw = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = schema.safeParse({ ...raw, is_active: raw.is_active === 'on' })

    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next)
      return
    }

    const values: CustomerInsert = {
      ...parsed.data,
      invoice_email: parsed.data.invoice_email || null,
      notes: parsed.data.notes.trim() || null,
      finops_legal_entity: null,
      finops_customer_id: null,
    }

    try {
      await save.mutateAsync(customer ? { id: customer.id, values } : { values })
      onClose()
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer ? 'Kunde bearbeiten' : 'Neuer Kunde'}
      description="Rhythmus und Rundung gelten für alle Projekte des Kunden und lassen sich je Projekt überschreiben."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kürzel" error={errors.code}>
            <Input name="code" defaultValue={customer?.code ?? ''} placeholder="ACME" autoFocus />
          </Field>
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            <Input name="name" defaultValue={customer?.name ?? ''} placeholder="ACME Industrie AG" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Meldung" error={errors.reporting_cycle}>
            <Select name="reporting_cycle" value={cycle}
                    onChange={(e) => setCycle(e.target.value as ReportingCycle)}>
              <option value="monthly">monatlich</option>
              <option value="weekly">wöchentlich</option>
            </Select>
          </Field>
          <Field label="Takt (Min.)" error={errors.rounding_minutes}>
            <Input name="rounding_minutes" type="number" min={1} max={120}
                   defaultValue={customer?.rounding_minutes ?? 15} />
          </Field>
          <Field label="Rundung" error={errors.rounding_mode}>
            <Select name="rounding_mode" defaultValue={customer?.rounding_mode ?? 'up'}>
              <option value="up">aufrunden</option>
              <option value="nearest">kaufmännisch</option>
              <option value="none">keine</option>
            </Select>
          </Field>
        </div>

        {/* Nur bei woechentlicher Meldung sichtbar - bei monatlicher wuerde die
            Auswahl nichts bewirken. Der Wert reist trotzdem mit, damit ein
            Umweg ueber "monatlich" die Einstellung nicht zuruecksetzt. */}
        {cycle === 'weekly' ? (
          <Field label="Wochenbeginn" error={errors.week_start_day} className="sm:max-w-xs"
                 hint="Gilt für die Meldeperioden dieses Kunden. Deine eigenen Auswertungen zählen weiter ab Montag.">
            <Select name="week_start_day" defaultValue={customer?.week_start_day ?? 'monday'}>
              <option value="monday">Montag</option>
              <option value="sunday">Sonntag</option>
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="week_start_day"
                 defaultValue={customer?.week_start_day ?? 'monday'} />
        )}

        <Field label="Rechnungs-E-Mail" error={errors.invoice_email}>
          <Input name="invoice_email" type="email" defaultValue={customer?.invoice_email ?? ''} />
        </Field>

        <Field label="Notiz" error={errors.notes}>
          <Textarea name="notes" rows={2} defaultValue={customer?.notes ?? ''} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_active" defaultChecked={customer?.is_active ?? true}
                 className="size-4 rounded border-ink-300" />
          Kunde ist aktiv
        </label>

        <ErrorNote message={formError} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Speichern …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
