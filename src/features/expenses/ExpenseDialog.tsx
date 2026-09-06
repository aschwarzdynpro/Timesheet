import { useMemo, useState, type FormEvent } from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import {
  Button, Dialog, ErrorNote, Field, Input, Select, Textarea,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { formatEuro, today } from '@/lib/format'
import type {
  ExpenseCategory, ExpenseFull, ExpenseInput, Project,
} from '@/types/database'
import { uploadReceipt, useSaveExpense } from './api'

const MAX_BYTES = 10 * 1024 * 1024

function parseAmount(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function ExpenseDialog(props: {
  open: boolean
  expense: ExpenseFull | null
  projects: Project[]
  categories: ExpenseCategory[]
  onClose: () => void
}) {
  if (!props.open) return null
  // Der Schluessel setzt den Formularzustand zurueck, sobald eine andere Spese
  // geoeffnet wird. Ohne ihn zeigte das Formular beim zweiten Oeffnen noch die
  // Werte der vorigen.
  return <ExpenseDialogForm key={props.expense?.id ?? 'neu'} {...props} />
}

function ExpenseDialogForm({
  expense, projects, categories, onClose,
}: {
  expense: ExpenseFull | null
  projects: Project[]
  categories: ExpenseCategory[]
  onClose: () => void
}) {
  const save = useSaveExpense()
  const [categoryId, setCategoryId] = useState(expense?.category_code
    ? categories.find((c) => c.code === expense.category_code)?.id ?? '' : '')
  const [quantity, setQuantity] = useState(expense?.quantity?.toString().replace('.', ',') ?? '')
  const [unitRate, setUnitRate] = useState(expense?.unit_rate?.toString().replace('.', ',') ?? '')
  const [amount, setAmount] = useState(expense?.amount_net?.toString().replace('.', ',') ?? '')
  const [receiptPath, setReceiptPath] = useState<string | null>(expense?.receipt_path ?? null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  )
  const isAllowance = category?.entry_mode === 'allowance'

  const computed = useMemo(() => {
    if (!isAllowance) return parseAmount(amount) ?? 0
    const q = parseAmount(quantity)
    const r = parseAmount(unitRate)
    return q !== null && r !== null ? Math.round(q * r * 100) / 100 : 0
  }, [isAllowance, quantity, unitRate, amount])

  function onPickCategory(id: string) {
    setCategoryId(id)
    const next = categories.find((c) => c.id === id)
    // Bei einer Pauschale den hinterlegten Satz vorbelegen - er aendert sich selten.
    if (next?.entry_mode === 'allowance' && next.default_unit_rate !== null && !unitRate) {
      setUnitRate(String(next.default_unit_rate).replace('.', ','))
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('Der Beleg ist größer als 10 MB. Bitte kleiner fotografieren oder komprimieren.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      setReceiptPath(await uploadReceipt(file))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)

    const projectId = String(form.get('project_id') ?? '')
    const description = String(form.get('description') ?? '').trim()
    const expenseDate = String(form.get('expense_date') ?? '')
    const markup = parseAmount(String(form.get('markup_percent') ?? '0')) ?? 0
    const vat = String(form.get('vat_rate') ?? '').trim()

    if (!projectId) return setError('Bitte ein Projekt wählen.')
    if (!categoryId) return setError('Bitte eine Spesenart wählen.')
    if (!description) return setError('Ohne Beschreibung geht es nicht — sie steht später im Kundenreport.')
    if (computed <= 0) {
      return setError(isAllowance
        ? 'Menge und Satz ergeben keinen Betrag.'
        : 'Bitte einen Betrag erfassen.')
    }

    const values: ExpenseInput = {
      project_id: projectId,
      category_id: categoryId,
      expense_date: expenseDate,
      description,
      quantity: isAllowance ? parseAmount(quantity) : null,
      unit_rate: isAllowance ? parseAmount(unitRate) : null,
      amount_net: computed,
      vat_rate: vat ? parseAmount(vat) : null,
      amount_gross: null,
      is_rechargeable: form.get('is_rechargeable') === 'on',
      markup_percent: markup,
      receipt_path: receiptPath,
    }

    try {
      await save.mutateAsync(expense ? { id: expense.id, values } : { values })
      onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <Dialog open onClose={onClose}
            title={expense ? 'Spese bearbeiten' : 'Neue Spese'}
            description="Beleg oder Pauschale — die Spesenart bestimmt, was erfasst wird.">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Projekt">
            <Select name="project_id" defaultValue={expense?.project_id ?? ''} required>
              <option value="">Bitte wählen</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Datum">
            <Input type="date" name="expense_date" required
                   defaultValue={expense?.expense_date ?? today()} />
          </Field>
        </div>

        <Field label="Spesenart">
          <Select value={categoryId} onChange={(e) => onPickCategory(e.target.value)} required>
            <option value="">Bitte wählen</option>
            {categories.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.entry_mode === 'allowance' ? 'Pauschale' : 'Beleg'})
              </option>
            ))}
          </Select>
        </Field>

        {isAllowance ? (
          <div key="pauschale" className="grid grid-cols-3 items-end gap-3">
            <Field label={`Menge${category?.unit_label ? ` (${category.unit_label})` : ''}`}>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)}
                     inputMode="decimal" placeholder="214" autoFocus />
            </Field>
            <Field label="Satz je Einheit">
              <Input value={unitRate} onChange={(e) => setUnitRate(e.target.value)}
                     inputMode="decimal" placeholder="0,30" />
            </Field>
            <div className="pb-2">
              <span className="block text-xs font-semibold tracking-wide text-ink-600 uppercase">
                Betrag
              </span>
              <span className="tabular text-lg font-semibold text-ink-800">
                {formatEuro(computed)}
              </span>
            </div>
          </div>
        ) : (
          <div key="beleg" className="grid grid-cols-2 gap-3">
            <Field label="Betrag (netto)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)}
                     inputMode="decimal" placeholder="89,00" autoFocus />
            </Field>
            <Field label="MwSt.-Satz in %" hint="optional, für den Vorsteuerausweis">
              <Input name="vat_rate" inputMode="decimal" placeholder="19"
                     defaultValue={expense?.vat_rate ?? ''} />
            </Field>
          </div>
        )}

        <Field label="Beschreibung">
          <Textarea name="description" rows={2} required defaultValue={expense?.description ?? ''}
                    placeholder="Wofür? Steht später im Kundenreport." />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Aufschlag in %" hint="0 = zum Selbstkostenpreis weiterberechnen">
            <Input name="markup_percent" inputMode="decimal"
                   defaultValue={expense?.markup_percent ?? 0} />
          </Field>
          <label className="flex h-9 items-center gap-2 self-end text-sm text-ink-700">
            <input type="checkbox" name="is_rechargeable"
                   defaultChecked={expense?.is_rechargeable ?? true}
                   className="size-4 rounded border-ink-300" />
            weiterberechenbar
          </label>
        </div>

        <div className="rounded-md border border-ink-200 p-3">
          <span className="block text-xs font-semibold tracking-wide text-ink-600 uppercase">
            Beleg
          </span>
          {receiptPath ? (
            <div className="mt-2 flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-emerald-700" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                {receiptPath.split('/').pop()}
              </span>
              <Button type="button" size="sm" variant="ghost" aria-label="Beleg entfernen"
                      onClick={() => setReceiptPath(null)}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-accent-600 hover:underline">
              <Paperclip className="size-4" />
              {uploading ? 'Wird hochgeladen …' : 'Foto oder PDF anhängen'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
                capture="environment"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </label>
          )}
          <p className="mt-1 text-xs text-ink-400">
            Höchstens 10 MB. Liegt in einem privaten Bereich und ist nur über zeitlich
            begrenzte Adressen abrufbar.
          </p>
        </div>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending || uploading}>
            Speichern
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
