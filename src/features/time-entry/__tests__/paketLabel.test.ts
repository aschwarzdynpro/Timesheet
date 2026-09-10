import { describe, expect, it } from 'vitest'
import { paketLabel } from '@/features/time-entry/PackageBudget'
import type { WorkPackageBudget } from '@/types/database'

const paket = (werte: Partial<WorkPackageBudget>): WorkPackageBudget => ({
  work_package_id: 'wp-1',
  project_id: 'p-1',
  code: '13206 DEV',
  name: 'Implementierung',
  is_active: true,
  sort_order: 0,
  budget_hours: null,
  budget_amount: null,
  tracked_minutes: 0,
  billable_minutes: 0,
  fees: 0,
  entry_count: 0,
  expenses_recharged: 0,
  description: null,
  ...werte,
})

/** Schmale Leerraeume der deutschen Formatierung als gewoehnliches Leerzeichen. */
const schlicht = (text: string) => text.replace(/\s/g, ' ')

/**
 * Die Auswahlliste beim Erfassen zeigt denselben Stand wie das Plaettchen
 * daneben - "gebucht / gesamt", nur als Text.
 */
describe('Arbeitspaket in der Auswahlliste', () => {
  it('haengt gebucht und gesamt an das Kuerzel', () => {
    expect(paketLabel('13206 DEV', paket({ budget_hours: 16, tracked_minutes: 840 })))
      .toBe('13206 DEV · 14 h / 16 h')
  })

  it('zeigt das Betragsbudget am Honorar', () => {
    // formatEuro trennt Zahl und Zeichen mit einem schmalen Leerraum - fuer den
    // Vergleich steht hier ein gewoehnliches Leerzeichen.
    expect(schlicht(paketLabel('ALM', paket({ budget_amount: 5000, fees: 1200 }))))
      .toBe('ALM · 1.200,00 € / 5.000,00 €')
  })

  it('zeigt beide Budgets, wenn ein Paket beide traegt', () => {
    const label = schlicht(paketLabel('PMO', paket({
      budget_hours: 10, tracked_minutes: 300, budget_amount: 2000, fees: 500,
    })))
    expect(label).toBe('PMO · 5 h / 10 h · 500,00 € / 2.000,00 €')
  })

  it('laesst es beim Kuerzel, wenn das Paket kein Budget hat', () => {
    // Auch mit gebuchter Zeit: eine Zahl ohne Bezug in jeder Zeile verdeckt
    // nur die Kuerzel, nach denen man sucht.
    expect(paketLabel('SUPPORT', paket({ tracked_minutes: 720 }))).toBe('SUPPORT')
    expect(paketLabel('SUPPORT', undefined)).toBe('SUPPORT')
  })

  it('nennt ein punktgenau aufgebrauchtes Budget aufgebraucht statt ueberzogen', () => {
    // 1,9999 von 2 stuende sonst als "2 h / 2 h" da - dieselbe Rundung wie im
    // Plaettchen, sonst rechneten zwei Ansichten derselben Zahl verschieden.
    expect(paketLabel('GOLIVE', paket({ budget_hours: 2, tracked_minutes: 119.994 })))
      .toBe('GOLIVE · 2 h / 2 h')
  })

  it('behaelt den Namen, wo die Liste ihn zeigt', () => {
    expect(paketLabel('13206 DEV · Implementierung',
                      paket({ budget_hours: 16, tracked_minutes: 840 })))
      .toBe('13206 DEV · Implementierung · 14 h / 16 h')
  })
})
