import { toIsoDate } from '@/lib/week'

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

/**
 * Heutiges Datum als 'YYYY-MM-DD' nach lokaler Zeit.
 *
 * Bewusst nicht toISOString(): das rechnet nach UTC um und liefert in Berlin
 * zwischen Mitternacht und zwei Uhr noch den Vortag - ein Zeiteintrag landete
 * dann am falschen Tag und womoeglich in der falschen Meldeperiode.
 */
export const today = (): string => toIsoDate(new Date())

export const CYCLE_LABEL = { weekly: 'wöchentlich', monthly: 'monatlich' } as const
export const WEEK_START_LABEL = { monday: 'Montag', sunday: 'Sonntag' } as const
export const WEEK_START_SHORT = { monday: 'Mo', sunday: 'So' } as const
export const ROUNDING_LABEL = { up: 'aufrunden', nearest: 'kaufmännisch', none: 'keine Rundung' } as const
export const STATUS_LABEL = { active: 'aktiv', paused: 'pausiert', closed: 'abgeschlossen' } as const
