import { expect, test, type Page } from '@playwright/test'
import { mockSupabase } from './mockSupabase'

// Scope to the page-header actions: the empty day also has an Erfassen button.
const headerActions = (page: Page) => page.getByRole('button', { name: 'Nächste Woche', exact: true }).locator('..')
const entryDescription = (page: Page) => page.getByRole('combobox', { name: 'Beschreibung, 1,00 h', exact: true })

async function expectNoOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('lädt den Bestand und wechselt am Jahreswechsel exakt eine Woche', async ({ page }) => {
  const initialResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/rest/v1/v_time_entries_full'
      && url.searchParams.getAll('work_date').includes('gte.2026-12-28')
      && url.searchParams.getAll('work_date').includes('lte.2027-01-03')
  })
  await page.goto('/')
  expect((await (await initialResponse).json()).map((row: { id: string }) => row.id)).toEqual(['te-existing'])
  await expect(page.getByText('KW 53 / 2026', { exact: true })).toBeVisible()
  await expect(entryDescription(page)).toHaveValue('Bestehender E2E-Eintrag')

  const nextResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/rest/v1/v_time_entries_full'
      && url.searchParams.getAll('work_date').includes('gte.2027-01-04')
      && url.searchParams.getAll('work_date').includes('lte.2027-01-10')
  })
  await page.getByRole('button', { name: 'Nächste Woche', exact: true }).click()
  expect((await (await nextResponse).json()).map((row: { id: string }) => row.id)).toEqual(['te-next'])
  await expect(page.getByText('KW 1 / 2027', { exact: true })).toBeVisible()
  await expect(entryDescription(page)).toHaveValue('Folgewoche')

  await headerActions(page).getByRole('button', { name: 'Heute', exact: true }).click()
  await expect(page.getByText('KW 53 / 2026', { exact: true })).toBeVisible()
  await expect(entryDescription(page)).toHaveValue('Bestehender E2E-Eintrag')
})

test('validiert und speichert einen Schnelleintrag dauerhaft im Mock', async ({ page }) => {
  await page.goto('/')
  await headerActions(page).getByRole('button', { name: 'Erfassen', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Zeit erfassen', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(dialog.getByText('Dauer nicht verstanden. Möglich sind etwa 1,5 · 1:30 · 90m.', { exact: true })).toBeVisible()
  await dialog.getByLabel(/^Dauer\b/).fill('1:30')
  await dialog.getByLabel('Beschreibung', { exact: true }).fill('E2E Testeintrag')
  const saved = page.waitForRequest((request) => request.method() === 'POST'
    && new URL(request.url()).pathname === '/rest/v1/time_entries')
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click()
  expect((await saved).postDataJSON()).toMatchObject({ work_date: '2027-01-01', duration_minutes: 90, description: 'E2E Testeintrag' })
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('combobox', { name: 'Beschreibung, 1,50 h', exact: true })).toHaveValue('E2E Testeintrag')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Beschreibung, 1,50 h', exact: true })).toHaveValue('E2E Testeintrag')
})

test('Seite und Erfassungsdialog bleiben ohne horizontalen Overflow nutzbar', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(entryDescription(page)).toHaveValue('Bestehender E2E-Eintrag')
  await expectNoOverflow(page)
  await headerActions(page).getByRole('button', { name: 'Erfassen', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Zeit erfassen', exact: true })).toBeVisible()
  await expectNoOverflow(page)
  expect(errors).toEqual([])
})
