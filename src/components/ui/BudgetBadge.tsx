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
 * Restbudget: was noch da ist, und wovon.
 *
 * Die Ampel darueber beantwortet "wie viel ist verbraucht" - das ist die Frage
 * der Stammdaten. Beim Erfassen zaehlt die andere Richtung: "wie viel kann ich
 * noch buchen". Deshalb steht hier der Rest vorn, und das Gesamtbudget
 * daneben, damit die Zahl einen Bezug hat.
 *
 * Der Zustand steht auch hier als Wort da und nicht nur in der Farbe.
 */
export function BudgetRest({
  used, budget, format,
}: { used: number; budget: number; format: (wert: number) => string }) {
  const stufe = budgetStufe(used, budget)
  // Aufgebraucht heisst aufgebraucht: ein Rest von -0,001 wuerde sonst als
  // "-0,00" dastehen, mit einem Minus, das nichts bedeutet.
  const rest = stufe === 'exhausted' ? 0 : budget - used

  return (
    <span className={cn('tabular text-xs',
                        stufe === 'good' ? 'text-ink-500' : SCHRIFT[stufe])}>
      Rest {format(rest)} von {format(budget)}
      {(stufe === 'exhausted' || stufe === 'critical') && ` · ${WORT[stufe]}`}
    </span>
  )
}
