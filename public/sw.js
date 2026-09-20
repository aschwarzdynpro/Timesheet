/**
 * Service Worker der Zeiterfassung - von Hand geschrieben, ohne Generator.
 *
 * Er hat genau zwei Aufgaben:
 *
 * 1. Die App startet auch ohne Netz. Gezeigt wird dann die zuletzt geladene
 *    Huelle; die Daten dahinter kommen weiter nur aus Supabase.
 * 2. Eine neue Fassung erreicht das Telefon, ohne dass jemand den Verlauf
 *    loescht. Deshalb wird `index.html` immer zuerst im Netz gesucht - sie
 *    nennt die Dateinamen der aktuellen Bundles.
 *
 * Was er ausdruecklich *nicht* tut: Antworten von Supabase zwischenspeichern.
 * Zeiten, Saetze und Perioden kaemen sonst aus einem Speicher, den weder RLS
 * noch die Periodensperre kennen - eine gemeldete Woche saehe offen aus, und
 * ein zweites Geraet zeigte alte Zahlen. Fremde Herkuenfte laufen unangetastet
 * durch. Aus demselben Grund gibt es hier keine Warteschlange fuer Schreibzugriffe:
 * ob ein Eintrag erlaubt ist, entscheidet die Datenbank, nicht der Browser.
 */

const SPEICHER = 'ze-huelle-v1'

/** Die Huelle: ohne diese Dateien startet die App nicht. */
const HUELLE = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', (event) => {
  // `reload` umgeht den HTTP-Cache: sonst legte die Installation moeglicherweise
  // genau die Fassung ab, die gerade abgeloest wird.
  event.waitUntil(
    caches.open(SPEICHER).then((speicher) => speicher.addAll(
      HUELLE.map((pfad) => new Request(pfad, { cache: 'reload' })),
    )),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const namen = await caches.keys()
    await Promise.all(namen.filter((name) => name !== SPEICHER).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

/**
 * Die Seite bittet darum, die wartende Fassung zu uebernehmen.
 *
 * Ohne diesen Weg bliebe eine neue Fassung liegen, bis alle Fenster der App
 * geschlossen sind - auf dem Telefon also unter Umstaenden wochenlang.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'uebernehmen') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const anfrage = event.request
  if (anfrage.method !== 'GET') return

  const ziel = new URL(anfrage.url)
  // Supabase, Schriften, alles Fremde: unangetastet ans Netz.
  if (ziel.origin !== self.location.origin) return

  if (anfrage.mode === 'navigate') {
    event.respondWith(huelleHolen(anfrage))
    return
  }

  // Die Bundles tragen ihren Inhalt im Namen und aendern sich nie - was einmal
  // im Speicher liegt, ist fuer diesen Namen fuer immer richtig.
  if (ziel.pathname.startsWith('/assets/')) {
    event.respondWith(zuerstSpeicher(anfrage))
    return
  }

  // Symbole, Manifest, Favicon: aus dem Speicher anzeigen, im Hintergrund erneuern.
  event.respondWith(speicherUndErneuern(anfrage))
})

/**
 * Seitenaufrufe: zuerst das Netz, dann der Speicher.
 *
 * Andersherum zeigte ein Geraet nach einer Neuveroeffentlichung die alte
 * Oberflaeche, bis der Speicher auffiele - und genau das soll dieser Worker
 * verhindern, nicht verursachen.
 */
async function huelleHolen(anfrage) {
  try {
    const antwort = await fetch(anfrage)
    if (antwort.ok) {
      const speicher = await caches.open(SPEICHER)
      // Alle Pfade liefern dieselbe index.html (Rewrite in vercel.json).
      // Abgelegt wird sie unter '/', damit auch /spesen offline startet.
      await speicher.put('/', antwort.clone())
    }
    return antwort
  } catch (fehler) {
    const speicher = await caches.open(SPEICHER)
    const abgelegt = await speicher.match('/')
    if (abgelegt) return abgelegt
    throw fehler
  }
}

async function zuerstSpeicher(anfrage) {
  const speicher = await caches.open(SPEICHER)
  const abgelegt = await speicher.match(anfrage)
  if (abgelegt) return abgelegt

  const antwort = await fetch(anfrage)
  if (antwort.ok) await speicher.put(anfrage, antwort.clone())
  return antwort
}

async function speicherUndErneuern(anfrage) {
  const speicher = await caches.open(SPEICHER)
  const abgelegt = await speicher.match(anfrage)
  const ausDemNetz = fetch(anfrage)
    .then(async (antwort) => {
      if (antwort.ok) await speicher.put(anfrage, antwort.clone())
      return antwort
    })
    .catch(() => undefined)

  const antwort = abgelegt ?? (await ausDemNetz)
  if (antwort) return antwort
  return new Response('', { status: 504, statusText: 'Keine Verbindung' })
}
