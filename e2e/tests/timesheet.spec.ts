import { expect, test } from '@playwright/test'
import { mockSupabase } from './mockSupabase'

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('lädt die Zeiterfassung authentifiziert und wechselt die Woche', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Zeiten' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Beschreibung, 1,00 h' }))
    .toHaveValue('Bestehender E2E-Eintrag')

  const before = await page.getByText(/KW \d+ \/ \d+/).first().textContent()
  await page.getByRole('button', { name: 'Nächste Woche' }).click()
  const after = await page.getByText(/KW \d+ \/ \d+/).first().textContent()

  expect(after).not.toBe(before)
})

test('validiert und speichert einen Schnelleintrag', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Erfassen' }).first().click()

  await expect(page.getByRole('heading', { name: 'Zeit erfassen' })).toBeVisible()

  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Dauer nicht verstanden')).toBeVisible()

  const dialog = page.getByRole('dialog', { name: 'Zeit erfassen' })
  await dialog.getByLabel('Dauer').fill('1:30')
  await dialog.getByLabel('Beschreibung').fill('E2E Testeintrag')
  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('heading', { name: 'Zeit erfassen' })).toBeHidden()
  await expect(page.getByRole('combobox', { name: 'Beschreibung, 1,50 h' }))
    .toHaveValue('E2E Testeintrag')
})

test('mobile Ansicht bleibt ohne horizontalen Seiten-Overflow nutzbar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'nur im mobilen Projekt relevant')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Zeiten' })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)

  const headerAction = page.getByRole('button', { name: 'Erfassen' }).first()
  await expect(headerAction).toBeVisible()
  await headerAction.click()
  await expect(page.getByRole('heading', { name: 'Zeit erfassen' })).toBeVisible()

  const dialogOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(dialogOverflow).toBe(false)
})
