import { describe, expect, it } from 'vitest'
import { nachKuerzel } from '@/features/projects/api'

/**
 * Die Reihenfolge in der Erfassung. In den Stammdaten ordnet sort_order die
 * Pakete nach der Gliederung des Projekts - beim Buchen sucht man dagegen ein
 * Kuerzel und erwartet es dort, wo das Alphabet es hinlegt.
 */
describe('Arbeitspakete in der Erfassung', () => {
  const sortiert = (codes: string[]) =>
    codes.map((code) => ({ code })).sort(nachKuerzel).map((w) => w.code)

  it('sortiert alphabetisch nach Kuerzel', () => {
    expect(sortiert(['SUPPORT', 'ARCHITECTURE', 'PMO', 'ANALYSE']))
      .toEqual(['ANALYSE', 'ARCHITECTURE', 'PMO', 'SUPPORT'])
  })

  it('zaehlt Zahlen als Zahlen, nicht Zeichen fuer Zeichen', () => {
    // Rein alphabetisch stuende AP10 vor AP2, weil '1' vor '2' kommt - und
    // genau die Paketnummer sucht man in der Liste.
    expect(sortiert(['AP10', 'AP2', 'AP1'])).toEqual(['AP1', 'AP2', 'AP10'])
    expect(sortiert(['13206 DEV', '1942', '655'])).toEqual(['655', '1942', '13206 DEV'])
  })

  it('stellt Nummern vor Woerter', () => {
    expect(sortiert(['PMO', '1942', 'ALM'])).toEqual(['1942', 'ALM', 'PMO'])
  })
})
