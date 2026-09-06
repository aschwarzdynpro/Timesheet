/**
 * Wochen- und Datumslogik nach ISO-8601.
 *
 * Muss zwingend dasselbe liefern wie PostgreSQL: die Datenbank ordnet
 * Zeiteintraege ueber date_trunc('week', …) und EXTRACT(ISOYEAR/WEEK …) einer
 * Reporting-Periode zu. Weicht die Oberflaeche davon ab, zeigt sie eine andere
 * Woche an als die, in der gemeldet wird.
 *
 * Alles rechnet mit lokalen Datumsteilen, nie mit UTC-Umrechnung: ein
 * Leistungsdatum ist ein Kalendertag, kein Zeitpunkt.
 */

/** 'YYYY-MM-DD' – dasselbe Format, das Postgres fuer date verwendet. */
export type IsoDate = string

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Montag der Woche, in der das Datum liegt – wie date_trunc('week', …). */
export function mondayOf(date: Date): Date {
  const day = date.getDay() // 0 = Sonntag
  const diff = day === 0 ? -6 : 1 - day
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), diff)
}

/**
 * ISO-Kalenderwoche und ISO-Jahr.
 *
 * Die Regel: Der Donnerstag entscheidet, zu welchem Jahr eine Woche gehoert.
 * Deshalb liegt der 01.01.2027 (ein Freitag) noch in der KW 53 des Jahres 2026.
 */
export function isoWeek(date: Date): { year: number; week: number } {
  const thursday = addDays(mondayOf(date), 3)
  const firstThursday = (() => {
    const jan4 = new Date(thursday.getFullYear(), 0, 4)
    return addDays(mondayOf(jan4), 3)
  })()
  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return { year: thursday.getFullYear(), week }
}

/** Die sieben Tage einer Woche, Montag zuerst. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

export function isWeekend(date: Date): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

export function isToday(date: Date): boolean {
  return toIsoDate(date) === toIsoDate(new Date())
}

/* ------------------------------------------------------- Dauer und Anzeige */

/**
 * Dauereingabe in Minuten. Akzeptiert, was Leute tatsaechlich tippen:
 * "1,5" und "1.5" (Stunden), "1:30" (Stunden:Minuten), "90m" (Minuten),
 * "2h" (Stunden), "" (nichts).
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(',', '.')
  if (!text) return null

  const colon = text.match(/^(\d+):([0-5]?\d)$/)
  if (colon) return Number(colon[1]) * 60 + Number(colon[2])

  const minutes = text.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/)
  if (minutes) return Math.round(Number(minutes[1]))

  const hours = text.match(/^(\d+(?:\.\d+)?)\s*h?$/)
  if (hours) return Math.round(Number(hours[1]) * 60)

  return null
}

/** Minuten als Dezimalstunden mit deutschem Komma, ohne Einheit. */
export function minutesToHours(minutes: number): string {
  return (minutes / 60).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Kompakte Dauer fuer enge Zellen: "1:30" statt "1,50". */
export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
