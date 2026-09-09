import type { ReportingPeriod } from '@/types/database'
import { toIsoDate } from '@/lib/week'

/**
 * Die gesperrten Tage je Kunde: alles, was in einer nicht mehr offenen Periode
 * liegt.
 *
 * Steht hier und nicht zweimal in den Ansichten: Raster und Tagesansicht muessen
 * dieselbe Antwort geben, sonst boete die eine ein Eingabefeld an, wo die andere
 * ein Schloss zeigt. Die Sperre selbst ist ein Trigger in der Datenbank - das
 * hier ist nur, was die Oberflaeche davon vorwegnehmen kann.
 */
export function gesperrteTage(periods: ReportingPeriod[], days: Date[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const p of periods) {
    if (p.status === 'open') continue
    const set = map.get(p.customer_id) ?? new Set<string>()
    for (const day of days) {
      const iso = toIsoDate(day)
      if (iso >= p.period_start && iso <= p.period_end) set.add(iso)
    }
    map.set(p.customer_id, set)
  }
  return map
}
