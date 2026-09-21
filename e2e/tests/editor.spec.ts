import { expect, test, type Page } from '@playwright/test'
import { mockSupabase } from './mockSupabase'

const original = 'Bestehender E2E-Eintrag'
const duration = (page: Page, description = original) => page.getByRole('textbox', { name: `Dauer, ${description}`, exact: true })
const description = (page: Page, hours = '1,00') => page.getByRole('combobox', { name: `Beschreibung, ${hours} h`, exact: true })
const deleteButton = (page: Page) => page.getByRole('button', { name: `Löschen, ${original}`, exact: true })
const confirmation = (page: Page) => page.getByRole('alertdialog', { name: 'Zeiteintrag löschen?', exact: true })

test('Inline-Änderungen speichern per Blur/Enter und bleiben nach Wochenwechsel und Reload erhalten', async ({ page }) => {
  const api = await mockSupabase(page)
  await page.goto('/')
  await expect(duration(page)).toHaveValue('1,00')
  await duration(page).fill('1:45')
  // Actual focus change exercises onBlur; Enter is covered for the description.
  await page.getByRole('heading', { name: 'Zeiten', exact: true }).click()
  await expect(description(page, '1,75')).toHaveValue(original)
  await description(page, '1,75').fill('Geänderte Beratung')
  await description(page, '1,75').press('Enter')
  await expect(duration(page, 'Geänderte Beratung')).toHaveValue('1,75')
  expect(api.writes).toMatchObject([
    { method: 'PATCH', id: 'te-existing', body: { duration_minutes: 105, description: original, work_date: '2027-01-01' } },
    { method: 'PATCH', id: 'te-existing', body: { duration_minutes: 105, description: 'Geänderte Beratung', work_date: '2027-01-01' } },
  ])
  await page.getByRole('button', { name: 'Nächste Woche', exact: true }).click()
  await expect(description(page)).toHaveValue('Folgewoche')
  await page.getByRole('button', { name: 'Vorherige Woche', exact: true }).click()
  await expect(description(page, '1,75')).toHaveValue('Geänderte Beratung')
  await page.reload()
  await expect(description(page, '1,75')).toHaveValue('Geänderte Beratung')
})

test('ungültige Inline-Werte erzeugen keine Schreibrequests', async ({ page }) => {
  const api = await mockSupabase(page)
  await page.goto('/')
  for (const value of ['abc', '0', '25']) {
    await duration(page).fill(value)
    await duration(page).press('Enter')
    await expect(page.getByText(value === '25'
      ? 'Mehr als 24 Stunden an einem Tag sind nicht möglich.'
      : 'Dauer nicht verstanden. Möglich sind etwa 1,5 · 1:30 · 90m.', { exact: true })).toBeVisible()
    expect(api.writes).toHaveLength(0)
  }
  await duration(page).fill('1,00')
  await duration(page).press('Enter')
  await description(page).fill('   ')
  await description(page).press('Enter')
  await expect(page.getByText('Ohne Beschreibung geht es nicht — sie ist die Position im Kundenreport.', { exact: true })).toBeVisible()
  expect(api.writes).toHaveLength(0)
  await page.reload()
  await expect(description(page)).toHaveValue(original)
  await expect(duration(page)).toHaveValue('1,00')
})

test('eine neue Zeile wartet auf vollständige Werte und wird genau einmal gespeichert', async ({ page }) => {
  const api = await mockSupabase(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Zeile hinzufügen', exact: true }).click()
  const text = page.getByRole('combobox', { name: 'Beschreibung, neue Zeile', exact: true })
  const minutes = page.getByRole('textbox', { name: 'Dauer, neue Zeile', exact: true })
  await text.fill('Neue Inline-Zeile')
  await text.press('Enter')
  await expect(text).toHaveValue('Neue Inline-Zeile')
  expect(api.writes).toHaveLength(0)
  await minutes.fill('abc')
  await minutes.press('Enter')
  await expect(text).toHaveValue('Neue Inline-Zeile')
  expect(api.writes).toHaveLength(0)
  await minutes.fill('45m')
  await minutes.press('Enter')
  await expect(text).toHaveCount(0)
  await expect(description(page, '0,75')).toHaveValue('Neue Inline-Zeile')
  expect(api.writes).toMatchObject([{ method: 'POST', body: { duration_minutes: 45, description: 'Neue Inline-Zeile', work_date: '2027-01-01' } }])
  await page.reload()
  await expect(description(page, '0,75')).toHaveValue('Neue Inline-Zeile')
  expect(api.writes).toHaveLength(1)
})

test('Löschen verlangt Bestätigung; Abbrechen erhält den Eintrag, Bestätigen entfernt ihn dauerhaft', async ({ page }) => {
  const api = await mockSupabase(page)
  await page.goto('/')
  await deleteButton(page).click()
  await expect(confirmation(page).getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused()
  await confirmation(page).getByRole('button', { name: 'Abbrechen', exact: true }).click()
  await expect(description(page)).toHaveValue(original)
  expect(api.writes).toHaveLength(0)
  await deleteButton(page).click()
  await confirmation(page).getByRole('button', { name: 'Löschen', exact: true }).click()
  await expect(page.getByText('Für diesen Tag ist nichts erfasst', { exact: true })).toBeVisible()
  expect(api.writes).toEqual([{ method: 'DELETE', id: 'te-existing', body: null }])
  await page.reload()
  await expect(page.getByText('Für diesen Tag ist nichts erfasst', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Woche', exact: true }).click()
  await expect(description(page)).toHaveValue('Folgewoche')
})

test('fehlgeschlagenes Speichern erhält den Entwurf und erlaubt einen erneuten Versuch', async ({ page }) => {
  const api = await mockSupabase(page)
  api.failNextWrite('PATCH', 'Speichern im Test fehlgeschlagen.')
  await page.goto('/')
  await description(page).fill('Entwurf nach Fehler')
  await description(page).press('Enter')
  await expect(page.getByText('Speichern im Test fehlgeschlagen.', { exact: true })).toBeVisible()
  await expect(description(page)).toHaveValue('Entwurf nach Fehler')
  expect(api.writes).toHaveLength(1)
  await description(page).focus()
  await description(page).press('Enter')
  await expect(duration(page, 'Entwurf nach Fehler')).toBeVisible()
  await expect(page.getByText('Speichern im Test fehlgeschlagen.', { exact: true })).toHaveCount(0)
  expect(api.writes).toHaveLength(2)
  await page.reload()
  await expect(description(page)).toHaveValue('Entwurf nach Fehler')
})

test('fehlgeschlagenes Löschen entfernt keinen Datensatz', async ({ page }) => {
  const api = await mockSupabase(page)
  api.failNextWrite('DELETE', 'Löschen im Test fehlgeschlagen.')
  await page.goto('/')
  await deleteButton(page).click()
  await confirmation(page).getByRole('button', { name: 'Löschen', exact: true }).click()
  await expect(page.getByText('Löschen im Test fehlgeschlagen.', { exact: true })).toBeVisible()
  await expect(description(page)).toHaveValue(original)
  expect(api.writes).toEqual([{ method: 'DELETE', id: 'te-existing', body: null }])
  await page.reload()
  await expect(description(page)).toHaveValue(original)
})

test('Wochenansicht bearbeitet dieselben Einträge im Rastereditor oder mobilen Dialog', async ({ page }) => {
  const api = await mockSupabase(page)
  await page.goto('/')
  await expect(description(page)).toHaveValue(original)
  await page.getByRole('group', { name: 'Ansicht', exact: true }).getByRole('button', { name: 'Woche', exact: true }).click()
  if ((page.viewportSize()?.width ?? 1400) < 640) {
    await page.getByRole('button', { name: /Bestehender E2E-Eintrag/ }).click()
    await expect(page.getByRole('dialog', { name: /Consulting/ })).toBeVisible()
  } else {
    await page.getByRole('textbox', { name: 'Consulting, 2027-01-01', exact: true }).click()
  }
  await description(page).fill('Im Wocheneditor geändert')
  await description(page).press('Enter')
  await expect(duration(page, 'Im Wocheneditor geändert')).toBeVisible()
  expect(api.writes).toMatchObject([{ method: 'PATCH', id: 'te-existing', body: { work_date: '2027-01-01', description: 'Im Wocheneditor geändert' } }])
  await page.reload()
  await expect(description(page)).toHaveValue('Im Wocheneditor geändert')
})
