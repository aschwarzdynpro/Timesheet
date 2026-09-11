import { describe, expect, it } from 'vitest'
import {
  formatDate, formatEuro, formatHours, formatMonth, formatRate, formatValidity, today,
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

  it('schreibt den Monat einer Periode aus', () => {
    // Der Monatserste darf in keiner Zeitzone in den Vormonat rutschen.
    expect(formatMonth('2026-09-01')).toBe('September 2026')
    expect(formatMonth('2026-01-01')).toBe('Januar 2026')
    expect(formatMonth(null)).toBe('–')
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
})
