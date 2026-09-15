import { expect, test } from '@playwright/test'

test('echte Passwortanmeldung bleibt nach Reload bestehen; Abmelden beendet die Sitzung', async ({ page }) => {
  // No mocked responses or preloaded session. Guard against unintended data writes.
  await page.route('**/rest/v1/**', async (route) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      await route.abort()
      throw new Error('The authentication smoke test must not write business data')
    }
    await route.continue()
  })
  await page.goto('/')
  await page.getByLabel('E-Mail', { exact: true }).fill(process.env.E2E_AUTH_EMAIL!)
  await page.getByLabel('Passwort', { exact: true }).fill(process.env.E2E_AUTH_PASSWORD!)
  const loginResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/auth/v1/token'
      && new URL(response.url()).searchParams.get('grant_type') === 'password')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  expect((await loginResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Zeiten', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Zeiten', exact: true })).toBeVisible()
  await page.goto('/konto')
  await page.getByRole('button', { name: 'Abmelden', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeVisible()
})
