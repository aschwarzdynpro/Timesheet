import { describe, expect, it } from 'vitest'
import { COLUMN_BY_KEY, cellText, columnDefs } from '@/features/export/columns'
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
