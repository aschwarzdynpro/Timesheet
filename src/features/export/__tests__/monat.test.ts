import { describe, expect, it } from 'vitest'
import { blattNamen, gliedereMonat, verschiebeMonat } from '@/features/export/monat'
import type { BillingRow } from '@/features/export/api'

const zeile = (werte: Partial<BillingRow>): BillingRow => ({
  month_start: '2026-08-01',
  level: 'project',
  customer_id: null, customer_code: null, customer_name: null,
  project_id: null, project_code: null, project_name: null,
  minutes_billable: 60, fees: 100, avg_rate: 100,
  minutes_without_rate: 0, open_periods: 0,
  ...werte,
})

const zeilen: BillingRow[] = [
  zeile({ level: 'total', minutes_billable: 300, fees: 500 }),
  zeile({ level: 'customer', customer_id: 'k-z', customer_name: 'Zeta AG', minutes_billable: 60 }),
  zeile({ level: 'project', customer_id: 'k-z', project_id: 'p-z', project_name: 'Z-Projekt' }),
  zeile({ level: 'customer', customer_id: 'k-a', customer_name: 'Ärztehaus', minutes_billable: 240 }),
  zeile({ level: 'project', customer_id: 'k-a', project_id: 'p-2', project_name: 'Portal' }),
  zeile({ level: 'project', customer_id: 'k-a', project_id: 'p-1', project_name: 'Abrechnung' }),
]

describe('gliedereMonat', () => {
  it('haengt die Projekte unter ihren Kunden und sortiert deutsch nach Namen', () => {
    const { kunden } = gliedereMonat(zeilen)
    expect(kunden.map((k) => k.summe.customer_name)).toEqual(['Ärztehaus', 'Zeta AG'])
    expect(kunden[0]!.projekte.map((p) => p.project_name)).toEqual(['Abrechnung', 'Portal'])
    expect(kunden[1]!.projekte.map((p) => p.project_id)).toEqual(['p-z'])
  })

  it('nimmt die Gesamtsumme aus der Sicht, statt sie zu bilden', () => {
    expect(gliedereMonat(zeilen).gesamt?.fees).toBe(500)
  })

  it('mit Kundenfilter ist die Summe die des Kunden, nicht die aller', () => {
    const { kunden, gesamt } = gliedereMonat(zeilen, 'k-z')
    expect(kunden).toHaveLength(1)
    expect(gesamt?.minutes_billable).toBe(60)
  })

  it('ohne Zeilen bleibt die Gesamtsumme leer statt null Euro', () => {
    expect(gliedereMonat([])).toEqual({ kunden: [], gesamt: null })
  })
})

describe('verschiebeMonat', () => {
  it('rechnet ueber den Jahreswechsel', () => {
    expect(verschiebeMonat('2026-01-01', -1)).toBe('2025-12-01')
    expect(verschiebeMonat('2026-12-01', 1)).toBe('2027-01-01')
  })
})

describe('blattNamen', () => {
  it('entfernt verbotene Zeichen und haelt Namen eindeutig', () => {
    expect(blattNamen(['A/B', 'ACME', 'acme', '', 'Übersicht']))
      .toEqual(['A B', 'ACME', 'acme 2', 'Kunde', 'Übersicht 2'])
  })

  it('kuerzt auf die Laenge, die Excel zulaesst', () => {
    expect(blattNamen(['X'.repeat(40)])[0]!.length).toBeLessThanOrEqual(31)
  })
})
