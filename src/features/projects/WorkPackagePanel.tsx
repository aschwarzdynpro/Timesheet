import { useState, type FormEvent } from 'react'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import {
  Badge, Button, Dialog, EmptyState, ErrorNote, Field, Input, Textarea,
} from '@/components/ui/primitives'
import { describeError } from '@/lib/supabase'
import { loeschFrage, useConfirm } from '@/components/ui/confirm'
import type { Project, WorkPackage, WorkPackageInsert } from '@/types/database'
import { useDeleteWorkPackage, useSaveWorkPackage, useWorkPackages } from './api'

const schema = z.object({
  code: z.string().trim().min(1, 'Kürzel fehlt').max(20, 'Höchstens 20 Zeichen'),
  name: z.string().trim().min(1, 'Name fehlt'),
  description: z.string(),
  sort_order: z.coerce.number().int().min(0, 'Keine negative Reihenfolge'),
  is_active: z.boolean(),
})

function WorkPackageDialog({
  projectId, item, onClose,
}: { projectId: string; item: WorkPackage | null; onClose: () => void }) {
  const save = useSaveWorkPackage(projectId)
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

    const values: WorkPackageInsert = {
      project_id: projectId,
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description.trim() || null,
      sort_order: parsed.data.sort_order,
      is_active: parsed.data.is_active,
      // Budgets kommen spaeter; die Spalten sind schon da.
      budget_hours: item?.budget_hours ?? null,
      budget_amount: item?.budget_amount ?? null,
    }

    try {
      await save.mutateAsync(item ? { id: item.id, values } : { values })
      onClose()
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Arbeitspaket ändern' : 'Neues Arbeitspaket'}
      description="Woran gearbeitet wird — im Unterschied zur Tätigkeitsart, die sagt, welcher Art die Arbeit ist."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kürzel" error={errors.code}>
            <Input name="code" defaultValue={item?.code ?? ''} placeholder="MIGR" autoFocus />
          </Field>
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            <Input name="name" defaultValue={item?.name ?? ''} placeholder="Datenmigration" />
          </Field>
        </div>

        <Field label="Beschreibung" hint="optional" error={errors.description}>
          <Textarea name="description" rows={2} defaultValue={item?.description ?? ''} />
        </Field>

        <Field label="Reihenfolge" hint="kleinere Zahl steht in der Auswahl weiter oben"
               error={errors.sort_order} className="sm:max-w-40">
          <Input name="sort_order" type="number" min={0} defaultValue={item?.sort_order ?? 0} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_active" defaultChecked={item?.is_active ?? true}
                 className="size-4 rounded border-ink-300" />
          Paket ist aktiv
        </label>
        <p className="text-xs text-ink-400">
          Ein inaktives Paket steht nicht mehr zur Auswahl, bereits gebuchte Zeiten behalten es.
        </p>

        <ErrorNote message={formError} />

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function WorkPackagePanel({ project }: { project: Project }) {
  const { data: packages, isPending } = useWorkPackages(project.id)
  const remove = useDeleteWorkPackage(project.id)
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<{ open: boolean; item: WorkPackage | null }>(
    { open: false, item: null })
  const [error, setError] = useState<string | null>(null)

  async function onDelete(item: WorkPackage) {
    if (!await confirm(loeschFrage('Arbeitspaket', `${item.code} · ${item.name}`))) return
    setError(null)
    try {
      await remove.mutateAsync(item.id)
    } catch (err) {
      setError(describeError(err))
    }
  }

  return (
    <div className="border-t border-ink-200 bg-ink-50/50 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <Package className="size-4 text-ink-400" /> Arbeitspakete
          </h3>
          <p className="text-xs text-ink-400">
            Gliedert das Projekt. Beim Erfassen lässt sich je Zeile eines auswählen.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true, item: null })}>
          <Plus className="size-4" /> Arbeitspaket
        </Button>
      </div>

      {error && <div className="mb-3"><ErrorNote message={error} /></div>}

      {isPending ? (
        <p className="py-3 text-sm text-ink-400">Wird geladen …</p>
      ) : !packages?.length ? (
        <EmptyState
          title="Keine Arbeitspakete"
          hint="Ohne Pakete wird schlicht auf das Projekt gebucht — das reicht, solange du nichts feiner auswerten willst."
        />
      ) : (
        <ul className="divide-y divide-ink-200 rounded-md border border-ink-200 bg-white">
          {packages.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="font-mono text-xs font-semibold text-ink-700">{w.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-800">{w.name}</span>
                {w.description && (
                  <span className="block truncate text-xs text-ink-400">{w.description}</span>
                )}
              </span>
              {!w.is_active && <Badge tone="muted">inaktiv</Badge>}
              <span className="shrink-0">
                <Button size="sm" variant="ghost" aria-label="Bearbeiten"
                        onClick={() => setDialog({ open: true, item: w })}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Löschen" onClick={() => void onDelete(w)}>
                  <Trash2 className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {dialog.open && (
        <WorkPackageDialog projectId={project.id} item={dialog.item}
                           onClose={() => setDialog({ open: false, item: null })} />
      )}
    </div>
  )
}
