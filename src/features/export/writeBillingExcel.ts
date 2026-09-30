import writeXlsxFile from 'write-excel-file/browser'
import type { Row, Sheet, SheetData } from 'write-excel-file/browser'
import { formatMonth } from '@/lib/format'
import { minutesToHours } from '@/lib/week'
import type { BillingRow } from './api'
import { blattNamen, type KundeImMonat, type Monatsgliederung } from './monat'
import { headerCell } from './writeExcel'

/**
 * Die Monatsuebersicht als Tabellendatei: ein Blatt je Kunde, bei mehreren
 * Kunden vorneweg eine Uebersicht. Die Zahlen stehen so in der Datei, wie die
 * Sicht sie liefert - auch die Summen werden nicht neu gebildet.
 */
const EURO = '#,##0.00 "€"'
const HOURS = '#,##0.00'

const rahmen = { borderColor: '#e6eaee', borderStyle: 'thin' as const }
const summenRand = { fontWeight: 'bold' as const, topBorderStyle: 'medium' as const }

function stunden(minuten: number, extra = {}) {
  return { ...rahmen, ...extra, type: Number, value: minuten / 60, format: HOURS,
           align: 'right' as const }
}
function euro(betrag: number | null, extra = {}) {
  return betrag === null
    ? { ...rahmen, ...extra, type: String, value: 'kein Satz', align: 'right' as const }
    : { ...rahmen, ...extra, type: Number, value: Number(betrag), format: EURO,
        align: 'right' as const }
}

/** Was an einer Summe haengt und in der Datei nicht untergehen soll. */
function hinweise(summe: BillingRow): Row[] {
  const zeilen: Row[] = []
  if (summe.minutes_without_rate > 0) {
    zeilen.push([{ type: String, value:
      `${minutesToHours(summe.minutes_without_rate)} h ohne gültigen Stundensatz – mit 0,00 € enthalten.` }])
  }
  if (summe.open_periods > 0) {
    zeilen.push([{ type: String, value: summe.open_periods === 1
      ? '1 Meldeperiode mit Zeiten aus diesem Monat ist noch nicht gemeldet.'
      : `${summe.open_periods} Meldeperioden mit Zeiten aus diesem Monat sind noch nicht gemeldet.` }])
  }
  return zeilen.length > 0 ? [[{}], ...zeilen] : []
}

function kundenBlatt(kunde: KundeImMonat, monat: string, name: string): Sheet<Blob> {
  const { summe, projekte } = kunde
  const kopf: Row[] = [
    [{ value: summe.customer_name ?? '', fontWeight: 'bold' as const, fontSize: 14 }],
    [{ value: 'Leistungsmonat', fontWeight: 'bold' as const },
     { type: String, value: formatMonth(monat) }],
    [{}],
  ]
  const spalten = [
    { label: 'Projektkürzel', align: 'left' as const, width: 14 },
    { label: 'Projekt', align: 'left' as const, width: 36 },
    { label: 'Stunden', align: 'right' as const, width: 12 },
    { label: 'Ø Satz', align: 'right' as const, width: 14 },
    { label: 'Umsatz', align: 'right' as const, width: 16 },
  ]
  const body: Row[] = projekte.map((p) => [
    { ...rahmen, type: String, value: p.project_code ?? '' },
    { ...rahmen, type: String, value: p.project_name ?? '' },
    stunden(p.minutes_billable),
    euro(p.avg_rate),
    euro(p.fees),
  ])
  const summenZeile: Row = [
    { ...summenRand, type: String, value: `Summe ${summe.customer_name ?? ''}` },
    { ...summenRand },
    stunden(summe.minutes_billable, summenRand),
    euro(summe.avg_rate, summenRand),
    euro(summe.fees, summenRand),
  ]
  const data: SheetData = [
    ...kopf,
    spalten.map((s) => headerCell(s.label, s.align)),
    ...body,
    summenZeile,
    ...hinweise(summe),
  ]
  return {
    sheet: name, data,
    columns: spalten.map((s) => ({ width: s.width })),
    stickyRowsCount: kopf.length + 1,
  }
}

function uebersichtBlatt(gliederung: Monatsgliederung, monat: string): Sheet<Blob> {
  const kopf: Row[] = [
    [{ value: `Monatsübersicht ${formatMonth(monat)}`, fontWeight: 'bold' as const, fontSize: 14 }],
    [{}],
  ]
  const spalten = [
    { label: 'Kundenkürzel', align: 'left' as const, width: 14 },
    { label: 'Kunde', align: 'left' as const, width: 36 },
    { label: 'Stunden', align: 'right' as const, width: 12 },
    { label: 'Ø Satz', align: 'right' as const, width: 14 },
    { label: 'Umsatz', align: 'right' as const, width: 16 },
    { label: 'Offene Perioden', align: 'right' as const, width: 16 },
  ]
  const body: Row[] = gliederung.kunden.map(({ summe }) => [
    { ...rahmen, type: String, value: summe.customer_code ?? '' },
    { ...rahmen, type: String, value: summe.customer_name ?? '' },
    stunden(summe.minutes_billable),
    euro(summe.avg_rate),
    euro(summe.fees),
    { ...rahmen, type: Number, value: summe.open_periods, align: 'right' as const },
  ])
  const gesamt = gliederung.gesamt
  const summenZeile: Row = gesamt
    ? [
        { ...summenRand, type: String, value: 'Gesamt' },
        { ...summenRand },
        stunden(gesamt.minutes_billable, summenRand),
        euro(gesamt.avg_rate, summenRand),
        euro(gesamt.fees, summenRand),
        { ...summenRand, type: Number, value: gesamt.open_periods, align: 'right' as const },
      ]
    : []
  return {
    sheet: 'Übersicht',
    data: [...kopf, spalten.map((s) => headerCell(s.label, s.align)), ...body, summenZeile] as SheetData,
    columns: spalten.map((s) => ({ width: s.width })),
    stickyRowsCount: kopf.length + 1,
  }
}

export async function exportBillingToExcel({
  gliederung, monat, fileName,
}: {
  gliederung: Monatsgliederung
  monat: string
  fileName: string
}): Promise<void> {
  const namen = blattNamen(gliederung.kunden.map((k) => k.summe.customer_code ?? ''))
  const kunden = gliederung.kunden.map((k, i) => kundenBlatt(k, monat, namen[i]!))
  // Bei einem einzigen Kunden sagte die Uebersicht nur dasselbe noch einmal.
  const blaetter = kunden.length > 1 ? [uebersichtBlatt(gliederung, monat), ...kunden] : kunden
  await writeXlsxFile(blaetter).toFile(fileName)
}
