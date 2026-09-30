import type { BillingRow } from './api'

/**
 * Die Monatsuebersicht, angeordnet: je Kunde seine Projekte und seine Summe,
 * darunter die Summe ueber alle.
 *
 * Gerechnet wird hier nichts. Kunden- und Gesamtsumme stehen fertig in der
 * Sicht (v_billing_month); diese Funktion haengt nur die Zeilen der drei
 * Ebenen richtig zusammen und sortiert sie nach Namen.
 */
export interface KundeImMonat {
  summe: BillingRow
  projekte: BillingRow[]
}

export interface Monatsgliederung {
  kunden: KundeImMonat[]
  /** Fehlt, wenn im Monat nichts Abrechenbares liegt. */
  gesamt: BillingRow | null
}

const nachName = (a: string | null, b: string | null) =>
  (a ?? '').localeCompare(b ?? '', 'de')

export function gliedereMonat(rows: BillingRow[], customerId = ''): Monatsgliederung {
  const kunden = rows
    .filter((r) => r.level === 'customer' && (!customerId || r.customer_id === customerId))
    .sort((a, b) => nachName(a.customer_name, b.customer_name))
    .map((summe) => ({
      summe,
      projekte: rows
        .filter((r) => r.level === 'project' && r.customer_id === summe.customer_id)
        .sort((a, b) => nachName(a.project_name, b.project_name)),
    }))
  // Mit Kundenfilter ist die Gesamtsumme die Summe dieses einen Kunden; die
  // Gesamtzeile der Sicht gaelte dann fuer Kunden, die gar nicht zu sehen sind.
  const gesamt = customerId
    ? (kunden[0]?.summe ?? null)
    : (rows.find((r) => r.level === 'total') ?? null)
  return { kunden, gesamt }
}

/** Der Monatserste `delta` Monate weiter, als 'YYYY-MM-01'. */
export function verschiebeMonat(monthStart: string, delta: number): string {
  const [y, m] = monthStart.split('-').map(Number)
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Blattnamen: hoechstens 31 Zeichen, ohne die Zeichen, die Excel verbietet,
 * und eindeutig - zwei Kunden mit aehnlichem Kuerzel duerfen die Datei nicht
 * unlesbar machen.
 */
export function blattNamen(roh: string[]): string[] {
  const vergeben = new Set<string>(['übersicht'])
  return roh.map((wert) => {
    const basis = (wert.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Kunde').slice(0, 28)
    let name = basis
    for (let i = 2; vergeben.has(name.toLowerCase()); i++) name = `${basis} ${i}`
    vergeben.add(name.toLowerCase())
    return name
  })
}
