import { describe, expect, it } from 'vitest'
import {
  addDays, fromIsoDate, isoWeek, minutesToClock, minutesToHours,
  mondayOf, parseDuration, toIsoDate, weekDays,
} from '@/lib/week'

const d = (iso: string) => fromIsoDate(iso)

describe('Wochenberechnung', () => {
  it('findet den Montag der Woche', () => {
    expect(toIsoDate(mondayOf(d('2026-03-05')))).toBe('2026-03-02') // Donnerstag
    expect(toIsoDate(mondayOf(d('2026-03-02')))).toBe('2026-03-02') // Montag selbst
    expect(toIsoDate(mondayOf(d('2026-03-08')))).toBe('2026-03-02') // Sonntag gehoert zur Vorwoche
  })

  it('ordnet den Jahreswechsel nach ISO-8601 zu', () => {
    // Der Donnerstag entscheidet. Genau das prueft auch der Datenbanktest.
    expect(isoWeek(d('2027-01-01'))).toEqual({ year: 2026, week: 53 })
    expect(isoWeek(d('2026-01-01'))).toEqual({ year: 2026, week: 1 })
    expect(isoWeek(d('2025-12-29'))).toEqual({ year: 2026, week: 1 })
  })

  it('zaehlt Wochen innerhalb des Jahres richtig', () => {
    expect(isoWeek(d('2026-09-06'))).toEqual({ year: 2026, week: 36 })
    expect(isoWeek(d('2026-09-07'))).toEqual({ year: 2026, week: 37 })
    expect(isoWeek(d('2026-12-31'))).toEqual({ year: 2026, week: 53 })
  })

  it('liefert sieben Tage ab Montag', () => {
    const days = weekDays(d('2026-03-02'))
    expect(days).toHaveLength(7)
    expect(toIsoDate(days[0]!)).toBe('2026-03-02')
    expect(toIsoDate(days[6]!)).toBe('2026-03-08')
  })

  it('rechnet ueber Monatsgrenzen', () => {
    expect(toIsoDate(addDays(d('2026-03-31'), 1))).toBe('2026-04-01')
    expect(toIsoDate(addDays(d('2026-01-01'), -1))).toBe('2025-12-31')
  })

  it('verschiebt Daten nicht durch Zeitzonen', () => {
    // Der klassische Fehler: new Date('2026-03-31') ist UTC-Mitternacht und
    // wird in westlichen Zonen zum 30.03.
    expect(toIsoDate(fromIsoDate('2026-03-31'))).toBe('2026-03-31')
    expect(toIsoDate(fromIsoDate('2026-01-01'))).toBe('2026-01-01')
  })
})

describe('Dauereingabe', () => {
  it('versteht Dezimalstunden mit Komma und Punkt', () => {
    expect(parseDuration('1,5')).toBe(90)
    expect(parseDuration('1.5')).toBe(90)
    expect(parseDuration('2')).toBe(120)
    expect(parseDuration('0,25')).toBe(15)
  })

  it('versteht Stunden:Minuten', () => {
    expect(parseDuration('1:30')).toBe(90)
    expect(parseDuration('0:45')).toBe(45)
    expect(parseDuration('10:05')).toBe(605)
  })

  it('versteht Einheiten', () => {
    expect(parseDuration('90m')).toBe(90)
    expect(parseDuration('90 min')).toBe(90)
    expect(parseDuration('2h')).toBe(120)
    expect(parseDuration('1,5 h')).toBe(90)
  })

  it('lehnt Unsinn ab, statt still zu raten', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('1:75')).toBeNull()
    expect(parseDuration('-2')).toBeNull()
  })
})

describe('Dauerausgabe', () => {
  it('zeigt Dezimalstunden deutsch', () => {
    expect(minutesToHours(90)).toBe('1,50')
    expect(minutesToHours(20)).toBe('0,33')
  })

  it('zeigt kompakte Uhrzeitschreibweise', () => {
    expect(minutesToClock(90)).toBe('1:30')
    expect(minutesToClock(605)).toBe('10:05')
    expect(minutesToClock(60)).toBe('1:00')
  })
})
