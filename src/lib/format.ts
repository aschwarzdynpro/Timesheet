const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const decimal = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return euro.format(value)
}

export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return `${euro.format(value)} / h`
}

/** Minuten als Dezimalstunden – die Anzeige rechnet um, die Datenbank nicht. */
export function formatHours(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '–'
  return `${decimal.format(minutes / 60)} h`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)))
}

/** Gültigkeitszeitraum eines Stundensatzes, offenes Ende inklusive. */
export function formatValidity(from: string, to: string | null): string {
  return to ? `${formatDate(from)} – ${formatDate(to)}` : `ab ${formatDate(from)}`
}

export const today = (): string => new Date().toISOString().slice(0, 10)

export const CYCLE_LABEL = { weekly: 'wöchentlich', monthly: 'monatlich' } as const
export const ROUNDING_LABEL = { up: 'aufrunden', nearest: 'kaufmännisch', none: 'keine Rundung' } as const
export const STATUS_LABEL = { active: 'aktiv', paused: 'pausiert', closed: 'abgeschlossen' } as const
