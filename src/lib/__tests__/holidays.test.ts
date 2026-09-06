import { describe, expect, it } from 'vitest'
import { toIsoDate } from '@/lib/week'
import { easterSunday, holidaysFor } from '@/lib/holidays'

describe('Ostersonntag', () => {
  it('trifft bekannte Termine', () => {
    // Nachschlagbare Werte - daran haengen alle beweglichen Feiertage.
    expect(toIsoDate(easterSunday(2024))).toBe('2024-03-31')
    expect(toIsoDate(easterSunday(2025))).toBe('2025-04-20')
    expect(toIsoDate(easterSunday(2026))).toBe('2026-04-05')
    expect(toIsoDate(easterSunday(2027))).toBe('2027-03-28')
    expect(toIsoDate(easterSunday(2028))).toBe('2028-04-16')
  })

  it('faellt immer auf einen Sonntag', () => {
    for (let jahr = 2020; jahr <= 2040; jahr++) {
      expect(easterSunday(jahr).getDay()).toBe(0)
    }
  })
})

describe('Feiertage je Bundesland', () => {
  it('leitet die beweglichen Tage korrekt aus Ostern ab', () => {
    const bw = holidaysFor(2026, 'DE-BW')
    const finde = (name: string) => bw.find((h) => h.name === name)?.date
    expect(finde('Karfreitag')).toBe('2026-04-03')          // Ostern - 2
    expect(finde('Ostermontag')).toBe('2026-04-06')         // Ostern + 1
    expect(finde('Christi Himmelfahrt')).toBe('2026-05-14') // Ostern + 39
    expect(finde('Pfingstmontag')).toBe('2026-05-25')       // Ostern + 50
    expect(finde('Fronleichnam')).toBe('2026-06-04')        // Ostern + 60
  })

  it('unterscheidet die Bundesländer', () => {
    const namen = (region: Parameters<typeof holidaysFor>[1]) =>
      holidaysFor(2026, region).map((h) => h.name)

    expect(namen('DE-BY')).toContain('Allerheiligen')
    expect(namen('DE-BE')).not.toContain('Allerheiligen')
    expect(namen('DE-BE')).toContain('Internationaler Frauentag')
    expect(namen('DE-SN')).toContain('Buß- und Bettag')
    expect(namen('DE-BY')).not.toContain('Buß- und Bettag')
    expect(namen('DE-NI')).toContain('Reformationstag')
    expect(namen('DE-BW')).not.toContain('Reformationstag')
  })

  it('setzt den Buß- und Bettag auf den Mittwoch vor dem 23. November', () => {
    for (const jahr of [2025, 2026, 2027, 2028]) {
      const tag = holidaysFor(jahr, 'DE-SN').find((h) => h.name === 'Buß- und Bettag')!
      const [y, m, d] = tag.date.split('-').map(Number)
      const datum = new Date(y!, m! - 1, d!)
      expect(datum.getDay()).toBe(3)                       // Mittwoch
      expect(datum.getTime()).toBeLessThan(new Date(jahr, 10, 23).getTime())
      expect(new Date(jahr, 10, 23).getTime() - datum.getTime()).toBeLessThanOrEqual(7 * 864e5)
    }
  })

  it('enthält überall die neun bundesweiten Tage', () => {
    const bundesweit = ['Neujahr', 'Karfreitag', 'Ostermontag', 'Tag der Arbeit',
                        'Christi Himmelfahrt', 'Pfingstmontag', 'Tag der Deutschen Einheit',
                        '1. Weihnachtstag', '2. Weihnachtstag']
    for (const region of ['DE-BY', 'DE-BE', 'DE-HH', 'DE-SN'] as const) {
      const namen = holidaysFor(2026, region).map((h) => h.name)
      for (const tag of bundesweit) expect(namen).toContain(tag)
    }
  })
})
