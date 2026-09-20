import { expect, test } from '@playwright/test'

/**
 * Der Produktionsbuild muss die Dateien der Installation tatsaechlich
 * ausliefern - das Manifest, den Service Worker und die Symbole.
 *
 * Die Unit-Tests pruefen ihren Inhalt im Repo; hier geht es um den Weg danach:
 * ein Pfad, den der Rewrite in `vercel.json` auf die index.html umbiegt, oder
 * eine Datei, die der Build nicht mitkopiert, liefert 200 mit HTML darin. Das
 * saehe bis zum "Zum Startbildschirm hinzufuegen" nach nichts aus.
 *
 * Service Worker sind in dieser Suite abgeschaltet (`serviceWorkers: 'block'`
 * in der Konfiguration), damit die Mocks der uebrigen Tests greifen. Geprueft
 * wird deshalb die Auslieferung, nicht das Verhalten im Offline-Fall.
 */
test('liefert Manifest, Service Worker und Symbole aus', async ({ request, page }) => {
  const manifestAntwort = await request.get('/manifest.webmanifest')
  expect(manifestAntwort.status()).toBe(200)
  const manifest = await manifestAntwort.json()
  expect(manifest.start_url).toBe('/')

  const workerAntwort = await request.get('/sw.js')
  expect(workerAntwort.status()).toBe(200)
  expect(workerAntwort.headers()['content-type']).toContain('javascript')

  for (const symbol of [...manifest.icons.map((s: { src: string }) => s.src), '/apple-touch-icon.png']) {
    const antwort = await request.get(symbol)
    expect(antwort.status(), `${symbol} fehlt im Build`).toBe(200)
    expect(antwort.headers()['content-type'], `${symbol} ist kein Bild`).toContain('image/png')
  }

  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
})
