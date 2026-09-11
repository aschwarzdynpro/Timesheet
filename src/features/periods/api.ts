import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ExpenseFull, PeriodEvent, ReportingPeriod, TimeEntryFull } from '@/types/database'

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

/**
 * Die Eintraege einer Periode – die Positionen, die gemeldet werden.
 *
 * Als Beschreibung und nicht nur als Hook, weil der Nachweis dieselben Zeilen
 * auf Knopfdruck braucht: `fetchQuery` mit derselben Beschreibung liest sie aus
 * dem Zwischenspeicher, wenn die Periode ohnehin aufgeklappt war, und holt sie
 * sonst nach. Zwei getrennte Abfragen waeren zwei Wahrheiten.
 */
export function periodEntriesQuery(periodId: string) {
  return {
    queryKey: ['period-entries', periodId] as const,
    queryFn: async (): Promise<TimeEntryFull[]> => {
      const { data, error } = await supabase
        .from('v_time_entries_full')
        .select('*')
        .eq('period_id', periodId)
        .order('work_date')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as TimeEntryFull[]
    },
  }
}

export function usePeriodEntries(periodId: string | null) {
  return useQuery({
    ...periodEntriesQuery(periodId ?? ''),
    enabled: Boolean(periodId),
  })
}

/**
 * Die Spesen einer Periode. Sie laufen durch dieselbe Periode und Sperre wie
 * die Zeiten und gehoeren deshalb in denselben Nachweis - als eigenes Blatt,
 * weil ein Betrag nicht in eine Spalte gehoert, die Stunden zaehlt.
 */
export function periodExpensesQuery(periodId: string) {
  return {
    queryKey: ['period-expenses', periodId] as const,
    queryFn: async (): Promise<ExpenseFull[]> => {
      const { data, error } = await supabase
        .from('v_expenses_full')
        .select('*')
        .eq('period_id', periodId)
        .order('expense_date')
      if (error) throw error
      return (data ?? []) as ExpenseFull[]
    },
  }
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
      void qc.invalidateQueries({ queryKey: ['period-events'] })
      void qc.invalidateQueries({ queryKey: ['time-entries'] })
      void qc.invalidateQueries({ queryKey: ['report'] })
    },
  })
}

/** Was mit dieser Periode schon passiert ist - gemeldet, zurueckgenommen. */
export function usePeriodEvents(periodId: string | null) {
  return useQuery({
    queryKey: ['period-events', periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<PeriodEvent[]> => {
      const { data, error } = await supabase
        .from('period_events')
        .select('*')
        .eq('period_id', periodId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PeriodEvent[]
    },
  })
}

/**
 * Meldung zuruecknehmen. Auch das gehoert in die Datenbank: Status, Saetze,
 * Summen und der Protokolleintrag muessen zusammen fallen oder gar nicht.
 */
export function useReopenPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ periodId, note }: { periodId: string; note?: string }) => {
      const { data, error } = await supabase.rpc('fn_reopen_period', {
        p_period_id: periodId,
        p_note: note?.trim() || null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periods'] })
      void qc.invalidateQueries({ queryKey: ['period-entries'] })
      void qc.invalidateQueries({ queryKey: ['period-events'] })
      void qc.invalidateQueries({ queryKey: ['time-entries'] })
      void qc.invalidateQueries({ queryKey: ['report'] })
    },
  })
}
