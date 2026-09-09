import { describe, expect, it } from 'vitest'
import { standardArt } from '@/features/activity-types/api'
import type { ActivityType } from '@/types/database'

const art = (id: string, felder: Partial<ActivityType> = {}): ActivityType => ({
  id, owner_id: 'o', code: id.toUpperCase(), name: id, is_billable_default: true,
  is_default: false, finops_category: null, sort_order: 100, is_active: true,
  created_at: '', ...felder,
})

describe('Vorbelegte Taetigkeitsart', () => {
  it('nimmt die markierte Art', () => {
    expect(standardArt([art('a'), art('b', { is_default: true }), art('c')])).toBe('b')
  })

  it('laesst das Feld leer, solange keine markiert ist', () => {
    expect(standardArt([art('a'), art('b')])).toBe('')
  })

  it('kommt mit noch nicht geladenen Daten zurecht', () => {
    // Genau dafuer steht die Wahl auf null statt auf einem festen Anfangswert:
    // die Arten treffen moeglicherweise erst nach dem ersten Rendern ein.
    expect(standardArt(undefined)).toBe('')
    expect(standardArt([])).toBe('')
  })

  it('ignoriert eine inaktive Art', () => {
    // Die Datenbank nimmt ihr die Marke bereits ab; stuende sie hier trotzdem,
    // zeigte die Auswahlliste ein leeres Feld - sie enthaelt nur aktive Arten.
    expect(standardArt([art('a'), art('b', { is_default: true, is_active: false })])).toBe('')
  })
})
