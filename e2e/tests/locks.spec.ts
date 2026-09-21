import { expect, test } from '@playwright/test'
import { mockSupabase } from './mockSupabase'

for (const status of ['submitted', 'approved', 'invoiced'] as const) {
  test(`${status}: Bestand und leere Tage bleiben gesperrt; die Folgewoche ist bearbeitbar`, async ({ page }) => {
    const api = await mockSupabase(page, { periodStatus: status })
    await page.goto('/')
    await expect(page.getByText('Dieser Tag gehört zu einer bereits gemeldeten Periode und ist gesperrt.', { exact: true })).toBeVisible()
    await expect(page.getByText('Bestehender E2E-Eintrag', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Löschen, / })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Zeile hinzufügen', exact: true })).toHaveCount(0)
    const quickEntry = page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Dauer', exact: true }) })
    await expect(quickEntry.getByRole('button', { name: 'Erfassen', exact: true })).toBeDisabled()
    // There is no entry on Monday: the lock must come from reporting_periods.
    await page.getByRole('button', { name: /Mo.*28\.12\./ }).click()
    await expect(page.getByText('Für diesen Tag ist nichts erfasst', { exact: true })).toBeVisible()
    await expect(quickEntry.getByRole('button', { name: 'Erfassen', exact: true })).toBeDisabled()
    await quickEntry.getByRole('textbox', { name: 'Dauer', exact: true }).fill('1')
    await quickEntry.getByRole('textbox', { name: 'Beschreibung', exact: true }).fill('Darf nicht gespeichert werden')
    await quickEntry.getByRole('textbox', { name: 'Beschreibung', exact: true }).press('Enter')
    expect(api.writes).toHaveLength(0)

    await page.getByRole('group', { name: 'Ansicht', exact: true }).getByRole('button', { name: 'Woche', exact: true }).click()
    if ((page.viewportSize()?.width ?? 1400) >= 640) {
      const emptyCell = page.getByRole('textbox', { name: 'Consulting, 2026-12-28', exact: true })
      await expect(emptyCell).toHaveAttribute('readonly', '')
      await emptyCell.click()
      await expect(page.getByText('Dieser Tag gehört zu einer bereits gemeldeten Periode und ist gesperrt.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Zeile hinzufügen', exact: true })).toHaveCount(0)
    } else {
      await page.getByRole('button', { name: /Bestehender E2E-Eintrag/ }).click()
      const dialog = page.getByRole('dialog', { name: /Consulting/ })
      await expect(dialog.getByText('Dieser Tag gehört zu einer bereits gemeldeten Periode und ist gesperrt.', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: /Löschen/ })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Schließen', exact: true }).click()
    }
    expect(api.writes).toHaveLength(0)
    await page.getByRole('group', { name: 'Ansicht', exact: true }).getByRole('button', { name: 'Tag', exact: true }).click()
    await page.getByRole('button', { name: 'Nächste Woche', exact: true }).click()
    await expect(page.getByText('KW 1 / 2027', { exact: true })).toBeVisible()
    await expect(quickEntry.getByRole('button', { name: 'Erfassen', exact: true })).toBeEnabled()
    // Return to Friday in the unlocked week, then back to its locked counterpart.
    await page.getByRole('button', { name: /Fr.*08\.01\./ }).click()
    await expect(page.getByRole('combobox', { name: 'Beschreibung, 1,00 h', exact: true })).toHaveValue('Folgewoche')
    await page.getByRole('button', { name: 'Vorherige Woche', exact: true }).click()
    await expect(quickEntry.getByRole('button', { name: 'Erfassen', exact: true })).toBeDisabled()
    expect(api.writes).toHaveLength(0)
  })
}

test('eine erst beim Speichern gemeldete Sperre bleibt als Fehler sichtbar und ändert keine Daten', async ({ page }) => {
  const api = await mockSupabase(page)
  api.failNextWrite('PATCH', 'Die Periode wurde inzwischen gemeldet und ist gesperrt.', 409)
  await page.goto('/')
  const text = page.getByRole('combobox', { name: 'Beschreibung, 1,00 h', exact: true })
  await text.fill('Nicht gespeichert')
  await text.press('Enter')
  await expect(page.getByText('Die Periode wurde inzwischen gemeldet und ist gesperrt.', { exact: true })).toBeVisible()
  await expect(text).toHaveValue('Nicht gespeichert')
  expect(api.writes).toHaveLength(1)
  await page.reload()
  await expect(text).toHaveValue('Bestehender E2E-Eintrag')
})
