import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Download, Plus, Save, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorNote, Field, Input, Select,
} from '@/components/ui/primitives'
import { PageHeader } from '@/components/PageHeader'
import { describeError } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { minutesToHours, toIsoDate } from '@/lib/week'
import { useCustomers } from '@/features/customers/api'
import { useProjects } from '@/features/projects/api'
import { useExpenses } from '@/features/expenses/api'
import {
  useDeleteExportProfile, useExportProfiles, useExportRows, useSaveExportProfile,
  type ExportFilters,
} from './api'
import { COLUMNS, COLUMN_BY_KEY, DEFAULT_COLUMNS, cellText, type ColumnKey } from './columns'

const PREVIEW_ROWS = 50

function startOfMonth(offset = 0): string {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + offset, 1))
}
function endOfMonth(offset = 0): string {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0))
}

export function ExportPage() {
  const { data: profiles } = useExportProfiles()
  const { data: customers } = useCustomers()
  const { data: projects } = useProjects()
  const saveProfile = useSaveExportProfile()
  const deleteProfile = useDeleteExportProfile()

  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS)
  const [filters, setFilters] = useState<ExportFilters>({
    from: startOfMonth(-1), to: endOfMonth(-1),
    customerId: '', projectId: '', onlyBillable: false,
  })
  const [activeProfile, setActiveProfile] = useState<string>('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = useExportRows(filters)
  // Spesen kommen als eigenes Blatt mit, sofern im Zeitraum welche liegen.
  const expenses = useExpenses(filters.from, filters.to)

  const projectsOfCustomer = useMemo(
    () => (projects ?? []).filter((p) => !filters.customerId || p.customer_id === filters.customerId),
    [projects, filters.customerId],
  )

  const defs = useMemo(
    () => columns.map((k) => COLUMN_BY_KEY.get(k)).filter((c) => c !== undefined),
    [columns],
  )

  const totals = useMemo(() => {
    const list = rows.data ?? []
    return {
      count: list.length,
      tracked: list.reduce((n, e) => n + e.duration_minutes, 0),
      billable: list.reduce((n, e) => n + e.billable_minutes, 0),
      amount: list.reduce((n, e) => n + Number(e.amount ?? 0), 0),
    }
  }, [rows.data])

  function toggleColumn(key: ColumnKey) {
    setColumns((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]))
  }

  function move(key: ColumnKey, direction: -1 | 1) {
    setColumns((c) => {
      const i = c.indexOf(key)
      const j = i + direction
      if (i < 0 || j < 0 || j >= c.length) return c
      const next = [...c]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }

  function applyProfile(id: string) {
    setActiveProfile(id)
    const profile = profiles?.find((p) => p.id === id)
    if (!profile) return
    if (profile.columns?.length) setColumns(profile.columns)
    setFilters((f) => ({
      ...f,
      customerId: profile.customer_id ?? profile.filters?.customerId ?? '',
      projectId: profile.filters?.projectId ?? '',
      onlyBillable: profile.filters?.onlyBillable ?? false,
    }))
  }

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name) return
    setError(null)
    try {
      const existing = profiles?.find((p) => p.name === name)
      await saveProfile.mutateAsync({
        id: existing?.id,
        values: {
          name, target: 'excel', columns,
          filters: { customerId: filters.customerId, projectId: filters.projectId,
                     onlyBillable: filters.onlyBillable },
          customer_id: filters.customerId || null,
        },
      })
      setSaveOpen(false)
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function onDeleteProfile() {
    const profile = profiles?.find((p) => p.id === activeProfile)
    if (!profile || !confirm(`Profil „${profile.name}" wirklich löschen?`)) return
    setError(null)
    try {
      await deleteProfile.mutateAsync(profile.id)
      setActiveProfile('')
    } catch (err) {
      setError(describeError(err))
    }
  }

  async function onExport() {
    const list = rows.data ?? []
    if (list.length === 0) return
    setBusy(true)
    setError(null)
    try {
      // Die Tabellenbibliothek wiegt rund 330 kB und wird erst beim Erzeugen
      // gebraucht - nachladen statt in jedes Bundle packen.
      const { exportToExcel } = await import('./writeExcel')
      const customer = customers?.find((c) => c.id === filters.customerId)
      const label = customer ? customer.code : 'Alle'
      await exportToExcel({
        rows: list,
        expenses: (expenses.data ?? []).filter(
          (e) => (!filters.customerId || e.customer_id === filters.customerId) &&
                 (!filters.projectId || e.project_id === filters.projectId)),
        columns,
        fileName: `Zeiten_${label}_${filters.from}_bis_${filters.to}.xlsx`,
        title: customer?.name ?? 'Zeiten',
      })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const preview = (rows.data ?? []).slice(0, PREVIEW_ROWS)

  return (
    <>
      <PageHeader
        title="Export"
        subtitle="Spalten einmal zusammenstellen, als Profil sichern — danach ist der Monatsversand eine Auswahl und ein Klick."
        action={
          <Button variant="primary" disabled={busy || totals.count === 0} onClick={() => void onExport()}>
            <Download className="size-4" />
            {busy ? 'Wird erzeugt …' : 'Excel erzeugen'}
          </Button>
        }
      />

      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {(rows.error ?? expenses.error) && (
        <div className="mt-4">
          <ErrorNote message={describeError(rows.error ?? expenses.error)} />
        </div>
      )}

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Profil" className="w-56">
            <Select value={activeProfile} onChange={(e) => applyProfile(e.target.value)}>
              <option value="">— eigene Auswahl —</option>
              {(profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Button onClick={() => setSaveOpen(true)}>
            <Save className="size-4" /> Als Profil sichern
          </Button>
          {activeProfile && (
            <Button variant="danger" onClick={() => void onDeleteProfile()}>
              <Trash2 className="size-4" /> Profil löschen
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Von">
            <Input type="date" value={filters.from}
                   onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </Field>
          <Field label="Bis">
            <Input type="date" value={filters.to}
                   onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </Field>
          <Field label="Kunde">
            <Select value={filters.customerId}
                    onChange={(e) => setFilters((f) => ({ ...f, customerId: e.target.value, projectId: '' }))}>
              <option value="">alle Kunden</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Projekt">
            <Select value={filters.projectId}
                    onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}>
              <option value="">alle Projekte</option>
              {projectsOfCustomer.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <label className="flex h-9 items-center gap-2 self-end text-sm text-ink-700">
            <input type="checkbox" checked={filters.onlyBillable}
                   onChange={(e) => setFilters((f) => ({ ...f, onlyBillable: e.target.checked }))}
                   className="size-4 rounded border-ink-300" />
            nur abrechenbare
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
          {[['Letzter Monat', startOfMonth(-1), endOfMonth(-1)],
            ['Dieser Monat', startOfMonth(0), endOfMonth(0)],
            ['Dieses Jahr', `${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`],
          ].map(([label, from, to]) => (
            <Button key={label} size="sm"
                    onClick={() => setFilters((f) => ({ ...f, from: from!, to: to! }))}>
              {label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-ink-700">Spalten</h2>
          <p className="mt-0.5 mb-3 text-xs text-ink-400">
            Reihenfolge bestimmt die Spaltenfolge in der Datei.
          </p>

          <ul className="space-y-1">
            {columns.map((key, index) => {
              const def = COLUMN_BY_KEY.get(key)
              if (!def) return null
              return (
                <li key={key} className="flex items-center gap-1 rounded-md bg-accent-50 px-2 py-1">
                  <span className="tabular w-5 text-xs text-accent-700">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{def.label}</span>
                  <button onClick={() => move(key, -1)} disabled={index === 0}
                          aria-label={`${def.label} nach oben`}
                          className="rounded p-0.5 text-ink-400 hover:bg-white disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button onClick={() => move(key, 1)} disabled={index === columns.length - 1}
                          aria-label={`${def.label} nach unten`}
                          className="rounded p-0.5 text-ink-400 hover:bg-white disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button onClick={() => toggleColumn(key)} aria-label={`${def.label} entfernen`}
                          className="rounded p-0.5 text-ink-400 hover:bg-white hover:text-red-600">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Verfügbar
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {COLUMNS.filter((c) => !columns.includes(c.key)).map((def) => (
              <li key={def.key}>
                <button onClick={() => toggleColumn(def.key)}
                        className="inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-600 hover:border-accent-500 hover:text-accent-700">
                  <Plus className="size-3" /> {def.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-700">Vorschau</h2>
            <p className="text-xs text-ink-500">
              {totals.count === 0 ? 'keine Zeilen' : (
                <>
                  <span className="tabular font-medium text-ink-700">{totals.count}</span> Zeilen ·{' '}
                  <span className="tabular">{minutesToHours(totals.billable)} h</span> abrechenbar ·{' '}
                  <span className="tabular">
                    {totals.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                  {(expenses.data?.length ?? 0) > 0 &&
                    ` · ${expenses.data!.length} Spesen als eigenes Blatt`}
                  {totals.count > PREVIEW_ROWS && ` · zeigt die ersten ${PREVIEW_ROWS}`}
                </>
              )}
            </p>
          </div>

          {rows.isPending ? (
            <p className="px-4 py-8 text-sm text-ink-400">Wird geladen …</p>
          ) : preview.length === 0 ? (
            <EmptyState
              title="Keine Zeilen im gewählten Zeitraum"
              hint="Passe Zeitraum oder Filter an."
            />
          ) : columns.length === 0 ? (
            <EmptyState title="Keine Spalte gewählt" hint="Wähle links mindestens eine Spalte aus." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs tracking-wide text-ink-400 uppercase">
                    {defs.map((def) => (
                      <th key={def.key}
                          className={`px-3 py-2 font-semibold whitespace-nowrap ${def.align === 'right' ? 'text-right' : ''}`}>
                        {def.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((entry) => (
                    <tr key={entry.id} className="border-b border-ink-100 last:border-0">
                      {defs.map((def) => (
                        <td key={def.key}
                            className={`px-3 py-1.5 ${def.align === 'right' ? 'tabular text-right' : ''} ${
                              def.key === 'description' ? 'max-w-md truncate' : 'whitespace-nowrap'}`}>
                          {cellText(def.cell(entry))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)}
              title="Als Profil sichern"
              description="Ein bestehendes Profil mit demselben Namen wird überschrieben.">
        <form onSubmit={onSaveProfile} className="space-y-4">
          <Field label="Name" hint="Zum Beispiel: ACME — monatlich">
            <Input name="name" required autoFocus
                   defaultValue={profiles?.find((p) => p.id === activeProfile)?.name ?? ''} />
          </Field>
          <p className="text-sm text-ink-500">
            Gesichert werden {columns.length} Spalten
            {filters.customerId && <> und der Kunde <Badge>{customers?.find((c) => c.id === filters.customerId)?.name}</Badge></>}.
            Der Zeitraum bleibt frei wählbar.
          </p>
          <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
            <Button type="button" onClick={() => setSaveOpen(false)}>Abbrechen</Button>
            <Button type="submit" variant="primary" disabled={saveProfile.isPending}>Sichern</Button>
          </div>
        </form>
      </Dialog>

      <p className="mt-3 text-xs text-ink-400">
        Zeitraum {formatDate(filters.from)} – {formatDate(filters.to)}. Die Datei entsteht im
        Browser; die Daten verlassen dabei nichts außer deinem Gerät.
      </p>
    </>
  )
}
