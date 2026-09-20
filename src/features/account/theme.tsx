import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from 'react'

/**
 * Darstellung: hell, dunkel oder dem Geraet folgen.
 *
 * Zwei Ablagen mit Absicht. localStorage entscheidet beim Start - schon bevor
 * React laeuft, siehe das kurze Skript in index.html; ohne das blitzt die helle
 * Fassung auf. app_settings in der Datenbank haelt dieselbe Wahl fuer alle
 * Geraete. Die Datenbank ist die Wahrheit, der Speicher des Browsers ihr Vorbote.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'Wie das Gerät',
  light: 'Hell',
  dark: 'Dunkel',
}

const SPEICHER = 'ze-theme'

export function istWahl(wert: unknown): wert is ThemeChoice {
  return wert === 'system' || wert === 'light' || wert === 'dark'
}

export function gespeicherteWahl(): ThemeChoice {
  try {
    const wert = localStorage.getItem(SPEICHER)
    return istWahl(wert) ? wert : 'system'
  } catch {
    return 'system'
  }
}

/** Setzt das Attribut, an dem die Farben in index.css haengen. */
export function anwenden(wahl: ThemeChoice) {
  const dunkel = wahl === 'dark'
    || (wahl === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dunkel ? 'dark' : 'light'
  statusleisteFaerben()
}

/**
 * Die Statusleiste der installierten App traegt die Farbe der Seite.
 *
 * Als Symbol auf dem Telefon gestartet, gibt es keine Adressleiste mehr - die
 * Flaeche darueber gehoert zur App. Steht dort der helle Wert, waehrend die
 * Seite dunkel ist, hat die App oben einen weissen Balken. Der Wert wird aus
 * der Variablen gelesen und nicht hier notiert: die Farben stehen in
 * index.css und sonst nirgends.
 */
function statusleisteFaerben() {
  const marke = document.querySelector('meta[name="theme-color"]')
  if (!marke) return
  const flaeche = getComputedStyle(document.documentElement).getPropertyValue('--ink-50').trim()
  if (flaeche) marke.setAttribute('content', flaeche)
}

type ThemeContextValue = {
  choice: ThemeChoice
  /** Wirkt sofort; das Sichern in der Datenbank uebernimmt die Kontoseite. */
  setChoice: (wahl: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(gespeicherteWahl)

  const setChoice = useCallback((wahl: ThemeChoice) => {
    setChoiceState(wahl)
    anwenden(wahl)
    try {
      localStorage.setItem(SPEICHER, wahl)
    } catch {
      // Privates Fenster oder gesperrter Speicher: die Wahl gilt dann nur,
      // solange die Seite offen ist. Kein Grund, hier abzubrechen.
    }
  }, [])

  // Beim Start hat das kurze Skript in index.html data-theme bereits gesetzt.
  // Die Farbe der Statusleiste kann es nicht kennen: zu dem Zeitpunkt ist noch
  // kein Stil geladen, aus dem sich --ink-50 lesen liesse. Einmal nachziehen.
  useEffect(() => { anwenden(choice) }, [choice])

  // Bei "Wie das Gerät" auf den Systemwechsel hoeren - sonst bliebe die Seite
  // hell, wenn das Telefon abends umschaltet.
  useEffect(() => {
    if (choice !== 'system') return
    const medien = window.matchMedia('(prefers-color-scheme: dark)')
    const beiWechsel = () => anwenden('system')
    medien.addEventListener('change', beiWechsel)
    return () => medien.removeEventListener('change', beiWechsel)
  }, [choice])

  return (
    <ThemeContext.Provider value={{ choice, setChoice }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const wert = useContext(ThemeContext)
  if (!wert) throw new Error('useTheme braucht einen ThemeProvider darueber')
  return wert
}
