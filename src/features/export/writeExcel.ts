import writeXlsxFile from 'write-excel-file/browser'
import type { Row, SheetData } from 'write-excel-file/browser'
import type { TimeEntryFull } from '@/types/database'
import { COLUMN_BY_KEY, type ColumnKey } from './columns'

/**
 * Erzeugt die Tabellendatei im Browser und laedt sie herunter.
 *
 * Bewusst nicht SheetJS: dessen npm-Paket steht seit 0.18.5 still und traegt
 * zwei hochstufige Advisories ohne verfuegbare Behebung (Prototype Pollution,
 * ReDoS). write-excel-file kann nur schreiben - genau das, was hier gebraucht
 * wird - und ist ohne Befund.
 */
export async function exportToExcel({
  rows, columns, fileName, title,
}: {
  rows: TimeEntryFull[]
  columns: ColumnKey[]
  fileName: string
  title: string
}): Promise<void> {
  const defs = columns.map((key) => COLUMN_BY_KEY.get(key)).filter((c) => c !== undefined)

  const header: Row = defs.map((def) => ({
    value: def.label,
    fontWeight: 'bold' as const,
    backgroundColor: '#eaf2f8',
    borderColor: '#a9b4c0',
    borderStyle: 'thin' as const,
    align: def.align,
  }))

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

  // Seit Version 4 liefert writeXlsxFile ein Objekt mit toFile()/toBlob(),
  // statt den Dateinamen entgegenzunehmen.
  await writeXlsxFile(data, {
    sheet: title.slice(0, 31) || 'Zeiten',
    columns: defs.map((def) => ({ width: def.width })),
    stickyRowsCount: 1,
  }).toFile(fileName)
}
