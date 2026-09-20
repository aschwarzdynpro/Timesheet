import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TAEGLICH, WEITER } from '@/components/navigation'

/**
 * Die Installierbarkeit haengt an Dateien, die niemand beim Entwickeln oeffnet.
 *
 * Ein umbenanntes Symbol faellt im Browser nicht auf: die App laeuft weiter,
 * nur der Knopf "Zum Startbildschirm" verschwindet - und `sw.addAll()` bricht
 * die Installation ganz ab, wenn *eine* Datei der Huelle fehlt. Dann startet
 * die App ohne Netz nicht mehr. Beides zeigt sich erst auf dem Telefon,
 * deshalb hier.
 */

function lesen(pfad: string) {
  return readFileSync(fileURLToPath(new URL(`../../../${pfad}`, import.meta.url)))
}

function pngGroesse(pfad: string) {
  const bytes = lesen(pfad)
  const signatur = bytes.subarray(0, 8).toString('hex')
  expect(signatur, `${pfad} ist keine PNG-Datei`).toBe('89504e470d0a1a0a')
  return { breite: bytes.readUInt32BE(16), hoehe: bytes.readUInt32BE(20) }
}

type Bild = { src: string; sizes: string; type: string; purpose?: string }
type Manifest = {
  start_url: string
  scope: string
  display: string
  icons: Bild[]
  shortcuts?: { url: string }[]
}

const manifest: Manifest = JSON.parse(lesen('public/manifest.webmanifest').toString())
const indexHtml = lesen('index.html').toString()
const serviceWorker = lesen('public/sw.js').toString()

describe('Manifest', () => {
  it('startet im eigenen Geltungsbereich als eigenstaendige App', () => {
    expect(manifest.scope).toBe('/')
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true)
    expect(manifest.display).toBe('standalone')
  })

  it('nennt nur Symbole, die es gibt, in genau der angegebenen Groesse', () => {
    for (const symbol of manifest.icons) {
      const [breite, hoehe] = symbol.sizes.split('x').map(Number)
      expect(pngGroesse(`public${symbol.src}`)).toEqual({ breite, hoehe })
      expect(symbol.type).toBe('image/png')
    }
  })

  it('hat die zwei Pflichtgroessen und ein zuschneidbares Symbol', () => {
    const groessen = manifest.icons.filter((s) => s.purpose !== 'maskable').map((s) => s.sizes)
    expect(groessen).toContain('192x192')
    expect(groessen).toContain('512x512')
    expect(manifest.icons.some((s) => s.purpose === 'maskable')).toBe(true)
  })

  it('verweist mit jeder Verknuepfung auf einen Bereich der Navigation', () => {
    const bereiche = [...TAEGLICH, ...WEITER].map((e) => e.to)
    for (const verknuepfung of manifest.shortcuts ?? []) {
      expect(bereiche, `${verknuepfung.url} steht in keiner Leiste`).toContain(verknuepfung.url)
    }
  })
})

describe('index.html', () => {
  it('haengt Manifest und Startbildschirm-Symbol ein', () => {
    expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(indexHtml).toMatch(/rel="apple-touch-icon" href="\/apple-touch-icon\.png"/)
    expect(pngGroesse('public/apple-touch-icon.png')).toEqual({ breite: 180, hoehe: 180 })
  })

  it('deckt den Bildschirm ganz ab - sonst bleibt jedes env(safe-area-inset-*) bei 0', () => {
    // Auf die Zeile selbst geprueft, nicht auf den Text irgendwo: der Kommentar
    // darueber erklaert dasselbe Wort und liesse die Zusicherung gruen bleiben,
    // waehrend die Angabe fehlt.
    expect(indexHtml).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/)
  })
})

describe('Service Worker', () => {
  it('legt nur Dateien in die Huelle, die es gibt', () => {
    const liste = serviceWorker.match(/const HUELLE = \[([^\]]*)\]/)
    expect(liste?.[1], 'HUELLE nicht gefunden - wurde sie umbenannt?').toBeTruthy()
    const pfade = [...liste![1]!.matchAll(/'([^']+)'/g)].map((treffer) => treffer[1]!)
    expect(pfade.length).toBeGreaterThan(1)

    for (const pfad of pfade) {
      // '/' ist die index.html; Vercel schreibt jeden Pfad darauf um.
      expect(() => lesen(pfad === '/' ? 'index.html' : `public${pfad}`)).not.toThrow()
    }
  })

  it('speichert nichts von fremder Herkunft zwischen', () => {
    expect(serviceWorker).toContain('ziel.origin !== self.location.origin')
  })
})
