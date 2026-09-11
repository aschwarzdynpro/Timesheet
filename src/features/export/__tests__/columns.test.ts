import { describe, expect, it } from 'vitest'
import type { TimeEntryFull } from '@/types/database'
import { COLUMN_BY_KEY, cellText, periodLabel } from '../columns'

/** Ein Eintrag aus der Sicht, wie PostgREST ihn nach der Migration liefert. */
function eintrag(teil: Partial<TimeEntryFull> = {}): TimeEntryFull {
  return {
    id: 'e1', owner_id: 'u1', project_id: 'p1', activity_type_id: null, work_package_id: null,
    work_date: '2026-09-02', start_time: null, end_time: null,
    duration_minutes: 60, billable_minutes: 60, is_billable: true, description: 'Feldanalyse',
    rate_snapshot: null, period_id: 'rp1', status: 'draft',
    work_package_code: null, work_package_name: null,
    project_code: 'MIGR', project_name: 'Datenmigration',
    customer_id: 'c1', customer_code: 'NORD', customer_name: 'Nordwind Logistik GmbH',
    activity_code: null, activity_name: null, rate: 125, amount: 125, rate_is_frozen: false,
    iso_year: 2026, iso_week: 36, week_start: '2026-08-31', month_start: '2026-09-01', year: 2026,
    period_cycle: 'weekly', period_start: '2026-08-30', period_end: '2026-09-05', period_status: 'open',
    ...teil,
  }
}

describe('Spalte Periode', () => {
  const periode = COLUMN_BY_KEY.get('period')!

  it('beschriftet eine Woche mit ihren Grenzen, nicht mit dem Monat des Leistungstages', () => {
    // Sonntagswoche 30.08.-05.09.2026 ueber den Monatswechsel: beide Eintraege
    // liegen in derselben Periode. Aus month_start waeren es "2026-08" und
    // "2026-09" geworden - zwei Werte fuer eine Periode.
    const august = eintrag({ work_date: '2026-08-31', month_start: '2026-08-01' })
    const september = eintrag({ work_date: '2026-09-02', month_start: '2026-09-01' })

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
