import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Auswertungen lesen ausschliesslich die vorbereiteten Sichten. Die Datenbank
 * hat Satz, Rundung und Bewertung bereits angewendet; die Oberflaeche summiert
 * nur noch, was ohnehin zusammengehoert.
 */

export interface ReportRow {
  owner_id: string
  customer_id: string
  customer_name: string
  project_id: string
  project_name: string
  minutes_tracked: number
  minutes_billable: number
  minutes_internal: number | null
  fees: number
}

export interface WeekRow extends ReportRow {
  iso_year: number
  iso_week: number
  week_start: string
}

export interface MonthRow extends ReportRow {
  year: number
  month_start: string
}

export interface YearRow extends ReportRow {
  year: number
}

export type Resolution = 'week' | 'month'

/** Verlauf eines Jahres, wahlweise nach Kalenderwoche oder Monat. */
export function useTrend(year: number, resolution: Resolution) {
  return useQuery({
    queryKey: ['report', resolution, year],
    queryFn: async (): Promise<(WeekRow | MonthRow)[]> => {
      if (resolution === 'week') {
        const { data, error } = await supabase
          .from('v_report_week')
          .select('*')
          .eq('iso_year', year)
          .order('iso_week')
        if (error) throw error
        return (data ?? []) as WeekRow[]
      }
      const { data, error } = await supabase
        .from('v_report_month')
        .select('*')
        .eq('year', year)
        .order('month_start')
      if (error) throw error
      return (data ?? []) as MonthRow[]
    },
  })
}

/** Alle Jahre – fuer den Jahresvergleich und die Jahresauswahl. */
export function useYears() {
  return useQuery({
    queryKey: ['report', 'year'],
    queryFn: async (): Promise<YearRow[]> => {
      const { data, error } = await supabase.from('v_report_year').select('*').order('year')
      if (error) throw error
      return (data ?? []) as YearRow[]
    },
  })
}

/**
 * Sollarbeitszeit im Zeitraum, abzueglich Feiertagen und Abwesenheiten.
 * Liefert 0, solange kein Arbeitszeitmodell hinterlegt ist – dann bleibt die
 * Auslastungsquote aus, statt eine erfundene Zahl zu zeigen.
 */
export function useTargetMinutes(from: string, to: string) {
  return useQuery({
    queryKey: ['target-minutes', from, to],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_target_minutes', { p_from: from, p_to: to })
      if (error) throw error
      return Number(data ?? 0)
    },
  })
}
