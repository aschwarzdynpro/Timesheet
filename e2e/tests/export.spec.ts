import { expect, test } from '@playwright/test'
import { mockSupabase } from './mockSupabase'

async function expectNoOverflow(page: import('@playwright/test').Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('Monatsübersicht zeigt Stunden und Umsatz je Projekt und Kunde für den Vormonat', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.goto('/export')
  await page.getByRole('button', { name: 'Monatsübersicht', exact: true }).click()

  // Heute ist der 01.01.2027 - abgerechnet wird der abgeschlossene Dezember.
  await expect(page.getByText('Dezember 2026', { exact: true })).toBeVisible()
  const karte = page.getByRole('heading', { name: 'ACME GmbH', exact: true }).locator('../..')
  await expect(karte.getByText('Summe ACME GmbH').filter({ visible: true })).toBeVisible()
  await expect(karte.getByText(/1,00\s*h/).filter({ visible: true }).first()).toBeVisible()
  await expect(karte.getByText(/120,00\s*€\s*\/\s*h/).filter({ visible: true }).first()).toBeVisible()
  await expectNoOverflow(page)

  // Der Januar hat zwei Eintraege; der Februar noch keinen.
  await page.getByRole('button', { name: 'Folgemonat', exact: true }).click()
  await expect(page.getByText('Januar 2027', { exact: true })).toBeVisible()
  await expect(karte.getByText(/2,00\s*h/).filter({ visible: true }).first()).toBeVisible()
  await expect(karte.getByText(/240,00\s*€/).filter({ visible: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Folgemonat', exact: true }).click()
  await expect(page.getByText(/nichts Abrechenbares erfasst/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Excel erzeugen', exact: true })).toBeDisabled()
  await expectNoOverflow(page)
  expect(errors).toEqual([])
})

test('Monatsübersicht erzeugt eine Excel-Datei je Monat', async ({ page }) => {
  await page.goto('/export')
  await page.getByRole('button', { name: 'Monatsübersicht', exact: true }).click()
  await expect(page.getByText('Dezember 2026', { exact: true })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Excel erzeugen', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('Monatsuebersicht_Alle_2026-12.xlsx')
})
