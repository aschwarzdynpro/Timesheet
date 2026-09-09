import { useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { z } from 'zod'
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Input,
} from '@/components/ui/primitives'
import { MobileList, MobileListItem } from '@/components/ui/MobileList'
import { PageHeader } from '@/components/PageHeader'
import { ZU_STAMMDATEN } from '@/components/navigation'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import type { ActivityType, ActivityTypeInsert } from '@/types/database'
import { useActivityTypes, useDeleteActivityType, useSaveActivityType } from './api'

const schema = z.object({
  code: z.string().trim().min(1, 'Kürzel fehlt').max(20, 'Höchstens 20 Zeichen'),
  name: z.string().trim().min(1, 'Name fehlt'),
  sort_order: z.coerce.number().int().min(0),
  is_billable_default: z.boolean(),
  is_active: z.boolean(),
})

function ActivityDialog({
  open, item, onClose,
}: { open: boolean; item: ActivityType | null; onClose: () => void }) {
  const save = useSaveActivityType()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)

    const raw = Object.fromEntries(new FormData(event.currentTarget))
    const parsed = schema.safeParse({
      ...raw,
      is_billable_default: raw.is_billable_default === 'on',
      is_active: raw.is_active === 'on',
    })

    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message
      setErrors(next)
      return
    }

    const values: ActivityTypeInsert = { ...parsed.data, finops_category: null }
    try {
      await save.mutateAsync(item ? { id: item.id, values } : { values })
      onClose()
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? 'Tätigkeitsart bearbeiten' : 'Neue Tätigkeitsart'}
      description="Tätigkeitsarten tragen abweichende Stundensätze – etwa Reisezeit zum halben Satz."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kürzel" error={errors.code}>
            <Input name="code" defaultValue={item?.code ?? ''} placeholder="TRAVEL" autoFocus />
          </Field>
          <Field label="Name" error={errors.name} className="col-span-2">
            <Input name="name" defaultValue={item?.name ?? ''} placeholder="Reisezeit" />
          </Field>
        </div>
        <Field label="Sortierung" hint="Kleinere Werte stehen in Auswahllisten weiter oben."
               error={errors.sort_order}>
          <Input name="sort_order" type="number" min={0} defaultValue={item?.sort_order ?? 100} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_billable_default"
                 defaultChecked={item?.is_billable_default ?? true}
                 className="size-4 rounded border-ink-300" />
          standardmäßig abrechenbar
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true}
                 className="size-4 rounded border-ink-300" />
          aktiv
        </label>

        <ErrorNote message={formError} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ActivityTypesPage() {
  const { data: items, isPending, error } = useActivityTypes()
  const remove = useDeleteActivityType()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; item: ActivityType | null }>({
    open: false, item: null,
  })
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function onDelete(item: ActivityType) {
    if (!await confirm(loeschFrage('Tätigkeitsart', item.name))) return
    setRemoveError(null)
    try {
      await remove.mutateAsync(item.id)
    } catch (err) {
      setRemoveError(describeError(err))
    }
  }

  // Dieselben Schaltflaechen stehen in der Tabelle und auf der Karte.
  const aktionen = (a: ActivityType) => (
    <>
      <Button size="sm" variant="ghost" aria-label="Bearbeiten"
              onClick={() => setDialog({ open: true, item: a })}>
        <Pencil className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" aria-label="Löschen" onClick={() => onDelete(a)}>
        <Trash2 className="size-4" />
      </Button>
    </>
  )

  return (
    <>
      <PageHeader
        parent={ZU_STAMMDATEN}
        title="Tätigkeitsarten"
        subtitle="Grundlage für abweichende Sätze und später für die FinOps-Kategorie."
        action={
          <Button variant="primary" onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="size-4" /> Neue Art
          </Button>
        }
      />

      {error && <ErrorNote message={describeError(error)} />}
      {removeError && <ErrorNote message={removeError} />}

      <Card className="mt-4 overflow-hidden">
        {isPending ? (
          <p className="px-5 py-8 text-sm text-ink-400">Wird geladen …</p>
        ) : !items?.length ? (
          <EmptyState
            title="Noch keine Tätigkeitsarten"
            hint="Empfehlung für den Anfang: Beratung, Reisezeit, Intern."
            action={
              <Button variant="primary" onClick={() => setDialog({ open: true, item: null })}>
                Erste Art anlegen
              </Button>
            }
          />
        ) : (
          <>
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
                <th className="px-5 py-2.5 font-semibold">Kürzel</th>
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-5 py-2.5 font-semibold">Vorgabe</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="px-5 py-2.5 font-mono text-xs font-semibold text-ink-700">{a.code}</td>
                  <td className="px-5 py-2.5 text-ink-800">
                    {a.name}
                    {!a.is_active && <span className="ml-2"><Badge tone="muted">inaktiv</Badge></span>}
                  </td>
                  <td className="px-5 py-2.5">
                    {a.is_billable_default
                      ? <Badge tone="good">abrechenbar</Badge>
                      : <Badge tone="muted">nicht abrechenbar</Badge>}
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">{aktionen(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <MobileList>
            {items.map((a) => (
              <MobileListItem
                key={a.id}
                code={a.code}
                name={a.name}
                inaktiv={!a.is_active}
                aktionen={aktionen(a)}
                zeilen={[
                  a.is_billable_default
                    ? <Badge tone="good">abrechenbar</Badge>
                    : <Badge tone="muted">nicht abrechenbar</Badge>,
                ]}
              />
            ))}
          </MobileList>
          </>
        )}
      </Card>

      <ActivityDialog
        open={dialog.open}
        item={dialog.item}
        onClose={() => setDialog({ open: false, item: null })}
      />
    </>
  )
}
