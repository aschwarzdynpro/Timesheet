import { cn } from '@/lib/utils'

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
  const share = budget > 0 ? used / budget : 0
  // Erst multiplizieren, dann teilen: (used/budget)*100 liefert bei genau 127,5 %
  // im Binaerformat 127,49999… und rundet dann auf 127 ab.
  const pct = budget > 0 ? Math.round((used * 100) / budget) : 0
  const level = share >= 1 ? 'critical' : share >= 0.8 ? 'warning' : 'good'
  const label = level === 'critical' ? 'überschritten' : level === 'warning' ? 'knapp' : 'im Rahmen'

  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-100">
        <span className={cn('block h-1.5 rounded-full',
                            level === 'critical' && 'bg-red-600',
                            level === 'warning' && 'bg-amber-500',
                            level === 'good' && 'bg-emerald-600')}
              style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="tabular text-xs text-ink-600">{pct} %</span>
      {unit && <span className="tabular text-xs text-ink-400">{unit}</span>}
      <span className={cn('text-xs',
                          level === 'critical' && 'font-medium text-red-700',
                          level === 'warning' && 'font-medium text-amber-700',
                          level === 'good' && 'text-ink-400')}>
        {label}
      </span>
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
 * Der Zustand steht auch hier als Wort da und nicht nur in der Farbe. "0,00"
 * und "-2,50" sind verschiedene Nachrichten: aufgebraucht ist eine Punktlandung,
 * ueberschritten ist eine Ansage.
 */
export function BudgetRest({
  used, budget, format,
}: { used: number; budget: number; format: (wert: number) => string }) {
  const rest = budget - used
  const anteil = budget > 0 ? used / budget : 0
  const stufe = rest < 0 ? 'critical' : rest === 0 ? 'leer' : anteil >= 0.8 ? 'warning' : 'good'

  return (
    <span className={cn('tabular text-xs',
                        (stufe === 'critical' || stufe === 'leer') && 'font-medium text-red-700',
                        stufe === 'warning' && 'font-medium text-amber-700',
                        stufe === 'good' && 'text-ink-500')}>
      Rest {format(rest)} von {format(budget)}
      {stufe === 'critical' && ' · überschritten'}
      {stufe === 'leer' && ' · aufgebraucht'}
    </span>
  )
}
