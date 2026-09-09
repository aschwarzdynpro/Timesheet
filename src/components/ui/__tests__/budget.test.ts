import { describe, expect, it } from 'vitest'
import { budgetStufe } from '@/components/ui/BudgetBadge'

/**
 * "Voll" und "zu voll" sind verschiedene Nachrichten. Ein punktgenau
 * aufgebrauchtes Budget ist eine Punktlandung und kein Verstoss - es stand
 * trotzdem eine Zeit lang rot und mit "ueberschritten" da.
 */
describe('Budgetstufe', () => {
  it('nennt ein punktgenau aufgebrauchtes Budget aufgebraucht, nicht ueberschritten', () => {
    expect(budgetStufe(2, 2)).toBe('exhausted')
    expect(budgetStufe(120, 120)).toBe('exhausted')
    expect(budgetStufe(2000, 2000)).toBe('exhausted')
  })

  it('meldet erst eine echte Ueberschreitung als kritisch', () => {
    expect(budgetStufe(2.5, 2)).toBe('critical')
    expect(budgetStufe(2000.01, 2000)).toBe('critical')
  })

  it('behandelt einen Rest, der auf 0,00 gerundet wird, als aufgebraucht', () => {
    // Binaerbrueche: 12,5 h von 12,5 h sind rechnerisch nicht immer exakt null.
    expect(budgetStufe(2.0001, 2)).toBe('exhausted')
    expect(budgetStufe(1.9999, 2)).toBe('exhausted')
  })

  it('warnt ab vier Fuenfteln und schweigt darunter', () => {
    expect(budgetStufe(8, 10)).toBe('warning')
    expect(budgetStufe(9.9, 10)).toBe('warning')
    expect(budgetStufe(7.9, 10)).toBe('good')
    expect(budgetStufe(0, 10)).toBe('good')
  })
})
