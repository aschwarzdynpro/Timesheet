import { BudgetRest } from '@/components/ui/BudgetBadge'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/format'
import { minutesToHours } from '@/lib/week'
import type { WorkPackageBudget } from '@/types/database'

/**
 * Das Restbudget eines Arbeitspakets, wie es in der Erfassung erscheint.
 *
 * Ein Paket kann ein Stunden- und ein Betragsbudget haben, eines von beiden
 * oder keines. Diese Entscheidung an drei Stellen zu wiederholen - Wochenraster,
 * Tagesliste, Editor - hiesse, sie dreimal richtig zu treffen; ohne Budget
 * kommt hier nichts, und die aufrufende Stelle muss nichts pruefen.
 *
 * Verbraucht wird gegen dieselben Groessen wie in den Stammdaten: erfasste Zeit
 * gegen das Stundenbudget, Honorar gegen das Betragsbudget. Zwei Ansichten
 * derselben Zahl duerfen nicht verschieden rechnen.
 */
/** Ganze Stunden ohne ",00": Budgets sind meist glatt, und jede Stelle zaehlt. */
const stunden = (wert: number) => `${minutesToHours(wert * 60).replace(',00', '')} h`

export function PackageBudget({
  budget, className,
}: { budget: WorkPackageBudget | undefined; className?: string }) {
  if (!budget || (!budget.budget_hours && !budget.budget_amount)) return null

  return (
    <span className={cn('flex flex-wrap gap-x-4 gap-y-0.5', className)}>
      {budget.budget_hours && (
        <BudgetRest used={budget.tracked_minutes / 60} budget={Number(budget.budget_hours)}
                    format={stunden} />
      )}
      {budget.budget_amount && (
        <BudgetRest used={Number(budget.fees)} budget={Number(budget.budget_amount)}
                    format={formatEuro} />
      )}
    </span>
  )
}
