import writeXlsxFile from 'write-excel-file/browser'
import type { Row, SheetData } from 'write-excel-file/browser'
import type { ExpenseFull, TimeEntryFull } from '@/types/database'
import { COLUMN_BY_KEY, type ColumnKey } from './columns'

/**
 * Erzeugt die Tabellendatei im Browser und laedt sie herunter.
 *
 * Bewusst nicht SheetJS: dessen npm-Paket steht seit 0.18.5 still und traegt
 * zwei hochstufige Advisories ohne verfuegbare Behebung (Prototype Pollution,
 * ReDoS). write-excel-file kann nur schreiben - genau das, was hier gebraucht
 * wird - und ist ohne Befund.
 */
const EURO = '#,##0.00 "€"'
const HOURS = '#,##0.00'

/** Kopfzelle: fett, getoent, mit Rahmen - in beiden Blaettern gleich. */
function headerCell(label: string, align: 'left' | 'right') {
  return {
    value: label, fontWeight: 'bold' as const, backgroundColor: '#eaf2f8',
    borderColor: '#a9b4c0', borderStyle: 'thin' as const, align,
  }
}

/**
 * Spesen als eigenes Blatt. Sie erscheinen im Kundenreport als eigener Block -
 * ein Betrag gehoert nicht in eine Spalte, die Stunden zaehlt.
 */
function expenseSheet(expenses: ExpenseFull[]) {
  const spalten: { label: string; align: 'left' | 'right'; width: number }[] = [
    { label: 'Datum', align: 'left', width: 12 },
    { label: 'Kunde', align: 'left', width: 26 },
    { label: 'Projekt', align: 'left', width: 26 },
    { label: 'Art', align: 'left', width: 18 },
    { label: 'Beschreibung', align: 'left', width: 42 },
    { label: 'Menge', align: 'right', width: 10 },
    { label: 'Satz', align: 'right', width: 12 },
    { label: 'Betrag', align: 'right', width: 14 },
    { label: 'Weiterberechenbar', align: 'left', width: 18 },
    { label: 'Aufschlag %', align: 'right', width: 12 },
    { label: 'Weiterberechnet', align: 'right', width: 16 },
  ]

  const rahmen = { borderColor: '#e6eaee', borderStyle: 'thin' as const }
  const body: Row[] = expenses.map((e) => [
    { ...rahmen, type: Date, value: new Date(e.expense_date + 'T00:00:00'), format: 'dd.mm.yyyy' },
    { ...rahmen, type: String, value: e.customer_name },
    { ...rahmen, type: String, value: e.project_name },
    { ...rahmen, type: String, value: e.category_name },
    { ...rahmen, type: String, value: e.description },
    e.quantity !== null
      ? { ...rahmen, type: Number, value: Number(e.quantity), format: HOURS, align: 'right' as const }
      : { ...rahmen },
    e.unit_rate !== null
      ? { ...rahmen, type: Number, value: Number(e.unit_rate), format: EURO, align: 'right' as const }
      : { ...rahmen },
    { ...rahmen, type: Number, value: Number(e.amount_net), format: EURO, align: 'right' as const },
    { ...rahmen, type: String, value: e.is_rechargeable ? 'ja' : 'nein' },
    { ...rahmen, type: Number, value: Number(e.markup_percent), format: '0.##', align: 'right' as const },
    { ...rahmen, type: Number, value: e.is_rechargeable ? Number(e.amount_recharged) : 0,
      format: EURO, align: 'right' as const },
  ])

  const summe: Row = spalten.map((spalte, index) => {
    if (index === 0) {
      return { value: 'Summe', fontWeight: 'bold' as const, topBorderStyle: 'medium' as const }
    }
    if (spalte.label === 'Betrag') {
      return { type: Number, value: expenses.reduce((n, e) => n + Number(e.amount_net), 0),
               format: EURO, fontWeight: 'bold' as const, align: 'right' as const,
               topBorderStyle: 'medium' as const }
    }
    if (spalte.label === 'Weiterberechnet') {
      return { type: Number,
               value: expenses.filter((e) => e.is_rechargeable)
                              .reduce((n, e) => n + Number(e.amount_recharged), 0),
               format: EURO, fontWeight: 'bold' as const, align: 'right' as const,
               topBorderStyle: 'medium' as const }
    }
    return { topBorderStyle: 'medium' as const }
  })

  return {
    data: [spalten.map((s) => headerCell(s.label, s.align)), ...body, summe] as SheetData,
    columns: spalten.map((s) => ({ width: s.width })),
  }
}

export async function exportToExcel({
  rows, expenses, columns, fileName, title,
}: {
  rows: TimeEntryFull[]
  expenses: ExpenseFull[]
  columns: ColumnKey[]
  fileName: string
  title: string
}): Promise<void> {
  const defs = columns.map((key) => COLUMN_BY_KEY.get(key)).filter((c) => c !== undefined)

  const header: Row = defs.map((def) => headerCell(def.label, def.align))

  const body: Row[] = rows.map((entry) =>
    defs.map((def) => {
      const cell = def.cell(entry)
      const common = { align: def.align, borderColor: '#e6eaee', borderStyle: 'thin' as const }
      if (cell.type === 'number') {
        return { ...common, type: Number, value: cell.value, format: cell.format }
      }
      if (cell.type === 'date') {
        return { ...common, type: Date, value: cell.value, format: 'dd.mm.yyyy' }
      }
      return { ...common, type: String, value: cell.value }
    }),
  )

  // Summenzeile nur fuer die Spalten, bei denen eine Summe etwas bedeutet.
  // Eine aufsummierte Spalte "Stundensatz" waere schlicht eine falsche Zahl.
  const totals: Row = defs.map((def, index) => {
    if (!def.sums) {
      return index === 0
        ? { value: 'Summe', fontWeight: 'bold' as const, align: 'left' as const,
            topBorderStyle: 'medium' as const }
        : { topBorderStyle: 'medium' as const }   // leer, aber mit Trennlinie darüber
    }
    const sum = rows.reduce((n, entry) => {
      const cell = def.cell(entry)
      return n + (cell.type === 'number' ? cell.value : 0)
    }, 0)
    const first = rows[0] ? def.cell(rows[0]) : null
    return {
      type: Number,
      value: sum,
      format: first?.type === 'number' ? first.format : '#,##0.00',
      fontWeight: 'bold' as const,
      align: 'right' as const,
      topBorderStyle: 'medium' as const,
    }
  })

  const data: SheetData = rows.length > 0 ? [header, ...body, totals] : [header]

  const zeitenBlatt = {
    name: (title.slice(0, 24) || 'Zeiten'),
    data,
    columns: defs.map((def) => ({ width: def.width })),
    stickyRowsCount: 1,
  }

  const blaetter = expenses.length > 0
    ? [zeitenBlatt, { name: 'Spesen', stickyRowsCount: 1, ...expenseSheet(expenses) }]
    : [zeitenBlatt]

  // Seit Version 4 liefert writeXlsxFile ein Objekt mit toFile()/toBlob(),
  // statt den Dateinamen entgegenzunehmen.
  await writeXlsxFile(blaetter).toFile(fileName)
}
