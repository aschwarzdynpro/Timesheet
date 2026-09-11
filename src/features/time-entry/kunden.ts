import type { TimeEntryFull } from '@/types/database'

/** Was an einem Tag auf einen Kunden entfaellt. */
export type KundenAnteil = { id: string; code: string; name: string; minuten: number }

/**
 * Die Summe einer Menge von Eintraegen, aufgeteilt nach Kunde - absteigend
 * nach Dauer.
 *
 * Steht hier und nicht in der Ansicht, weil drei Stellen dieselbe Antwort
 * brauchen: die Wochenleiste je Tag, die Zeile unter der Tagesueberschrift und
 * die Bloecke darunter. Dieselbe Rechnung an drei Stellen waere dreimal
 * dieselbe Gelegenheit, sie verschieden zu machen - so wie die Sperrlogik,
 * bevor sie in lock.ts wanderte.
 *
 * Der Grund fuer die Aufteilung: Wer an einem Tag fuer zwei Kunden bucht,
 * liest aus "16,00 h" nichts ab. Sechzehn Stunden sind ein Alarm oder eine
 * Selbstverstaendlichkeit, je nachdem, ob sie auf einen oder auf zwei Kunden
 * entfallen. Erst "HSO 8 · SYS 8" beantwortet die Frage, wegen der man
 * hinsieht.
 *
 * Sortiert nach Dauer und nicht nach Namen: Der groesste Anteil steht oben,
 * und bei gleicher Dauer entscheidet der Name - sonst haengt die Reihenfolge
 * daran, welcher Eintrag zufaellig zuerst gespeichert wurde.
 */
export function anteileJeKunde(entries: TimeEntryFull[]): KundenAnteil[] {
  const map = new Map<string, KundenAnteil>()
  for (const e of entries) {
    const vorhanden = map.get(e.customer_id)
    if (vorhanden) vorhanden.minuten += e.duration_minutes
    else map.set(e.customer_id, {
      id: e.customer_id, code: e.customer_code, name: e.customer_name,
      minuten: e.duration_minutes,
    })
  }
  return [...map.values()].sort(
    (a, b) => b.minuten - a.minuten || a.name.localeCompare(b.name, 'de'))
}
