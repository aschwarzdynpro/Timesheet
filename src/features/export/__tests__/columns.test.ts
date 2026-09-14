import { describe, expect, it } from 'vitest'
import { COLUMN_BY_KEY, cellText, columnDefs, periodLabel } from '@/features/export/columns'
import type { ColumnKey } from '@/features/export/columns'
import type { TimeEntryFull } from '@/types/database'

const eintrag = (werte: Partial<TimeEntryFull> = {}): TimeEntryFull => ({
  id: 'te-1',
  owner_id: 'u-1',
  project_id: 'p-1',
  activity_type_id: null,
  work_package_id: null,
  work_date: '2026-09-09',
  start_time: null,
  end_time: null,
  duration_minutes: 480,
  billable_minutes: 480,
  is_billable: true,
  description: 'Weekly',
  rate_snapshot: null,
  period_id: 'per-1',
  status: 'draft',
  work_package_code: null,
  work_package_name: null,
  project_code: 'SCHULZ',
  project_name: 'Schulz',
  customer_id: 'k-1',
  customer_code: 'HSO',
  customer_name: 'HSO CRM Solutions AG',
  activity_code: null,
  activity_name: 'Arbeit',
  rate: 125,
  amount: 1000,
  rate_is_frozen: false,
  iso_year: 2026,
  iso_week: 37,
  week_start: '2026-09-07',
  month_start: '2026-09-01',
  year: 2026,
  period_cycle: 'weekly',
  period_start: '2026-09-07',
  period_end: '2026-09-13',
  period_status: 'open',
  ...werte,
})

const zelle = (key: ColumnKey, eintragswerte: Partial<TimeEntryFull> = {}) => {
  const def = COLUMN_BY_KEY.get(key)
  if (!def) throw new Error(`Spalte ${key} fehlt im Katalog`)
  return def.cell(eintrag(eintragswerte))
}

/** Schmale Leerraeume der deutschen Formatierung als gewoehnliches Leerzeichen. */
const schlicht = (text: string) => text.replace(/\s/g, ' ')

/**
 * Der Arbeitstag traegt keine Zeitzone - und darf beim Weg in die Zelle keine
 * bekommen. Der Test laeuft in Europe/Berlin (siehe vitest.config.ts); in UTC
 * waere er blind, weil dort lokale und UTC-Mitternacht zusammenfallen.
 */
describe('Datumsspalte', () => {
  it('haelt den Tag fest, den der Eintrag traegt', () => {
    expect(cellText(zelle('work_date'))).toBe('09.09.2026')
  })

  it('liegt auf Mitternacht in UTC, damit die Datei denselben Tag zeigt', () => {
    const wert = zelle('work_date')
    expect(wert.type).toBe('date')
    if (wert.type !== 'date') return
    // Die Tabellenbibliothek rechnet die Datumszahl aus getTime(): lokale
    // Mitternacht waere hier 22:00 des Vortags und die Zelle zeigte den 08.09.
    expect(wert.value.getTime()).toBe(Date.UTC(2026, 8, 9))
  })

  it('zaehlt die Kalenderwoche nach dem Arbeitstag', () => {
    expect(cellText(zelle('iso_week'))).toBe('37')
  })
})

/**
 * In der Vorschau steht dasselbe wie in der Datei. Das Eurozeichen gehoert
 * dazu: "125,00" neben "8,00" laesst offen, was Stunden sind und was Geld.
 */
describe('Zahlenspalten', () => {
  it('zeigt Betraege mit Eurozeichen', () => {
    expect(schlicht(cellText(zelle('amount')))).toBe('1.000,00 €')
    expect(schlicht(cellText(zelle('rate')))).toBe('125,00 €')
  })

  it('zeigt Stunden ohne Zeichen', () => {
    expect(cellText(zelle('billable_hours', { billable_minutes: 90 }))).toBe('1,50')
  })
})

/**
 * Vorschau, Unterraster und Datei lesen dieselbe Folge - deshalb loest sie eine
 * Stelle auf.
 */
describe('Spaltenfolge', () => {
  it('behaelt die Reihenfolge der Auswahl', () => {
    expect(columnDefs(['amount', 'work_date']).map((d) => d.key)).toEqual(['amount', 'work_date'])
  })

  it('laesst unbekannte Schluessel weg, statt eine leere Spalte zu erfinden', () => {
    expect(columnDefs(['work_date', 'gibt_es_nicht' as ColumnKey]).map((d) => d.key))
      .toEqual(['work_date'])
  })
})

/**
 * Die Periode kommt aus `reporting_periods`, nicht aus dem Monat des
 * Leistungstages: eine Woche ueber den Monatswechsel haette sonst zwei Werte.
 */
describe('Spalte Periode', () => {
  const periode = COLUMN_BY_KEY.get('period')!

  it('beschriftet eine Woche mit ihren Grenzen, nicht mit dem Monat des Leistungstages', () => {
    // Sonntagswoche 30.08.-05.09.2026 ueber den Monatswechsel: beide Eintraege
    // liegen in derselben Periode. Aus month_start waeren es "2026-08" und
    // "2026-09" geworden - zwei Werte fuer eine Periode.
    const woche = { period_cycle: 'weekly', period_start: '2026-08-30', period_end: '2026-09-05' } as const
    const august = eintrag({ ...woche, work_date: '2026-08-31', month_start: '2026-08-01' })
    const september = eintrag({ ...woche, work_date: '2026-09-02', month_start: '2026-09-01' })

    expect(cellText(periode.cell(august))).toBe('30.08.2026 – 05.09.2026')
    expect(cellText(periode.cell(september))).toBe(cellText(periode.cell(august)))
  })

  it('nennt bei monatlicher Meldung den Monat der Periode', () => {
    const monat = eintrag({
      period_cycle: 'monthly', period_start: '2026-09-01', period_end: '2026-09-30',
    })
    expect(cellText(periode.cell(monat))).toBe('September 2026')
  })

  it('zeigt einen Gedankenstrich, solange die Sicht die Periodenspalten nicht fuehrt', () => {
    // Die Migration ist vor dem Frontend auszurollen. Bis dahin fehlen die
    // Spalten in der Antwort von PostgREST - und der Export darf dann keinen
    // Wert aus month_start erfinden.
    const alt: Partial<TimeEntryFull> = eintrag()
    delete alt.period_cycle
    delete alt.period_start
    delete alt.period_end
    delete alt.period_status

    expect(periodLabel(alt as TimeEntryFull)).toBe('–')
  })

  it('bleibt leer, wenn dem Eintrag keine Periode zugeordnet ist', () => {
    const ohne = eintrag({
      period_id: null, period_cycle: null, period_start: null, period_end: null, period_status: null,
    })
    expect(periodLabel(ohne)).toBe('')
  })
})
