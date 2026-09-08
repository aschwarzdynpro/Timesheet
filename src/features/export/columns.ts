import { formatDate } from '@/lib/format'
import { isoWeek, fromIsoDate } from '@/lib/week'
import type { TimeEntryFull } from '@/types/database'

/**
 * Katalog der Spalten, die ein Export-Profil auswaehlen kann.
 *
 * Jede Spalte weiss selbst, wie sie einen Zeiteintrag in eine Zelle uebersetzt -
 * einmal fuer die Vorschau als Text, einmal fuer die Tabellendatei mit Typ und
 * Zahlenformat. Damit ist ein neues Kundenformat ein Datensatz, kein Release.
 */

export type ColumnKey =
  | 'work_date' | 'iso_week' | 'month' | 'customer_code' | 'customer_name'
  | 'project_code' | 'project_name' | 'work_package_code' | 'work_package_name'
  | 'activity_name' | 'description'
  | 'duration_hours' | 'billable_hours' | 'is_billable' | 'rate' | 'amount'
  | 'status' | 'period'

export type CellValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number; format: string }
  | { type: 'date'; value: Date }

export interface ColumnDef {
  key: ColumnKey
  label: string
  width: number
  align: 'left' | 'right'
  cell: (entry: TimeEntryFull) => CellValue
  /** Spalten, die in der Fusszeile summiert werden. */
  sums?: boolean
}

const HOURS_FORMAT = '#,##0.00'
const EURO_FORMAT = '#,##0.00 "€"'

const STATUS_LABEL: Record<string, string> = {
  draft: 'offen', submitted: 'gemeldet', invoiced: 'abgerechnet',
}

export const COLUMNS: ColumnDef[] = [
  { key: 'work_date', label: 'Datum', width: 12, align: 'left',
    cell: (e) => ({ type: 'date', value: fromIsoDate(e.work_date) }) },

  { key: 'iso_week', label: 'KW', width: 6, align: 'right',
    cell: (e) => ({ type: 'number', value: isoWeek(fromIsoDate(e.work_date)).week, format: '0' }) },

  { key: 'month', label: 'Monat', width: 10, align: 'left',
    cell: (e) => ({ type: 'text', value: e.work_date.slice(0, 7) }) },

  { key: 'customer_code', label: 'Kundenkürzel', width: 14, align: 'left',
    cell: (e) => ({ type: 'text', value: e.customer_code }) },

  { key: 'customer_name', label: 'Kunde', width: 26, align: 'left',
    cell: (e) => ({ type: 'text', value: e.customer_name }) },

  { key: 'project_code', label: 'Projektkürzel', width: 14, align: 'left',
    cell: (e) => ({ type: 'text', value: e.project_code }) },

  { key: 'project_name', label: 'Projekt', width: 26, align: 'left',
    cell: (e) => ({ type: 'text', value: e.project_name }) },

  { key: 'work_package_code', label: 'AP', width: 10, align: 'left',
    cell: (e) => ({ type: 'text', value: e.work_package_code ?? '' }) },

  { key: 'work_package_name', label: 'Arbeitspaket', width: 24, align: 'left',
    cell: (e) => ({ type: 'text', value: e.work_package_name ?? '' }) },

  { key: 'activity_name', label: 'Tätigkeitsart', width: 18, align: 'left',
    cell: (e) => ({ type: 'text', value: e.activity_name ?? '' }) },

  { key: 'description', label: 'Beschreibung', width: 48, align: 'left',
    cell: (e) => ({ type: 'text', value: e.description }) },

  { key: 'duration_hours', label: 'Erfasst (h)', width: 12, align: 'right', sums: true,
    cell: (e) => ({ type: 'number', value: e.duration_minutes / 60, format: HOURS_FORMAT }) },

  { key: 'billable_hours', label: 'Abrechenbar (h)', width: 16, align: 'right', sums: true,
    cell: (e) => ({ type: 'number', value: e.billable_minutes / 60, format: HOURS_FORMAT }) },

  { key: 'is_billable', label: 'Abrechenbar', width: 12, align: 'left',
    cell: (e) => ({ type: 'text', value: e.is_billable ? 'ja' : 'nein' }) },

  { key: 'rate', label: 'Stundensatz', width: 14, align: 'right',
    cell: (e) => ({ type: 'number', value: Number(e.rate ?? 0), format: EURO_FORMAT }) },

  { key: 'amount', label: 'Betrag', width: 14, align: 'right', sums: true,
    cell: (e) => ({ type: 'number', value: Number(e.amount ?? 0), format: EURO_FORMAT }) },

  { key: 'status', label: 'Status', width: 12, align: 'left',
    cell: (e) => ({ type: 'text', value: STATUS_LABEL[e.status] ?? e.status }) },

  { key: 'period', label: 'Periode', width: 14, align: 'left',
    cell: (e) => ({ type: 'text', value: e.period_id ? e.month_start.slice(0, 7) : '' }) },
]

export const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]))

/** Voreinstellung: was ein Kundenreport üblicherweise enthält. */
export const DEFAULT_COLUMNS: ColumnKey[] = [
  'work_date', 'project_name', 'activity_name', 'description', 'billable_hours', 'amount',
]

/** Zellwert als Text – für die Vorschau in der Oberfläche. */
export function cellText(value: CellValue): string {
  switch (value.type) {
    case 'date':
      return formatDate(value.value.toISOString().slice(0, 10))
    case 'number':
      return value.value.toLocaleString('de-DE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })
    default:
      return value.value
  }
}
