/**
 * Gesetzliche Feiertage in Deutschland, je Bundesland berechnet.
 *
 * Eine Bequemlichkeit, kein Rechtsdokument: die Liste deckt die landesweit
 * geltenden Tage ab. Regional begrenzte Feiertage fehlen bewusst, weil sie sich
 * nicht am Bundesland festmachen lassen - Mariae Himmelfahrt gilt in Bayern nur
 * in ueberwiegend katholischen Gemeinden, Fronleichnam in Sachsen und Thueringen
 * nur in einzelnen, das Augsburger Friedensfest nur in Augsburg. Wer davon
 * betroffen ist, traegt den Tag von Hand nach.
 */

import { addDays, toIsoDate, type IsoDate } from '@/lib/week'

export const BUNDESLAENDER = [
  { code: 'DE-BW', name: 'Baden-Württemberg' },
  { code: 'DE-BY', name: 'Bayern' },
  { code: 'DE-BE', name: 'Berlin' },
  { code: 'DE-BB', name: 'Brandenburg' },
  { code: 'DE-HB', name: 'Bremen' },
  { code: 'DE-HH', name: 'Hamburg' },
  { code: 'DE-HE', name: 'Hessen' },
  { code: 'DE-MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'DE-NI', name: 'Niedersachsen' },
  { code: 'DE-NW', name: 'Nordrhein-Westfalen' },
  { code: 'DE-RP', name: 'Rheinland-Pfalz' },
  { code: 'DE-SL', name: 'Saarland' },
  { code: 'DE-SN', name: 'Sachsen' },
  { code: 'DE-ST', name: 'Sachsen-Anhalt' },
  { code: 'DE-SH', name: 'Schleswig-Holstein' },
  { code: 'DE-TH', name: 'Thüringen' },
] as const

export type BundeslandCode = (typeof BUNDESLAENDER)[number]['code']

/**
 * Ostersonntag nach dem anonymen gregorianischen Verfahren.
 * Alle beweglichen Feiertage haengen daran.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/** Buss- und Bettag: der Mittwoch vor dem 23. November. */
function bussUndBettag(year: number): Date {
  const reference = new Date(year, 10, 23) // 23. November
  const daysBack = (reference.getDay() + 4) % 7 || 7
  return addDays(reference, -daysBack)
}

export interface Holiday {
  date: IsoDate
  name: string
}

/** Feiertage eines Jahres für ein Bundesland, aufsteigend nach Datum. */
export function holidaysFor(year: number, region: BundeslandCode): Holiday[] {
  const easter = easterSunday(year)
  const fixed = (month: number, day: number) => toIsoDate(new Date(year, month - 1, day))
  const fromEaster = (offset: number) => toIsoDate(addDays(easter, offset))

  const list: (Holiday & { regions?: BundeslandCode[] })[] = [
    { date: fixed(1, 1),        name: 'Neujahr' },
    { date: fixed(1, 6),        name: 'Heilige Drei Könige',   regions: ['DE-BW', 'DE-BY', 'DE-ST'] },
    { date: fixed(3, 8),        name: 'Internationaler Frauentag', regions: ['DE-BE', 'DE-MV'] },
    { date: fromEaster(-2),     name: 'Karfreitag' },
    { date: fromEaster(0),      name: 'Ostersonntag',          regions: ['DE-BB'] },
    { date: fromEaster(1),      name: 'Ostermontag' },
    { date: fixed(5, 1),        name: 'Tag der Arbeit' },
    { date: fromEaster(39),     name: 'Christi Himmelfahrt' },
    { date: fromEaster(49),     name: 'Pfingstsonntag',        regions: ['DE-BB'] },
    { date: fromEaster(50),     name: 'Pfingstmontag' },
    { date: fromEaster(60),     name: 'Fronleichnam',
      regions: ['DE-BW', 'DE-BY', 'DE-HE', 'DE-NW', 'DE-RP', 'DE-SL'] },
    { date: fixed(8, 15),       name: 'Mariä Himmelfahrt',     regions: ['DE-SL'] },
    { date: fixed(10, 3),       name: 'Tag der Deutschen Einheit' },
    { date: fixed(9, 20),       name: 'Weltkindertag',         regions: ['DE-TH'] },
    { date: fixed(10, 31),      name: 'Reformationstag',
      regions: ['DE-BB', 'DE-HB', 'DE-HH', 'DE-MV', 'DE-NI', 'DE-SN', 'DE-ST', 'DE-SH', 'DE-TH'] },
    { date: fixed(11, 1),       name: 'Allerheiligen',
      regions: ['DE-BW', 'DE-BY', 'DE-NW', 'DE-RP', 'DE-SL'] },
    { date: toIsoDate(bussUndBettag(year)), name: 'Buß- und Bettag', regions: ['DE-SN'] },
    { date: fixed(12, 25),      name: '1. Weihnachtstag' },
    { date: fixed(12, 26),      name: '2. Weihnachtstag' },
  ]

  return list
    .filter((h) => !h.regions || h.regions.includes(region))
    .map(({ date, name }) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
