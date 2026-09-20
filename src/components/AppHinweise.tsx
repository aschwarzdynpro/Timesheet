import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { aktualisierungUebernehmen, aktualisierungVerfuegbar, beiAktualisierung } from '@/lib/pwa'

/**
 * Zwei Zustaende, die nur die installierte App kennt: kein Netz und eine neue
 * Fassung. Beide stehen ueber dem Inhalt, nicht als Blatt davor - sie halten
 * niemanden auf, sie erklaeren nur, warum gerade etwas nicht geht.
 */
export function AppHinweise() {
  return (
    <div className="mb-4 flex flex-col gap-2 empty:mb-0">
      <OhneNetz />
      <NeueFassung />
    </div>
  )
}

function netzAbonnieren(melden: () => void) {
  window.addEventListener('online', melden)
  window.addEventListener('offline', melden)
  return () => {
    window.removeEventListener('online', melden)
    window.removeEventListener('offline', melden)
  }
}

/** Auf dem Server gibt es kein `navigator` - der Wert dort ist "verbunden". */
export function useOnline() {
  return useSyncExternalStore(netzAbonnieren, () => navigator.onLine, () => true)
}

/**
 * Ohne Netz zeigt die App weiter, was zuletzt geladen wurde.
 *
 * Der Hinweis nennt die Folge, nicht den Zustand: gespeichert wird in der
 * Datenbank, und ohne Verbindung gibt es dort nichts zu speichern. Wer das
 * nicht weiss, tippt einen Eintrag ein und haelt ihn fuer gesichert.
 */
function OhneNetz() {
  const online = useOnline()
  if (online) return null

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Keine Verbindung. Vorhandenes bleibt lesbar; Neues lässt sich erst wieder
        speichern, wenn das Netz zurück ist.
      </span>
    </p>
  )
}

/**
 * Eine neue Fassung liegt bereit.
 *
 * Nicht von selbst neu laden: das Neuladen wirft weg, was gerade in einer
 * Zeile steht, und die Zeilen speichern erst beim Verlassen. Deshalb fragt
 * der Hinweis und wartet.
 */
function NeueFassung() {
  const [bereit, setBereit] = useState(aktualisierungVerfuegbar)
  const [laedt, setLaedt] = useState(false)

  useEffect(() => beiAktualisierung(() => setBereit(aktualisierungVerfuegbar())), [])

  const uebernehmen = useCallback(() => {
    setLaedt(true)
    aktualisierungUebernehmen()
  }, [])

  if (!bereit) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-accent-100 bg-accent-50 px-3 py-2 text-sm text-accent-700"
    >
      <RefreshCw className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">Eine neue Fassung der App ist geladen.</span>
      <Button size="sm" variant="primary" onClick={uebernehmen} disabled={laedt}>
        {laedt ? 'Wird geladen …' : 'Neu laden'}
      </Button>
    </div>
  )
}
