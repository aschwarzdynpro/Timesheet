import { describe, expect, it } from 'vitest'
import { anteileJeKunde } from '@/features/time-entry/kunden'
import type { TimeEntryFull } from '@/types/database'

/** Nur die Felder, auf die die Aufteilung schaut - der Rest der Sicht fehlt hier. */
const eintrag = (
  kunde: string, minuten: number, name = kunde,
) => ({
  customer_id: `id-${kunde}`, customer_code: kunde, customer_name: name,
  duration_minutes: minuten,
} as TimeEntryFull)

describe('Tagessumme je Kunde', () => {
  it('summiert die Eintraege eines Kunden', () => {
    const anteile = anteileJeKunde([
      eintrag('HSO', 120), eintrag('HSO', 360), eintrag('SYS', 180),
    ])
    expect(anteile.map((a) => [a.code, a.minuten])).toEqual([['HSO', 480], ['SYS', 180]])
  })

  it('stellt den groessten Anteil nach oben', () => {
    // Die Reihenfolge ist die Antwort auf "wo lag der Tag schwerpunktmaessig".
    const anteile = anteileJeKunde([eintrag('SYS', 60), eintrag('HSO', 480)])
    expect(anteile[0]?.code).toBe('HSO')
  })

  it('entscheidet bei gleicher Dauer nach dem Namen', () => {
    // Sonst haengt die Reihenfolge daran, welcher Eintrag zufaellig zuerst
    // gespeichert wurde - und die Leiste sortierte sich beim Nachtragen um.
    const vorwaerts = anteileJeKunde([eintrag('SYS', 480), eintrag('HSO', 480)])
    const rueckwaerts = anteileJeKunde([eintrag('HSO', 480), eintrag('SYS', 480)])
    expect(vorwaerts.map((a) => a.code)).toEqual(['HSO', 'SYS'])
    expect(rueckwaerts.map((a) => a.code)).toEqual(['HSO', 'SYS'])
  })

  it('liefert bei einem einzigen Kunden genau einen Anteil', () => {
    // Die Ansichten zeigen die Zeile erst ab zwei: bei einem waere sie die
    // Tagessumme ein zweites Mal, nur mit einem Kuerzel davor.
    expect(anteileJeKunde([eintrag('HSO', 480)])).toHaveLength(1)
    expect(anteileJeKunde([])).toEqual([])
  })
})
