import { describe, expect, it } from 'vitest'
import {
  formatDate, formatEuro, formatFactor, formatHours, formatPercent, formatRate, formatValidity,
  parseDecimal, sumOrNull, today,
} from '@/lib/format'

describe('Anzeigeformate', () => {
  it('zeigt Betraege in Euro', () => {
    expect(formatEuro(210)).toContain('210,00')
    expect(formatEuro(null)).toBe('–')
  })

  it('zeigt Stundensaetze je Stunde', () => {
    expect(formatRate(140)).toMatch(/140,00.*\/ h/)
  })

  it('rechnet Minuten erst in der Anzeige in Dezimalstunden um', () => {
    expect(formatHours(90)).toBe('1,50 h')
    expect(formatHours(20)).toBe('0,33 h')
    expect(formatHours(0)).toBe('0,00 h')
  })

  it('zeigt Datumsangaben deutsch, ohne Zeitzonenverschiebung', () => {
    // Der 31.03. darf nicht als 30.03. erscheinen, nur weil der Browser
    // in einer anderen Zeitzone steht.
    expect(formatDate('2026-03-31')).toBe('31.03.2026')
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
    expect(formatDate(null)).toBe('–')
  })

  it('liefert heute nach lokaler Zeit, nicht nach UTC', () => {
    // toISOString() haette in Berlin zwischen Mitternacht und zwei Uhr noch den
    // Vortag geliefert - ein Eintrag waere am falschen Tag und moeglicherweise
    // in der falschen Meldeperiode gelandet.
    const jetzt = new Date()
    const lokal = [
      jetzt.getFullYear(),
      String(jetzt.getMonth() + 1).padStart(2, '0'),
      String(jetzt.getDate()).padStart(2, '0'),
    ].join('-')
    expect(today()).toBe(lokal)
  })

  it('beschreibt offene und geschlossene Gueltigkeitszeitraeume', () => {
    expect(formatValidity('2026-01-01', null)).toBe('ab 01.01.2026')
    expect(formatValidity('2026-01-01', '2026-06-30')).toBe('01.01.2026 – 30.06.2026')
  })

  it('zeigt Prozentsaetze ohne ueberfluessige Nullen', () => {
    expect(formatPercent(42)).toBe('42 %')
    expect(formatPercent(42.5)).toBe('42,5 %')
    expect(formatPercent(null)).toBe('–')
  })
})

describe('Summen aus einer Spalte, die fehlen kann', () => {
  it('summiert vorhandene Werte', () => {
    expect(sumOrNull([1054.15, 100.5])).toBe(1154.65)
    expect(sumOrNull([])).toBe(0)
  })

  it('liefert null, sobald ein Wert fehlt - statt einer erfundenen 0,00 EUR', () => {
    // Genau dieser Fall: die Sicht kannte net_amount noch nicht, weil die
    // Migration fehlte. Die Woche zeigte 1.817,50 EUR Honorar und 0,00 EUR
    // danach - eine Zahl, die aussah wie ein Ergebnis.
    expect(sumOrNull([undefined, undefined])).toBeNull()
    expect(sumOrNull([1054.15, undefined])).toBeNull()
    expect(sumOrNull([1054.15, null])).toBeNull()
    expect(formatEuro(sumOrNull([1054.15, undefined]))).toBe('–')
  })
})

describe('Getippte Dezimalzahlen', () => {
  it('versteht deutsche und englische Schreibweise', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('1.5')).toBe(1.5)
    expect(parseDecimal(' 2 ')).toBe(2)
    expect(parseDecimal('0,3')).toBe(0.3)
  })

  it('lehnt ab, was keine Zahl ist - statt still eine Null zu liefern', () => {
    // Number('') ist 0. Bei einem Satzfaktor hiesse das "kostenlos", und genau
    // diese stille Null soll es nirgends geben.
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
    expect(parseDecimal('anderthalb')).toBeNull()
    expect(parseDecimal('1,5x')).toBeNull()
  })

  it('zeigt einen Satzfaktor ohne angehaengte Nullen', () => {
    // Aus der Datenbank kommt numeric(6,4), also 1.5000.
    expect(formatFactor(1.5)).toBe('1,5')
    expect(formatFactor(1)).toBe('1')
    expect(formatFactor(0.5)).toBe('0,5')
    expect(formatFactor(null)).toBe('–')
  })
})
