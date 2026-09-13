import { formatDate, formatEuro } from '@/lib/format'
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
const INTEGER_FORMAT = '0'
const EURO_FORMAT = '#,##0.00 "€"'

/**
 * Ein Arbeitstag als Zellwert: Mitternacht in UTC.
 *
 * Excel kennt keine Zeitzone. Eine Datumszelle traegt eine Zahl - Tage seit
 * 1900 -, und die Tabellenbibliothek rechnet sie aus `getTime()`. Mitternacht
 * *lokal* ist in Berlin 22:00 des Vortags in UTC; die Datei zeigte dann den
 * Vortag, und dieselbe Verschiebung stand in der Vorschau. `fromIsoDate()`
 * bleibt davon unberuehrt: die Wochenlogik rechnet zu Recht lokal, nur diese
 * beiden Ausgaben duerfen es nicht.
 */
function datumsZelle(iso: string): CellValue {
  const [y, m, d] = iso.split('-').map(Number)
  return { type: 'date', value: new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)) }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'offen', submitted: 'gemeldet', invoiced: 'abgerechnet',
}

export const COLUMNS: ColumnDef[] = [
  { key: 'work_date', label: 'Datum', width: 12, align: 'left',
    cell: (e) => datumsZelle(e.work_date) },

  { key: 'iso_week', label: 'KW', width: 6, align: 'right',
    cell: (e) => ({ type: 'number', value: isoWeek(fromIsoDate(e.work_date)).week,
                    format: INTEGER_FORMAT }) },

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

/**
 * Die Beschreibungen zu einer Spaltenfolge, unbekannte Schluessel fallen weg.
 *
 * An einer Stelle, weil drei Ausgaben dieselbe Folge brauchen: die Vorschau auf
 * der Exportseite, das Unterraster einer Periode und die Datei selbst. Fielen
 * sie auseinander, zeigte die Vorschau etwas anderes als die Datei daneben.
 */
export function columnDefs(keys: ColumnKey[]): ColumnDef[] {
  return keys.map((key) => COLUMN_BY_KEY.get(key)).filter((def) => def !== undefined)
}

/** Voreinstellung: was ein Kundenreport üblicherweise enthält. */
export const DEFAULT_COLUMNS: ColumnKey[] = [
  'work_date', 'project_name', 'activity_name', 'description', 'billable_hours', 'amount',
]

/** Zellwert als Text – für die Vorschau in der Oberfläche. */
export function cellText(value: CellValue): string {
  switch (value.type) {
    case 'date':
      // Die Zelle traegt Mitternacht in UTC (siehe datumsZelle), deshalb liest
      // toISOString() genau den Tag, der auch in der Datei steht.
      return formatDate(value.value.toISOString().slice(0, 10))
    case 'number':
      // Das Zahlenformat der Zelle gilt auch hier, sonst zeigt die Vorschau
      // etwas anderes als die Datei daneben: Betraege mit Eurozeichen - "125,00"
      // neben "8,00" laesst offen, was Stunden sind und was Geld -, ganze Zahlen
      // ohne Nachkommastellen, denn "37,00" ist keine Kalenderwoche.
      if (value.format === EURO_FORMAT) return formatEuro(value.value)
      return value.value.toLocaleString('de-DE', {
        minimumFractionDigits: value.format === INTEGER_FORMAT ? 0 : 2,
        maximumFractionDigits: value.format === INTEGER_FORMAT ? 0 : 2,
      })
    default:
      return value.value
  }
}
