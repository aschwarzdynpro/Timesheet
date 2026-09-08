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
