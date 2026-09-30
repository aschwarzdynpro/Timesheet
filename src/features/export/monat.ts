import type { BillingRow } from './api'

/**
 * Die Monatsuebersicht, angeordnet: je Kunde seine Projekte und seine Summe,
 * je Projekt seine Arbeitspakete, darunter die Summe ueber alle.
 *
 * Gerechnet wird hier nichts. Alle Summen stehen fertig in der Sicht
 * (v_billing_month); diese Funktion haengt nur die Zeilen der vier Ebenen
 * richtig zusammen und sortiert sie nach Namen.
 */
export interface ProjektImMonat {
  summe: BillingRow
  /** Zeit ohne Arbeitspaket steht als eigene Zeile am Ende. */
  pakete: BillingRow[]
}

export interface KundeImMonat {
  summe: BillingRow
  projekte: ProjektImMonat[]
}

export interface Monatsgliederung {
  kunden: KundeImMonat[]
  /** Fehlt, wenn im Monat nichts Abrechenbares liegt. */
  gesamt: BillingRow | null
}

const nachName = (a: string | null, b: string | null) =>
  (a ?? '').localeCompare(b ?? '', 'de')

/** Pakete nach Kuerzel; "ohne Arbeitspaket" zuletzt, es ist der Rest. */
const nachPaket = (a: BillingRow, b: BillingRow) =>
  a.work_package_id === null ? 1
    : b.work_package_id === null ? -1
      : nachName(a.work_package_code, b.work_package_code)

export function gliedereMonat(rows: BillingRow[], customerId = ''): Monatsgliederung {
  const kunden = rows
    .filter((r) => r.level === 'customer' && (!customerId || r.customer_id === customerId))
    .sort((a, b) => nachName(a.customer_name, b.customer_name))
    .map((summe) => ({
      summe,
      projekte: rows
        .filter((r) => r.level === 'project' && r.customer_id === summe.customer_id)
        .sort((a, b) => nachName(a.project_name, b.project_name))
        .map((projekt) => ({
          summe: projekt,
          pakete: rows
            .filter((r) => r.level === 'work_package' && r.project_id === projekt.project_id)
            .sort(nachPaket),
        })),
    }))
  // Mit Kundenfilter ist die Gesamtsumme die Summe dieses einen Kunden; die
  // Gesamtzeile der Sicht gaelte dann fuer Kunden, die gar nicht zu sehen sind.
  const gesamt = customerId
    ? (kunden[0]?.summe ?? null)
    : (rows.find((r) => r.level === 'total') ?? null)
  return { kunden, gesamt }
}

/**
 * Ob sich das Aufklappen lohnt: erst, wenn mindestens ein echtes Paket
 * bebucht ist. Stuende darunter nur "ohne Arbeitspaket", wiederholte die
 * Zeile nur die Zahlen des Projekts.
 */
export function hatPakete(projekt: ProjektImMonat): boolean {
  return projekt.pakete.some((p) => p.work_package_id !== null)
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
