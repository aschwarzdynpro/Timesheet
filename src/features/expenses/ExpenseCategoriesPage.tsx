import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Input, Select,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatEuro } from '@/lib/format'
import type { ExpenseCategory, ExpenseCategoryInsert, ExpenseEntryMode } from '@/types/database'
import { useDeleteExpenseCategory, useExpenseCategories, useSaveExpenseCategory } from './api'

/** Vorschläge für den Einstieg – kein Zwang, nur ein schnellerer Start. */
const VORSCHLAEGE: { code: string; name: string; mode: ExpenseEntryMode; unit?: string }[] = [
  { code: 'MILEAGE',  name: 'Kilometergeld', mode: 'allowance', unit: 'km' },
  { code: 'PER_DIEM', name: 'Verpflegung',   mode: 'allowance', unit: 'Tag' },
  { code: 'HOTEL',    name: 'Übernachtung',  mode: 'receipt' },
  { code: 'TRAIN',    name: 'Bahnfahrt',     mode: 'receipt' },
]

function CategoryDialog({
  open, category, preset, onClose,
}: {
  open: boolean
  category: ExpenseCategory | null
  preset?: (typeof VORSCHLAEGE)[number] | null
  onClose: () => void
}) {
  const save = useSaveExpenseCategory()
  const [mode, setMode] = useState<ExpenseEntryMode>(
    category?.entry_mode ?? preset?.mode ?? 'receipt')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)
    const rate = String(form.get('default_unit_rate') ?? '').trim().replace(',', '.')

    const values: ExpenseCategoryInsert = {
      code: String(form.get('code') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      entry_mode: mode,
      unit_label: mode === 'allowance' ? String(form.get('unit_label') ?? '').trim() || null : null,
      default_unit_rate: mode === 'allowance' && rate ? Number(rate) : null,
      is_rechargeable_default: form.get('is_rechargeable_default') === 'on',
      finops_category: null,
      is_active: form.get('is_active') === 'on',
    }

    if (mode === 'allowance' && (!values.unit_label || values.default_unit_rate === null)) {
      setError('Eine Pauschale braucht Einheit und Satz — sonst lässt sich kein Betrag berechnen.')
      return
    }

    try {
      await save.mutateAsync(category ? { id: category.id, values } : { values })
      onClose()
    } catch (err) {
      setError(describeError(err))
    }
  }

  if (!open) return null

  return (
    <Dialog open onClose={onClose}
            title={category ? 'Spesenart bearbeiten' : 'Neue Spesenart'}
            description="Ein Beleg trägt seinen Betrag selbst; eine Pauschale rechnet Menge mal Satz.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kürzel">
            <Input name="code" required autoFocus maxLength={20}
                   defaultValue={category?.code ?? preset?.code ?? ''} />
          </Field>
          <Field label="Name" className="col-span-2">
            <Input name="name" required defaultValue={category?.name ?? preset?.name ?? ''} />
          </Field>
        </div>

        <Field label="Erfassungsart">
          <Select value={mode} onChange={(e) => setMode(e.target.value as ExpenseEntryMode)}>
            <option value="receipt">Beleg — Betrag wird erfasst</option>
            <option value="allowance">Pauschale — Menge mal Satz</option>
          </Select>
        </Field>

        {mode === 'allowance' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Einheit" hint="km, Tag, Stück …">
              <Input name="unit_label" required
                     defaultValue={category?.unit_label ?? preset?.unit ?? ''} />
            </Field>
            <Field label="Satz je Einheit" hint="lässt sich beim Erfassen überschreiben">
              <Input name="default_unit_rate" required inputMode="decimal" placeholder="0,30"
                     defaultValue={category?.default_unit_rate ?? ''} />
            </Field>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_rechargeable_default"
                 defaultChecked={category?.is_rechargeable_default ?? true}
                 className="size-4 rounded border-ink-300" />
          standardmäßig weiterberechenbar
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_active" defaultChecked={category?.is_active ?? true}
                 className="size-4 rounded border-ink-300" />
          aktiv
        </label>

        <ErrorNote message={error} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ExpenseCategoriesPage() {
  const { data: categories, isPending, error } = useExpenseCategories()
  const remove = useDeleteExpenseCategory()
  const [dialog, setDialog] = useState<{
    open: boolean; category: ExpenseCategory | null; preset?: (typeof VORSCHLAEGE)[number] | null
  }>({ open: false, category: null })
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function onDelete(category: ExpenseCategory) {
    if (!confirm(`Spesenart „${category.name}" wirklich löschen?`)) return
    setRemoveError(null)
    try {
      await remove.mutateAsync(category.id)
    } catch (err) {
      setRemoveError(describeError(err))
    }
  }

  const vorhandeneCodes = new Set((categories ?? []).map((c) => c.code))
  const offeneVorschlaege = VORSCHLAEGE.filter((v) => !vorhandeneCodes.has(v.code))

  return (
    <>
      <PageHeader
        title="Spesenarten"
        subtitle="Legt fest, ob ein Beleg erfasst wird oder eine Pauschale aus Menge mal Satz entsteht."
        action={
          <Button variant="primary" onClick={() => setDialog({ open: true, category: null })}>
            <Plus className="size-4" /> Neue Art
          </Button>
        }
      />

      {error && <div className="mt-4"><ErrorNote message={describeError(error)} /></div>}
      {removeError && <div className="mt-4"><ErrorNote message={removeError} /></div>}

      <Card className="mt-4 overflow-hidden">
        {isPending ? (
          <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
        ) : !categories?.length ? (
          <EmptyState
            title="Noch keine Spesenarten"
            hint="Häufig genügen vier: Kilometergeld und Verpflegung als Pauschale, Übernachtung und Bahnfahrt als Beleg."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
                <th className="px-5 py-2.5 font-semibold">Kürzel</th>
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-5 py-2.5 font-semibold">Erfassung</th>
                <th className="px-5 py-2.5 font-semibold">Vorgabe</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="px-5 py-2.5 font-mono text-xs font-semibold text-ink-700">{c.code}</td>
                  <td className="px-5 py-2.5 text-ink-800">
                    {c.name}
                    {!c.is_active && <span className="ml-2"><Badge tone="muted">inaktiv</Badge></span>}
                  </td>
                  <td className="px-5 py-2.5">
                    {c.entry_mode === 'allowance' ? (
                      <span className="tabular text-ink-600">
                        Pauschale · {formatEuro(Number(c.default_unit_rate ?? 0))} je {c.unit_label}
                      </span>
                    ) : (
                      <span className="text-ink-600">Beleg</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    {c.is_rechargeable_default
                      ? <Badge tone="good">weiterberechenbar</Badge>
                      : <Badge tone="muted">eigene Kosten</Badge>}
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                            onClick={() => setDialog({ open: true, category: c })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Löschen" onClick={() => void onDelete(c)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {offeneVorschlaege.length > 0 && (
        <Card className="mt-3 p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Häufige Arten übernehmen
          </p>
          <ul className="flex flex-wrap gap-2">
            {offeneVorschlaege.map((v) => (
              <li key={v.code}>
                <button
                  onClick={() => setDialog({ open: true, category: null, preset: v })}
                  className="inline-flex items-center gap-1.5 rounded border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-600 hover:border-accent-500 hover:text-accent-700"
                >
                  <Plus className="size-3.5" />
                  {v.name}
                  <span className="text-xs text-ink-400">
                    {v.mode === 'allowance' ? `Pauschale je ${v.unit}` : 'Beleg'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-400">
            Die Sätze trägst du beim Anlegen selbst ein — sie hängen von deiner Vereinbarung ab.
          </p>
        </Card>
      )}

      <CategoryDialog
        open={dialog.open}
        category={dialog.category}
        preset={dialog.preset}
        onClose={() => setDialog({ open: false, category: null })}
      />
    </>
  )
}
