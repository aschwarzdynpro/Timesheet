import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { addDays, toIsoDate } from '@/lib/week'
import type { ReportingPeriod, TimeEntryFull, TimeEntryInput } from '@/types/database'

const weekKey = (monday: string) => ['time-entries', 'week', monday] as const

/**
 * Alle Eintraege einer Woche, aus der angereicherten Sicht: die bringt Kunde,
 * Projekt, gueltigen Satz und Betrag bereits mit, sodass die Oberflaeche
 * nichts nachrechnen muss.
 */
export function useWeekEntries(monday: Date) {
  const from = toIsoDate(monday)
  const to = toIsoDate(addDays(monday, 6))

  return useQuery({
    queryKey: weekKey(from),
    queryFn: async (): Promise<TimeEntryFull[]> => {
      const { data, error } = await supabase
        .from('v_time_entries_full')
        .select('*')
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as TimeEntryFull[]
    },
  })
}

/** Perioden der Woche – daraus ergibt sich, ob ein Tag noch bearbeitbar ist. */
export function useWeekPeriods(monday: Date) {
  const from = toIsoDate(monday)
  const to = toIsoDate(addDays(monday, 6))

  return useQuery({
    queryKey: ['reporting-periods', from],
    queryFn: async (): Promise<ReportingPeriod[]> => {
      const { data, error } = await supabase
        .from('reporting_periods')
        .select('*')
        .lte('period_start', to)
        .gte('period_end', from)
      if (error) throw error
      return (data ?? []) as ReportingPeriod[]
    },
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['time-entries'] })
  void qc.invalidateQueries({ queryKey: ['reporting-periods'] })
}

export function useSaveTimeEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TimeEntryInput }) => {
      // billable_minutes und period_id setzt der Trigger. Wuerde die Oberflaeche
      // sie mitschicken, waere die Rundungsregel doppelt implementiert.
      const query = id
        ? supabase.from('time_entries').update(values).eq('id', id).select().single()
        : supabase.from('time_entries').insert(values).select().single()
      const { data, error } = await query
      if (error) throw error
      return data
    },
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('time_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(qc),
  })
}

/** Zuletzt verwendete Beschreibungen eines Projekts – als Eingabevorschlaege. */
export function useRecentDescriptions(projectId: string | null) {
  return useQuery({
    queryKey: ['recent-descriptions', projectId],
    enabled: Boolean(projectId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('description')
        .eq('project_id', projectId as string)
        .order('work_date', { ascending: false })
        .limit(50)
      if (error) throw error
      const seen = new Set<string>()
      for (const row of data ?? []) {
        const text = (row as { description: string }).description.trim()
        if (text) seen.add(text)
        if (seen.size >= 8) break
      }
      return [...seen]
    },
  })
}

/**
 * Der Satz, mit dem diese Kombination bewertet wuerde.
 *
 * Dieselbe Funktion, die auch der Trigger und die Auswertungssicht benutzen -
 * die Oberflaeche rechnet nichts nach, sie fragt. null heisst: fuer diese
 * Kombination steht kein Satz in der Historie, die Zeit waere 0,00 EUR wert.
 */
export function useRateFor(
  projectId: string | null, activityTypeId: string | null, onDate: string | null,
) {
  return useQuery({
    queryKey: ['rate-for', projectId, activityTypeId, onDate],
    enabled: Boolean(projectId && onDate),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc('fn_rate_for', {
        p_project_id: projectId,
        p_activity_type_id: activityTypeId,
        p_on_date: onDate,
      })
      if (error) throw error
      return data === null ? null : Number(data)
    },
  })
}
