import { describe, expect, it } from 'vitest'
import type { ExportProfile } from '@/features/export/api'
import { DEFAULT_COLUMNS } from '@/features/export/columns'
import { OHNE_PROFIL, profilDerPeriode, spaltenDerPeriode } from '@/features/periods/spalten'

const profil = (werte: Partial<ExportProfile>): ExportProfile => ({
  id: 'prof-1',
  owner_id: 'u-1',
  name: 'HSO — monatlich',
  target: 'excel',
  columns: ['work_date', 'description', 'billable_hours'],
  filters: {},
  group_by: [],
  customer_id: 'k-1',
  is_default: false,
  created_at: '2026-09-01T08:00:00Z',
  ...werte,
})

const hso = profil({ id: 'p-hso', name: 'HSO — kurz' })
const hsoLang = profil({ id: 'p-hso-2', name: 'HSO — mit Arbeitspaket',
                         columns: ['work_date', 'work_package_name', 'description', 'amount'] })
const fremd = profil({ id: 'p-sys', name: 'Sysways', customer_id: 'k-2' })
const ohneKunden = profil({ id: 'p-frei', name: 'Eigene Auswahl', customer_id: null })
const alle = [hso, hsoLang, fremd, ohneKunden]

describe('Profil einer Periode', () => {
  it('nimmt ohne Wahl das erste Profil des Kunden', () => {
    expect(profilDerPeriode(alle, 'k-1', undefined)).toBe(hso)
  })

  it('nimmt das gewaehlte Profil', () => {
    expect(profilDerPeriode(alle, 'k-1', 'p-hso-2')).toBe(hsoLang)
  })

  it('laesst die Wahl "Standard" gelten', () => {
    expect(profilDerPeriode(alle, 'k-1', OHNE_PROFIL)).toBeNull()
  })

  // Ein Profil ohne Kunden gehoert der Exportseite; es waere sonst das
  // Spaltenbild jedes Kunden, der selbst keines hat.
  it('zaehlt nur Profile dieses Kunden', () => {
    expect(profilDerPeriode(alle, 'k-3', undefined)).toBeNull()
    expect(profilDerPeriode([fremd, ohneKunden], 'k-1', undefined)).toBeNull()
  })

  // Geloescht, waehrend die Zeile offen stand: eine leere Tabelle waere die
  // schlechtere Antwort als das erste Profil des Kunden.
  it('faellt auf das erste Profil zurueck, wenn die Kennung ins Leere zeigt', () => {
    expect(profilDerPeriode(alle, 'k-1', 'p-weg')).toBe(hso)
  })

  it('kommt mit noch nicht geladenen Profilen zurecht', () => {
    expect(profilDerPeriode(undefined, 'k-1', undefined)).toBeNull()
  })
})

describe('Spalten einer Periode', () => {
  it('nimmt die Spalten des Profils', () => {
    expect(spaltenDerPeriode(hsoLang))
      .toEqual(['work_date', 'work_package_name', 'description', 'amount'])
  })

  it('nimmt ohne Profil die Voreinstellung des Exports', () => {
    expect(spaltenDerPeriode(null)).toEqual(DEFAULT_COLUMNS)
  })

  // Ein Profil, das nur Filter sichert: leer angezeigt waere das Raster ohne
  // eine einzige Spalte, und die Datei daneben ohne eine einzige Ueberschrift.
  it('nimmt die Voreinstellung, wenn das Profil keine Spalten traegt', () => {
    expect(spaltenDerPeriode(profil({ columns: [] }))).toEqual(DEFAULT_COLUMNS)
  })
})
