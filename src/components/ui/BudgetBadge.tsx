import { cn } from '@/lib/utils'

export type BudgetStufe = 'good' | 'warning' | 'exhausted' | 'critical'

/**
 * Wie es um ein Budget steht.
 *
 * Vier Zustaende, weil "voll" und "zu voll" verschiedene Nachrichten sind: ein
 * punktgenau aufgebrauchtes Budget ist kein Fehler, sondern eine Punktlandung.
 * Beide in einen roten Topf zu werfen hiess, jede geschlossene Arbeit wie einen
 * Verstoss aussehen zu lassen.
 *
 * Die Toleranz ist die Genauigkeit der Anzeige: Angezeigt werden zwei
 * Nachkommastellen, und was auf 0,00 gerundet wird, ist aufgebraucht. Ohne das
 * stuende bei einem Rest von -0,001 h "Rest -0,00 h - ueberschritten" - eine
 * Ansage ueber nichts, entstanden aus Binaerbruechen.
 */
export function budgetStufe(used: number, budget: number): BudgetStufe {
  const rest = budget - used
  if (Math.abs(rest) < 0.005) return 'exhausted'
  if (rest < 0) return 'critical'
  return budget > 0 && used / budget >= 0.8 ? 'warning' : 'good'
}

const WORT: Record<BudgetStufe, string> = {
  good: 'im Rahmen',
  warning: 'knapp',
  exhausted: 'aufgebraucht',
  critical: 'überschritten',
}

/** Schrift zur Stufe. Aufgebraucht traegt dasselbe Gelb wie knapp - es ist die
    letzte Warnung vor der Grenze, nicht ihre Ueberschreitung. */
const SCHRIFT: Record<BudgetStufe, string> = {
  good: 'text-ink-400',
  warning: 'font-medium text-amber-700',
  exhausted: 'font-medium text-amber-700',
  critical: 'font-medium text-red-700',
}

/**
 * Budgetampel. Der Zustand steckt in Balken, Prozentzahl *und* Wort - nie
 * allein in der Farbe, sonst liest ihn niemand mit einer Farbsehschwaeche.
 *
 * Liegt in components/ui, weil sie an zwei Stellen gebraucht wird: bei den
 * Projekten in den Auswertungen und bei den Arbeitspaketen am Projekt.
 */
export function BudgetBadge({
  used, budget, unit,
}: { used: number; budget: number; unit?: string }) {
  // Erst multiplizieren, dann teilen: (used/budget)*100 liefert bei genau 127,5 %
  // im Binaerformat 127,49999… und rundet dann auf 127 ab.
  const pct = budget > 0 ? Math.round((used * 100) / budget) : 0
  const stufe = budgetStufe(used, budget)

  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-100">
        <span className={cn('block h-1.5 rounded-full',
                            stufe === 'critical' && 'bg-red-600',
                            (stufe === 'warning' || stufe === 'exhausted') && 'bg-amber-500',
                            stufe === 'good' && 'bg-emerald-600')}
              style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="tabular text-xs text-ink-600">{pct} %</span>
      {unit && <span className="tabular text-xs text-ink-400">{unit}</span>}
      <span className={cn('text-xs', SCHRIFT[stufe])}>{WORT[stufe]}</span>
    </span>
  )
}

/**
 * Der Stand eines Budgets als "Gebucht / Gesamt".
 *
 * Die Ampel darueber sagt dasselbe in Prozent und bleibt den Stammdaten
 * vorbehalten; beim Erfassen zaehlen die Stunden selbst.
 *
 * Ohne Worte um die Zahlen: "Gebucht 14,00 h von 16,00 h" braeche in der
 * schmalen Projektspalte um, "14 h / 16 h" passt in eine Zeile. Der Zustand
 * haengt trotzdem nicht allein an der Farbe - die Zahlen sagen ihn: gleich ist
 * aufgebraucht, groesser ist ueberschritten. Der volle Satz steht als `title`
 * daneben, fuer den Zeiger und fuer die Vorlesehilfe.
 */
export function BudgetStand({
  used, budget, format,
}: { used: number; budget: number; format: (wert: number) => string }) {
  const stufe = budgetStufe(used, budget)

  return (
    <span
      title={`Gebucht ${format(gebuchtStand(used, budget))} von ${format(budget)} · ${WORT[stufe]}`}
      className={cn('tabular text-xs whitespace-nowrap',
                    stufe === 'good' ? 'text-ink-500' : SCHRIFT[stufe])}
    >
      {budgetStandText(used, budget, format)}
    </span>
  )
}

/** Aufgebraucht heisst aufgebraucht: 1,9999 von 2 stuende sonst als "2 h / 2 h"
    da und leuchtete trotzdem gruen. */
const gebuchtStand = (used: number, budget: number) =>
  budgetStufe(used, budget) === 'exhausted' ? budget : used

/**
 * Dieselben zwei Zahlen als reiner Text, fuer Orte ohne Markup - eine
 * `<option>` etwa traegt Text und sonst nichts.
 *
 * Zwei Ansichten derselben Zahl duerfen nicht verschieden rechnen: die
 * Auswahlliste zeigt deshalb nicht "used / budget", sondern was auch im
 * Plaettchen steht.
 */
export function budgetStandText(
  used: number, budget: number, format: (wert: number) => string,
): string {
  return `${format(gebuchtStand(used, budget))} / ${format(budget)}`
}
