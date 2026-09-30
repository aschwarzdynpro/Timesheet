import { describe, expect, it } from 'vitest'
import { blattNamen, gliedereMonat, hatPakete, verschiebeMonat } from '@/features/export/monat'
import type { BillingRow } from '@/features/export/api'

const zeile = (werte: Partial<BillingRow>): BillingRow => ({
  month_start: '2026-08-01',
  level: 'project',
  customer_id: null, customer_code: null, customer_name: null,
  project_id: null, project_code: null, project_name: null,
  minutes_billable: 60, fees: 100, avg_rate: 100,
  minutes_without_rate: 0, open_periods: 0,
  work_package_id: null, work_package_code: null, work_package_name: null,
  ...werte,
})

const zeilen: BillingRow[] = [
  zeile({ level: 'total', minutes_billable: 300, fees: 500 }),
  zeile({ level: 'customer', customer_id: 'k-z', customer_name: 'Zeta AG', minutes_billable: 60 }),
  zeile({ level: 'project', customer_id: 'k-z', project_id: 'p-z', project_name: 'Z-Projekt' }),
  zeile({ level: 'customer', customer_id: 'k-a', customer_name: 'Ärztehaus', minutes_billable: 240 }),
  zeile({ level: 'project', customer_id: 'k-a', project_id: 'p-2', project_name: 'Portal' }),
  zeile({ level: 'project', customer_id: 'k-a', project_id: 'p-1', project_name: 'Abrechnung' }),
  zeile({ level: 'work_package', customer_id: 'k-a', project_id: 'p-1' }),
  zeile({ level: 'work_package', customer_id: 'k-a', project_id: 'p-1',
          work_package_id: 'ap-b', work_package_code: 'B', work_package_name: 'Betrieb' }),
  zeile({ level: 'work_package', customer_id: 'k-a', project_id: 'p-1',
          work_package_id: 'ap-a', work_package_code: 'A', work_package_name: 'Analyse' }),
  zeile({ level: 'work_package', customer_id: 'k-z', project_id: 'p-z' }),
]

describe('gliedereMonat', () => {
  it('haengt die Projekte unter ihren Kunden und sortiert deutsch nach Namen', () => {
    const { kunden } = gliedereMonat(zeilen)
    expect(kunden.map((k) => k.summe.customer_name)).toEqual(['Ärztehaus', 'Zeta AG'])
    expect(kunden[0]!.projekte.map((p) => p.summe.project_name)).toEqual(['Abrechnung', 'Portal'])
    expect(kunden[1]!.projekte.map((p) => p.summe.project_id)).toEqual(['p-z'])
  })

  it('haengt die Arbeitspakete unter ihr Projekt, "ohne Arbeitspaket" zuletzt', () => {
    const abrechnung = gliedereMonat(zeilen).kunden[0]!.projekte[0]!
    expect(abrechnung.pakete.map((p) => p.work_package_code)).toEqual(['A', 'B', null])
  })

  it('klappt nur auf, wo ein echtes Paket bebucht ist', () => {
    const { kunden } = gliedereMonat(zeilen)
    expect(hatPakete(kunden[0]!.projekte[0]!)).toBe(true)
    // Nur "ohne Arbeitspaket" wiederholte die Zahlen des Projekts.
    expect(hatPakete(kunden[1]!.projekte[0]!)).toBe(false)
    // Portal hat gar keine Paketzeilen - etwa gegen eine Sicht ohne die Ebene.
    expect(hatPakete(kunden[0]!.projekte[1]!)).toBe(false)
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
