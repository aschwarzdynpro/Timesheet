/**
 * Anmeldung und Aktualisierung des Service Workers.
 *
 * Der Worker selbst steht in `public/sw.js` - er wird unveraendert
 * ausgeliefert und darf deshalb nichts aus dem Bundle importieren. Hier steht
 * nur die Seite des Fensters: anmelden, eine neue Fassung bemerken, sie auf
 * Zuruf uebernehmen.
 */

/** Ein Abonnent erfaehrt, dass eine neue Fassung bereitliegt. */
type Hoerer = () => void

const hoerer = new Set<Hoerer>()
let wartend: ServiceWorker | null = null
let ladeGerade = false

function melden(worker: ServiceWorker | null) {
  if (wartend === worker) return
  wartend = worker
  for (const h of hoerer) h()
}

export function aktualisierungVerfuegbar() {
  return wartend !== null
}

export function beiAktualisierung(h: Hoerer) {
  hoerer.add(h)
  return () => { hoerer.delete(h) }
}

/**
 * Die wartende Fassung uebernehmen.
 *
 * Der Worker meldet sich danach als neuer Regler; `controllerchange` laedt die
 * Seite einmal neu, damit Oberflaeche und Bundles zusammenpassen.
 */
export function aktualisierungUebernehmen() {
  wartend?.postMessage('uebernehmen')
}

/**
 * Meldet den Service Worker an - nur im gebauten Stand.
 *
 * Im Entwicklungsstand wird ein frueher angemeldeter Worker abgemeldet: er
 * lieferte sonst Dateien aus seinem Speicher, waehrend Vite daneben
 * unbemerkt neue schickt.
 */
export function serviceWorkerAnmelden() {
  if (!('serviceWorker' in navigator)) return

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations()
      .then((alle) => Promise.all(alle.map((r) => r.unregister())))
      .catch(() => undefined)
    return
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Ohne die Sperre laedt Chrome zweimal, wenn zwei Fenster offen sind.
    if (ladeGerade) return
    ladeGerade = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((registrierung) => {
      if (registrierung.waiting && navigator.serviceWorker.controller) {
        melden(registrierung.waiting)
      }

      registrierung.addEventListener('updatefound', () => {
        const neu = registrierung.installing
        if (!neu) return
        neu.addEventListener('statechange', () => {
          // Ohne `controller` ist es die erste Installation ueberhaupt - dann
          // ist die Seite bereits die neueste, und ein Hinweis waere Unsinn.
          if (neu.state === 'installed' && navigator.serviceWorker.controller) melden(neu)
        })
      })

      // Der Browser sucht von sich aus selten nach einer neuen Fassung. Wer die
      // App als Symbol auf dem Telefon hat, schliesst sie nie - ohne diese
      // Nachfrage bliebe sie auf dem Stand des Installationstags stehen.
      const nachsehen = () => {
        if (document.visibilityState === 'visible') void registrierung.update().catch(() => undefined)
      }
      document.addEventListener('visibilitychange', nachsehen)
      window.setInterval(nachsehen, 60 * 60 * 1000)
    }).catch(() => undefined)
  })
}
