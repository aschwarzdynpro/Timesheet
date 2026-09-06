import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ReportingPeriod, TimeEntryFull } from '@/types/database'

export interface PeriodWithTotals extends ReportingPeriod {
  /** Aus den Eintraegen berechnet, solange die Periode noch offen ist. */
  live_minutes: number
  live_fees: number
  entry_count: number
}

/**
 * Alle Perioden mit ihren Summen.
 *
 * Eine gemeldete Periode traegt ihre Summen selbst: sie wurden beim Freigeben
 * zusammen mit dem Satz eingefroren. Eine offene rechnet live aus den
 * Eintraegen - dort kann sich noch etwas aendern.
 */
export function usePeriods() {
  return useQuery({
    queryKey: ['periods'],
    queryFn: async (): Promise<PeriodWithTotals[]> => {
      const [periods, entries] = await Promise.all([
        supabase.from('reporting_periods').select('*').order('period_start', { ascending: false }),
        supabase.from('v_time_entries_full').select('period_id, billable_minutes, amount'),
      ])
      if (periods.error) throw periods.error
      if (entries.error) throw entries.error

      const live = new Map<string, { minutes: number; fees: number; count: number }>()
      for (const e of (entries.data ?? []) as Pick<TimeEntryFull,
                        'period_id' | 'billable_minutes' | 'amount'>[]) {
        if (!e.period_id) continue
        const cur = live.get(e.period_id) ?? { minutes: 0, fees: 0, count: 0 }
        cur.minutes += Number(e.billable_minutes ?? 0)
        cur.fees += Number(e.amount ?? 0)
        cur.count += 1
        live.set(e.period_id, cur)
      }

      return ((periods.data ?? []) as ReportingPeriod[]).map((p) => {
        const l = live.get(p.id)
        return {
          ...p,
          live_minutes: p.status === 'open' ? (l?.minutes ?? 0) : (p.total_minutes ?? 0),
          live_fees: p.status === 'open' ? (l?.fees ?? 0) : Number(p.total_fees ?? 0),
          entry_count: l?.count ?? 0,
        }
      })
    },
  })
}

/** Die Eintraege einer Periode – die Positionen, die gemeldet werden. */
export function usePeriodEntries(periodId: string | null) {
  return useQuery({
    queryKey: ['period-entries', periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<TimeEntryFull[]> => {
      const { data, error } = await supabase
        .from('v_time_entries_full')
        .select('*')
        .eq('period_id', periodId as string)
        .order('work_date')
      if (error) throw error
      return (data ?? []) as TimeEntryFull[]
    },
  })
}

/**
 * Freigeben. Die gesamte Arbeit steckt in der Datenbankfunktion: Saetze
 * einfrieren, Summen schreiben, Status setzen - in einer Transaktion. Die
 * Oberflaeche reicht nur die Periode durch.
 */
export function useSubmitPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await supabase.rpc('fn_submit_period', { p_period_id: periodId })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods'] })
      void qc.invalidateQueries({ queryKey: ['period-entries'] })
      void qc.invalidateQueries({ queryKey: ['time-entries'] })
      void qc.invalidateQueries({ queryKey: ['report'] })
    },
  })
}
