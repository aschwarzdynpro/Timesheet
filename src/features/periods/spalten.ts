import { profileDesKunden, type ExportProfile } from '@/features/export/api'
import { DEFAULT_COLUMNS, type ColumnKey } from '@/features/export/columns'

/**
 * Die Wahl "ohne Profil". Der leere Wert, weil er im Auswahlfeld steht und ein
 * Profil nie eine leere Kennung hat.
 */
export const OHNE_PROFIL = ''

/**
 * Das Spaltenbild, mit dem eine Periode angezeigt und gemeldet wird.
 *
 * `wahl` ist die Kennung des im Unterraster gewaehlten Profils; `undefined`
 * heisst, dass noch niemand gewaehlt hat. Dann gilt das erste Profil des
 * Kunden - dasselbe, das der Nachweis schon vorher nahm. Wer von Hand
 * "Standard" waehlt, bekommt `null` und damit die Voreinstellung des Exports.
 *
 * Ein Profil, das es nicht mehr gibt - geloescht oder einem anderen Kunden
 * zugeschlagen, waehrend die Zeile offen stand -, faellt auf das erste Profil
 * des Kunden zurueck. Eine leere Tabelle waere die schlechtere Antwort auf
 * eine Kennung, die ins Leere zeigt.
 */
export function profilDerPeriode(
  profiles: ExportProfile[] | undefined, customerId: string, wahl: string | undefined,
): ExportProfile | null {
  const eigene = profileDesKunden(profiles, customerId)
  if (wahl === OHNE_PROFIL) return null
  if (wahl === undefined) return eigene[0] ?? null
  return eigene.find((p) => p.id === wahl) ?? eigene[0] ?? null
}

/**
 * Die Spalten dieses Profils - oder die Voreinstellung, wenn keines gilt.
 *
 * Steht hier und nicht zweimal in der Seite, weil Unterraster und Nachweis
 * dieselbe Folge brauchen: Das Raster ist die Vorschau der Datei, und eine
 * Vorschau, die etwas anderes zeigt als die Datei daneben, ist schlimmer als
 * keine.
 */
export function spaltenDerPeriode(profil: ExportProfile | null): ColumnKey[] {
  return profil?.columns?.length ? profil.columns : DEFAULT_COLUMNS
}
