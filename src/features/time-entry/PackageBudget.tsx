import { BudgetStand } from '@/components/ui/BudgetBadge'
import { cn } from '@/lib/utils'
import { formatEuro } from '@/lib/format'
import { minutesToHours } from '@/lib/week'
import type { WorkPackageBudget } from '@/types/database'

/** Ganze Stunden ohne ",00": Budgets sind meist glatt, und jede Stelle zaehlt. */
const stunden = (wert: number) => `${minutesToHours(wert * 60).replace(',00', '')} h`

/** Ob ein Paket ueberhaupt ein Budget traegt. */
export const hatBudget = (budget: WorkPackageBudget | undefined) =>
  Boolean(budget && (budget.budget_hours || budget.budget_amount))

/**
 * Was auf ein Arbeitspaket gebucht ist, und wovon - "gebucht / gesamt".
 *
 * Die Stunden stehen immer da, auch ohne Budget: dass auf ein Paket schon
 * zwoelf Stunden gelaufen sind, ist beim Buchen die haeufigere Frage als die
 * nach einem Budget, das die meisten Pakete gar nicht haben. Ohne Budget gibt
 * es nur die eine Zahl - "12 h / -" waere ein Platzhalter fuer nichts.
 *
 * Gezaehlt wird ueber die gesamte Laufzeit des Pakets, nicht ueber die
 * angezeigte Woche: ein Budget kennt keine Woche, und die Frage "wie viel ist
 * da schon drauf" auch nicht.
 *
 * Der Betrag erscheint nur mit Betragsbudget - das Honorar ohne Bezug daneben
 * waere eine Zahl, die niemand einordnen kann.
 *
 * Gerechnet wird gegen dieselben Groessen wie in den Stammdaten: erfasste Zeit
 * gegen das Stundenbudget, Honorar gegen das Betragsbudget. Zwei Ansichten
 * derselben Zahl duerfen nicht verschieden rechnen.
 */
export function PackageBudget({
  budget, className,
}: { budget: WorkPackageBudget | undefined; className?: string }) {
  if (!budget) return null
  const gebucht = budget.tracked_minutes / 60

  return (
    <span className={cn('flex flex-wrap gap-x-4 gap-y-0.5', className)}>
      {budget.budget_hours
        ? <BudgetStand used={gebucht} budget={Number(budget.budget_hours)} format={stunden} />
        : (
          <span title={`Gebucht ${stunden(gebucht)}`}
                className="tabular text-xs whitespace-nowrap text-ink-500">
            {stunden(gebucht)}
          </span>
        )}
      {budget.budget_amount && (
        <BudgetStand used={Number(budget.fees)} budget={Number(budget.budget_amount)}
                     format={formatEuro} />
      )}
    </span>
  )
}

/**
 * Ein Arbeitspaket als abgesetztes Plaettchen, mit seinem Stand darin.
 *
 * In einer Liste aus Kuerzeln und Zahlen laesst sich sonst schwer sehen, wo ein
 * Paket aufhoert und das naechste anfaengt - "13206 DEV 2 h / 2 h 13834 2 h /
 * 16 h" ist eine Kette aus sieben Teilen, von denen vier Zahlen sind. Der
 * Rahmen trennt, was zusammengehoert.
 */
export function PaketChip({
  code, budget,
}: { code: string; budget?: WorkPackageBudget }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded border border-ink-200 bg-ink-50/70 px-1.5 py-0.5">
      <span className="text-xs font-medium text-ink-600">{code}</span>
      <PackageBudget budget={budget} />
    </span>
  )
}
