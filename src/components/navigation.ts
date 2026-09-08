import {
  BarChart3, Boxes, Building2, CalendarCheck, Clock3, Download, FolderKanban,
  Receipt, SlidersHorizontal, Tags, UserCog, Wallet,
} from 'lucide-react'

/**
 * Die Navigationsstruktur an einer Stelle.
 *
 * Sie wird an drei Orten gebraucht: in der Leiste (AppShell), auf der
 * Stammdatenseite als Kachelliste und in den Kopfzeilen der Unterseiten als
 * Rueckweg. Stuende sie dreimal da, waere ein neuer Bereich zweimal richtig
 * und einmal vergessen.
 */

export type NavEintrag = {
  to: string
  label: string
  icon: typeof Clock3
  /** Beschriftung in der schmalen Leiste unten, wenn der Name dort nicht passt. */
  kurz?: string
  /** Was den Bereich ausmacht - steht als Zeile unter der Kachel. */
  hint?: string
  /** Unterseiten: sie markieren denselben Eintrag als aktiv. */
  unter?: readonly string[]
}

/** Die fuenf Bereiche, die einmal eingerichtet werden. */
export const STAMMDATEN: NavEintrag[] = [
  { to: '/kunden', label: 'Kunden', icon: Building2,
    hint: 'Wer beauftragt, wie oft gemeldet und wie gerundet wird' },
  { to: '/projekte', label: 'Projekte', icon: FolderKanban,
    hint: 'Projekte mit ihren Sätzen und Arbeitspaketen' },
  { to: '/taetigkeiten', label: 'Tätigkeitsarten', icon: Tags,
    hint: 'Welcher Art die Arbeit ist — Beratung, Reise, intern' },
  { to: '/spesenarten', label: 'Spesenarten', icon: Wallet,
    hint: 'Was an Auslagen anfällt und mit welchem Aufschlag' },
  { to: '/einstellungen', label: 'Arbeitszeit', icon: SlidersHorizontal,
    hint: 'Sollzeit, Feiertage und Abwesenheiten' },
]

/** Was taeglich benutzt wird - schmal die feste Leiste am unteren Rand. */
export const TAEGLICH: NavEintrag[] = [
  { to: '/',             label: 'Zeiten',       icon: Clock3 },
  { to: '/spesen',       label: 'Spesen',       icon: Receipt },
  { to: '/auswertungen', label: 'Auswertungen', icon: BarChart3, kurz: 'Auswertung' },
  { to: '/perioden',     label: 'Perioden',     icon: CalendarCheck },
]

/** Seltener gebraucht: breit unter einem Strich, schmal hinter "Mehr". */
export const WEITER: NavEintrag[] = [
  { to: '/stammdaten', label: 'Stammdaten', icon: Boxes, unter: STAMMDATEN.map((s) => s.to) },
  { to: '/export',     label: 'Export',     icon: Download },
  { to: '/konto',      label: 'Konto',      icon: UserCog },
]

/** Der Rueckweg aus einem Stammdatenbereich, fuer `PageHeader`. */
export const ZU_STAMMDATEN = { to: '/stammdaten', label: 'Stammdaten' } as const

/**
 * Ein Pfad gehoert zu einem Eintrag, wenn er er selbst ist oder unter ihm liegt.
 *
 * Der einfache Praefixvergleich reicht nicht: `/spesenarten` faengt mit
 * `/spesen` an, und so leuchteten auf den Spesenarten beide Eintraege. Der
 * Schraegstrich macht daraus einen Vergleich ganzer Pfadabschnitte.
 */
function passt(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)
}

/**
 * Ohne die Unterseiten liesse eine Stammdatenseite die Leiste leer aussehen -
 * man wuesste dann weder, wo man ist, noch wohin zurueck.
 */
export function istAktiv(path: string, eintrag: NavEintrag | string) {
  const e = typeof eintrag === 'string' ? { to: eintrag } as NavEintrag : eintrag
  return passt(path, e.to) || (e.unter?.some((u) => passt(path, u)) ?? false)
}
