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

test('Monatsübersicht schlüsselt Projekte auf Schalter nach Arbeitspaketen auf', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  // Ein Projekt mit zwei Paketen und Zeit ohne Paket - die Sicht summiert,
  // der Test prueft nur, was die Seite daraus macht.
  const basis = {
    month_start: '2026-12-01', customer_id: 'c1', customer_code: 'ACME', customer_name: 'ACME GmbH',
    minutes_without_rate: 0, open_periods: 0,
  }
  const projekt = { project_id: 'p1', project_code: 'CONS', project_name: 'Consulting' }
  const ohnePaket = { work_package_id: null, work_package_code: null, work_package_name: null }
  const rows = [
    { ...basis, ...projekt, level: 'work_package', minutes_billable: 240, fees: 480, avg_rate: 120,
      work_package_id: 'wp1', work_package_code: 'KON', work_package_name: 'Konzeption' },
    { ...basis, ...projekt, level: 'work_package', minutes_billable: 120, fees: 240, avg_rate: 120,
      work_package_id: 'wp2', work_package_code: 'UMS', work_package_name: 'Umsetzung' },
    { ...basis, ...projekt, ...ohnePaket, level: 'work_package', minutes_billable: 60, fees: 120, avg_rate: 120 },
    { ...basis, ...projekt, ...ohnePaket, level: 'project', minutes_billable: 420, fees: 840, avg_rate: 120 },
    { ...basis, project_id: null, project_code: null, project_name: null, ...ohnePaket,
      level: 'customer', minutes_billable: 420, fees: 840, avg_rate: 120 },
  ]
  await page.route('**/rest/v1/v_billing_month*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) }))

  await page.goto('/export')
  await page.getByRole('button', { name: 'Monatsübersicht', exact: true }).click()
  await expect(page.getByText('7,00 h').filter({ visible: true }).first()).toBeVisible()

  // Ohne Schalter gibt es nichts aufzuklappen.
  const aufklappen = page.getByRole('button', { name: /Arbeitspakete aufklappen/ }).filter({ visible: true })
  await expect(aufklappen).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'Arbeitspakete aufschlüsseln' }).check()
  await expect(page.getByText('Konzeption').filter({ visible: true })).toHaveCount(0)
  await aufklappen.first().click()
  await expect(page.getByText('Konzeption').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('Umsetzung').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('ohne Arbeitspaket').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('4,00 h').filter({ visible: true }).first()).toBeVisible()
  await expectNoOverflow(page)

  // Der Schalter aus blendet die Pakete wieder aus.
  await page.getByRole('checkbox', { name: 'Arbeitspakete aufschlüsseln' }).uncheck()
  await expect(page.getByText('Konzeption').filter({ visible: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
